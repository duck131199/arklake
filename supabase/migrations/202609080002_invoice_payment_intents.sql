create table if not exists public.invoice_payment_intents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  public_token_hash text not null unique check (public_token_hash ~ '^[0-9a-f]{64}$'),
  receiving_wallet_address text not null check (receiving_wallet_address ~ '^0x[0-9a-f]{40}$'),
  amount numeric not null check (amount > 0),
  asset text not null check (asset = 'USDC'),
  chain_id bigint not null check (chain_id = 5042002),
  status text not null default 'created' check (status in ('created', 'submitted', 'confirming', 'paid', 'failed', 'expired')),
  tx_hash text check (tx_hash is null or (tx_hash = lower(tx_hash) and tx_hash ~ '^0x[0-9a-f]{64}$')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoice_payment_intents_tx_hash_unique
  on public.invoice_payment_intents (tx_hash) where tx_hash is not null;
create index if not exists invoice_payment_intents_invoice_created_idx
  on public.invoice_payment_intents (invoice_id, created_at desc);

alter table public.invoice_payment_intents enable row level security;
revoke all on table public.invoice_payment_intents from public, anon, authenticated;
grant select, insert, update on table public.invoice_payment_intents to service_role;

create or replace function public.bind_invoice_payment_intent_tx(
  p_intent_id uuid,
  p_public_token_hash text,
  p_tx_hash text
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
  if not found or target.public_token_hash <> p_public_token_hash then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into target_invoice from public.invoices where id = target.invoice_id for update;
  if target.status = 'paid' and target.tx_hash = p_tx_hash then
    return jsonb_build_object('result', 'idempotent', 'invoice_id', target.invoice_id);
  end if;
  if target.status not in ('created', 'submitted', 'confirming') or target.expires_at <= now()
    or target_invoice.status <> 'active' or target_invoice.expires_at <= now() then
    update public.invoice_payment_intents set status = 'expired', updated_at = now()
      where id = target.id and status <> 'paid';
    return jsonb_build_object('result', 'expired');
  end if;
  if lower(target.receiving_wallet_address) <> lower(target_invoice.receiving_wallet_address)
    or target.amount <> target_invoice.amount or target.asset <> target_invoice.asset then
    return jsonb_build_object('result', 'snapshot_changed');
  end if;
  if target.tx_hash is not null and target.tx_hash <> p_tx_hash then
    return jsonb_build_object('result', 'already_bound');
  end if;

  begin
    update public.invoice_payment_intents
      set tx_hash = p_tx_hash, status = 'submitted', updated_at = now()
      where id = target.id;
  exception when unique_violation then
    return jsonb_build_object('result', 'tx_reused');
  end;
  return jsonb_build_object('result', 'bound', 'invoice_id', target.invoice_id);
end;
$$;

revoke all on function public.bind_invoice_payment_intent_tx(uuid, text, text) from public, anon, authenticated;
grant execute on function public.bind_invoice_payment_intent_tx(uuid, text, text) to service_role;
