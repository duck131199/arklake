create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('ARK-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  account_id uuid not null references public.arklake_accounts(id) on delete cascade,
  receiving_circle_wallet_id text not null references public.arklake_wallets(circle_wallet_id),
  receiving_wallet_address text not null check (receiving_wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  payer_email text not null check (position('@' in payer_email) > 1),
  amount numeric not null check (amount > 0),
  asset text not null default 'USDC' check (asset = 'USDC'),
  memo text not null default '' check (char_length(memo) <= 500),
  status text not null default 'active' check (status in ('active', 'paid', 'expired')),
  expires_at timestamptz not null,
  paid_at timestamptz,
  payment_activity_id uuid references public.wallet_activities(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_paid_verification check (
    (status = 'paid' and paid_at is not null and payment_activity_id is not null)
    or (status in ('active', 'expired') and paid_at is null and payment_activity_id is null)
  )
);

create index if not exists invoices_account_created_idx on public.invoices (account_id, created_at desc);
create index if not exists invoices_account_status_expiry_idx on public.invoices (account_id, status, expires_at);

alter table public.invoices enable row level security;
revoke all on table public.invoices from anon, authenticated;
grant select, insert, update on table public.invoices to service_role;
