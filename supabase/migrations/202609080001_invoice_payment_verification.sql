alter table public.invoices
  add column if not exists payment_tx_hash text;

alter table public.invoices
  drop constraint if exists invoices_payment_tx_hash_format,
  add constraint invoices_payment_tx_hash_format check (
    payment_tx_hash is null or (
      payment_tx_hash = lower(payment_tx_hash)
      and payment_tx_hash ~ '^0x[0-9a-f]{64}$'
    )
  );

create unique index if not exists invoices_payment_tx_hash_unique
  on public.invoices (payment_tx_hash)
  where payment_tx_hash is not null;

alter table public.invoices
  drop constraint if exists invoices_paid_verification;

alter table public.invoices
  add constraint invoices_paid_verification check (
    (status = 'paid' and paid_at is not null and payment_tx_hash is not null)
    or (status in ('active', 'expired') and paid_at is null and payment_activity_id is null and payment_tx_hash is null)
  );

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

  if target.status <> 'active' or target.expires_at <= now() then
    if target.status = 'active' then
      update public.invoices set status = 'expired', updated_at = now() where id = target.id;
    end if;
    return jsonb_build_object('result', 'expired');
  end if;

  if lower(target.receiving_wallet_address) <> lower(p_recipient_address)
    or target.amount <> p_amount or target.asset <> p_asset
    or p_paid_at < target.created_at or p_paid_at > target.expires_at then
    return jsonb_build_object('result', 'snapshot_changed');
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

  select * into target from public.invoices where id = target.id;
  return jsonb_build_object('result', 'paid', 'paid_at', target.paid_at, 'payment_activity_id', target.payment_activity_id);
end;
$$;

revoke all on function public.mark_verified_invoice_paid(uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_verified_invoice_paid(uuid, text, text, numeric, text, timestamptz) to service_role;
