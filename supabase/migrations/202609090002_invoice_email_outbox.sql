create table if not exists public.invoice_email_outbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arklake_accounts(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null check (event_type in ('invoice_created', 'invoice_paid')),
  recipient_email text not null check (position('@' in recipient_email) > 1),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, event_type)
);

create index if not exists invoice_email_outbox_retry_idx
  on public.invoice_email_outbox (account_id, status, next_attempt_at);

alter table public.invoice_email_outbox enable row level security;
revoke all on table public.invoice_email_outbox from public, anon, authenticated;
grant select, insert, update on table public.invoice_email_outbox to service_role;

create or replace function public.enqueue_created_invoice_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.invoice_email_outbox (account_id, invoice_id, event_type, recipient_email)
  values (new.account_id, new.id, 'invoice_created', new.payer_email)
  on conflict (invoice_id, event_type) do nothing;
  return new;
end;
$$;

revoke all on function public.enqueue_created_invoice_email() from public, anon, authenticated;

drop trigger if exists invoices_enqueue_created_email on public.invoices;
create trigger invoices_enqueue_created_email
after insert on public.invoices
for each row execute function public.enqueue_created_invoice_email();

create or replace function public.claim_invoice_email_jobs(p_account_id uuid, p_limit integer default 10)
returns setof public.invoice_email_outbox
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select id
    from public.invoice_email_outbox
    where account_id = p_account_id
      and (
        (status in ('pending', 'failed') and next_attempt_at <= now())
        or (status = 'sending' and updated_at <= now() - interval '5 minutes')
      )
    order by created_at
    for update skip locked
    limit greatest(1, least(p_limit, 10))
  )
  update public.invoice_email_outbox as outbox
  set status = 'sending', attempts = outbox.attempts + 1, updated_at = now()
  from candidates
  where outbox.id = candidates.id
  returning outbox.*;
$$;

revoke all on function public.claim_invoice_email_jobs(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_invoice_email_jobs(uuid, integer) to service_role;

create or replace function public.mark_verified_invoice_paid(
  p_invoice_id uuid,
  p_tx_hash text,
  p_recipient_address text,
  p_amount numeric,
  p_asset text,
  p_paid_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.invoices%rowtype;
  linked_activity_id uuid;
begin
  select * into target from public.invoices where id = p_invoice_id for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  if target.status = 'paid' then
    if target.payment_tx_hash = p_tx_hash then
      return jsonb_build_object('result', 'idempotent', 'paid_at', target.paid_at, 'payment_activity_id', target.payment_activity_id);
    end if;
    return jsonb_build_object('result', 'already_paid');
  end if;

  if target.status not in ('active', 'expired') then
    return jsonb_build_object('result', 'expired');
  end if;

  if target.status = 'active' and target.expires_at <= now() then
    update public.invoices set status = 'expired', updated_at = now() where id = target.id;
    target.status := 'expired';
  end if;

  if lower(target.receiving_wallet_address) <> lower(p_recipient_address)
    or target.amount <> p_amount or target.asset <> p_asset then
    return jsonb_build_object('result', 'snapshot_changed');
  end if;

  if p_paid_at < target.created_at or p_paid_at > target.expires_at then
    return jsonb_build_object('result', case when target.status = 'expired' then 'expired' else 'snapshot_changed' end);
  end if;

  if exists (select 1 from public.invoices where payment_tx_hash = p_tx_hash and id <> target.id) then
    return jsonb_build_object('result', 'tx_reused');
  end if;

  select id into linked_activity_id
  from public.wallet_activities
  where account_id = target.account_id
    and circle_wallet_id = target.receiving_circle_wallet_id
    and blockchain = 'ARC-TESTNET'
    and lower(tx_hash) = p_tx_hash
    and status = 'confirmed'
  order by confirmed_at desc nulls last
  limit 1;

  begin
    update public.invoices
    set status = 'paid', paid_at = p_paid_at, payment_tx_hash = p_tx_hash,
      payment_activity_id = linked_activity_id, updated_at = now()
    where id = target.id;
  exception when unique_violation then
    return jsonb_build_object('result', 'tx_reused');
  end;

  insert into public.invoice_email_outbox (account_id, invoice_id, event_type, recipient_email)
  values (target.account_id, target.id, 'invoice_paid', target.payer_email)
  on conflict (invoice_id, event_type) do nothing;

  select * into target from public.invoices where id = target.id;
  return jsonb_build_object('result', 'paid', 'paid_at', target.paid_at, 'payment_activity_id', target.payment_activity_id);
end;
$$;

revoke all on function public.mark_verified_invoice_paid(uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_verified_invoice_paid(uuid, text, text, numeric, text, timestamptz) to service_role;
