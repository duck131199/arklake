create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.expire_due_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer;
begin
  update public.invoices
  set status = 'expired', updated_at = now()
  where status = 'active' and expires_at <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.expire_due_invoices() from public, anon, authenticated;
grant execute on function public.expire_due_invoices() to service_role;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'arklake-expire-due-invoices'
  ) then
    perform cron.schedule(
      'arklake-expire-due-invoices',
      '* * * * *',
      'select public.expire_due_invoices();'
    );
  end if;
end;
$$;

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

  select * into target from public.invoices where id = target.id;
  return jsonb_build_object('result', 'paid', 'paid_at', target.paid_at, 'payment_activity_id', target.payment_activity_id);
end;
$$;

revoke all on function public.mark_verified_invoice_paid(uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.mark_verified_invoice_paid(uuid, text, text, numeric, text, timestamptz) to service_role;
