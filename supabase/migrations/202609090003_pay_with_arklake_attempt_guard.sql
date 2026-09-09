alter table public.invoice_payment_intents
  drop constraint if exists invoice_payment_intents_status_check;

alter table public.invoice_payment_intents
  add constraint invoice_payment_intents_status_check
  check (status in ('created', 'submitting', 'submitted', 'confirming', 'paid', 'failed', 'expired'));

alter table public.invoice_payment_intents
  add column if not exists payment_rail text not null default 'generic'
    check (payment_rail in ('generic', 'arklake')),
  add column if not exists payer_wallet_id uuid,
  add column if not exists circle_idempotency_key uuid not null default gen_random_uuid(),
  add column if not exists circle_challenge_id uuid,
  add column if not exists circle_transaction_id uuid;

create unique index if not exists invoice_payment_intents_circle_idempotency_unique
  on public.invoice_payment_intents (circle_idempotency_key);
create unique index if not exists invoice_payment_intents_circle_challenge_unique
  on public.invoice_payment_intents (circle_challenge_id) where circle_challenge_id is not null;
create unique index if not exists invoice_payment_intents_circle_transaction_unique
  on public.invoice_payment_intents (circle_transaction_id) where circle_transaction_id is not null;
create unique index if not exists invoice_payment_intents_one_unresolved_arklake
  on public.invoice_payment_intents (invoice_id)
  where payment_rail = 'arklake' and status in ('submitting', 'submitted', 'confirming');

create or replace function public.start_arklake_invoice_payment_intent(
  p_intent_id uuid,
  p_public_token_hash text,
  p_wallet_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.invoice_payment_intents%rowtype;
  target_invoice public.invoices%rowtype;
begin
  select * into target from public.invoice_payment_intents where id = p_intent_id for update;
  if not found or target.public_token_hash <> p_public_token_hash or target.payment_rail <> 'arklake' then
    return jsonb_build_object('result', 'not_found');
  end if;
  select * into target_invoice from public.invoices where id = target.invoice_id for update;
  if target.status in ('submitting', 'submitted', 'confirming') and target.payer_wallet_id = p_wallet_id then
    return jsonb_build_object('result', 'idempotent', 'idempotency_key', target.circle_idempotency_key);
  end if;
  if target.status <> 'created' or target.expires_at <= now()
    or target_invoice.status <> 'active' or target_invoice.expires_at <= now() then
    return jsonb_build_object('result', 'unavailable');
  end if;
  begin
    update public.invoice_payment_intents
      set status = 'submitting', payer_wallet_id = p_wallet_id, updated_at = now()
      where id = target.id;
  exception when unique_violation then
    return jsonb_build_object('result', 'already_in_progress');
  end;
  return jsonb_build_object('result', 'started', 'idempotency_key', target.circle_idempotency_key);
end;
$$;

create or replace function public.record_arklake_invoice_payment_challenge(
  p_intent_id uuid,
  p_public_token_hash text,
  p_challenge_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare target public.invoice_payment_intents%rowtype;
begin
  select * into target from public.invoice_payment_intents where id = p_intent_id for update;
  if not found or target.public_token_hash <> p_public_token_hash or target.payment_rail <> 'arklake' then
    return jsonb_build_object('result', 'not_found');
  end if;
  if target.circle_challenge_id is not null and target.circle_challenge_id <> p_challenge_id then
    return jsonb_build_object('result', 'already_bound');
  end if;
  update public.invoice_payment_intents
    set circle_challenge_id = p_challenge_id, status = 'submitted', updated_at = now()
    where id = target.id and status in ('submitting', 'submitted', 'confirming');
  return jsonb_build_object('result', 'recorded');
end;
$$;

create or replace function public.fail_arklake_invoice_payment_intent(
  p_intent_id uuid,
  p_public_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoice_payment_intents
    set status = 'failed', updated_at = now()
    where id = p_intent_id and public_token_hash = p_public_token_hash
      and payment_rail = 'arklake' and status in ('submitting', 'submitted', 'confirming');
  return jsonb_build_object('result', case when found then 'failed' else 'not_found' end);
end;
$$;

revoke all on function public.start_arklake_invoice_payment_intent(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.record_arklake_invoice_payment_challenge(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.fail_arklake_invoice_payment_intent(uuid, text) from public, anon, authenticated;
grant execute on function public.start_arklake_invoice_payment_intent(uuid, text, uuid) to service_role;
grant execute on function public.record_arklake_invoice_payment_challenge(uuid, text, uuid) to service_role;
grant execute on function public.fail_arklake_invoice_payment_intent(uuid, text) to service_role;
