create table if not exists public.wallet_activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arklake_accounts(id) on delete cascade,
  circle_wallet_id text not null references public.arklake_wallets(circle_wallet_id) on delete cascade,
  dedup_key text not null unique,
  circle_transaction_id text,
  circle_transaction_ids text[] not null default '{}',
  blockchain text not null,
  tx_hash text,
  activity_type text not null check (activity_type in ('receive', 'send', 'swap')),
  status text not null check (status in ('processing', 'confirmed', 'failed', 'attention')),
  circle_state text,
  operation text,
  source_address text,
  destination_address text,
  occurred_at timestamptz not null,
  confirmed_at timestamptz,
  raw_circle jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_activities_account_time_idx
  on public.wallet_activities (account_id, occurred_at desc);

create index if not exists wallet_activities_wallet_hash_idx
  on public.wallet_activities (circle_wallet_id, blockchain, tx_hash)
  where tx_hash is not null;

create table if not exists public.wallet_activity_legs (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.wallet_activities(id) on delete cascade,
  leg_key text not null unique,
  direction text not null check (direction in ('in', 'out')),
  amount numeric not null check (amount >= 0),
  token_id text,
  token_address text,
  token_symbol text,
  token_decimals integer,
  source_address text,
  destination_address text,
  log_index integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_activity_legs_activity_idx
  on public.wallet_activity_legs (activity_id);

alter table public.wallet_activities enable row level security;
alter table public.wallet_activity_legs enable row level security;

grant select, insert, update on table public.wallet_activities to service_role;
grant select, insert, update on table public.wallet_activity_legs to service_role;

create table if not exists public.wallet_activity_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arklake_accounts(id) on delete cascade,
  activity_id uuid not null references public.wallet_activities(id) on delete cascade,
  channel text not null default 'email' check (channel = 'email'),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'suppressed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, channel)
);

create index if not exists wallet_activity_notification_outbox_retry_idx
  on public.wallet_activity_notification_outbox (account_id, status, next_attempt_at);

alter table public.wallet_activity_notification_outbox
  add column if not exists account_id uuid references public.arklake_accounts(id) on delete cascade;

update public.wallet_activity_notification_outbox as outbox
set account_id = activity.account_id
from public.wallet_activities as activity
where outbox.activity_id = activity.id and outbox.account_id is null;

alter table public.wallet_activity_notification_outbox
  alter column account_id set not null;

alter table public.wallet_activity_notification_outbox enable row level security;

grant select, insert, update on table public.wallet_activity_notification_outbox to service_role;

insert into public.wallet_activity_notification_outbox (account_id, activity_id, status, last_error)
select account_id, id, 'suppressed', 'Existing confirmed activity at notification feature activation'
from public.wallet_activities
where status = 'confirmed'
on conflict (activity_id, channel) do nothing;
