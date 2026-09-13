create table if not exists public.wallet_activity_sync_cursors (
  circle_wallet_id text primary key references public.arklake_wallets(circle_wallet_id) on delete cascade,
  blockchain text not null check (blockchain = 'ARC-TESTNET'),
  last_scanned_block bigint not null check (last_scanned_block >= 0),
  updated_at timestamptz not null default now()
);

alter table public.wallet_activity_sync_cursors enable row level security;

grant select, insert, update on table public.wallet_activity_sync_cursors to service_role;

create or replace function public.advance_wallet_activity_sync_cursor(
  p_circle_wallet_id text,
  p_blockchain text,
  p_last_scanned_block bigint
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.wallet_activity_sync_cursors (circle_wallet_id, blockchain, last_scanned_block, updated_at)
  values (p_circle_wallet_id, p_blockchain, p_last_scanned_block, now())
  on conflict (circle_wallet_id) do update
  set last_scanned_block = greatest(wallet_activity_sync_cursors.last_scanned_block, excluded.last_scanned_block),
      updated_at = now();
$$;

revoke all on function public.advance_wallet_activity_sync_cursor(text, text, bigint) from public, anon, authenticated;
grant execute on function public.advance_wallet_activity_sync_cursor(text, text, bigint) to service_role;
