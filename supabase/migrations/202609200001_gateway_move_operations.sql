create table if not exists public.gateway_move_operations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.arklake_accounts(id) on delete cascade,
  status text not null check (status in (
    'ESTIMATING', 'AWAITING_CONFIRMATION', 'SUBMITTING', 'CHALLENGE_REQUIRED',
    'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'UNKNOWN', 'EXPIRED'
  )),
  amount_base_units numeric(78, 0) not null check (amount_base_units > 0),
  token text not null check (token = 'USDC'),
  source_chain text not null check (source_chain = 'Polygon_Amoy_Testnet'),
  source_wallet_id text not null,
  source_address text not null check (source_address = lower(source_address) and source_address ~ '^0x[0-9a-f]{40}$'),
  destination_chain text not null check (destination_chain = 'Arc_Testnet'),
  destination_wallet_id text not null,
  destination_address text not null check (destination_address = lower(destination_address) and destination_address ~ '^0x[0-9a-f]{40}$'),
  use_forwarder boolean not null default false check (use_forwarder = false),
  estimated_fees_json jsonb,
  required_base_units numeric(78, 0) check (required_base_units is null or required_base_units >= amount_base_units),
  gateway_before_base_units numeric(78, 0) check (gateway_before_base_units is null or gateway_before_base_units >= 0),
  arc_before_base_units numeric(78, 0) check (arc_before_base_units is null or arc_before_base_units >= 0),
  estimate_created_at timestamptz,
  confirmed_at timestamptz,
  started_at timestamptz,
  last_progress_at timestamptz,
  challenge_count integer not null default 0 check (challenge_count >= 0),
  transfer_id text,
  destination_tx_hash text check (
    destination_tx_hash is null or
    (destination_tx_hash = lower(destination_tx_hash) and destination_tx_hash ~ '^0x[0-9a-f]{64}$')
  ),
  gateway_after_base_units numeric(78, 0) check (gateway_after_base_units is null or gateway_after_base_units >= 0),
  arc_after_base_units numeric(78, 0) check (arc_after_base_units is null or arc_after_base_units >= 0),
  receipt_status text check (receipt_status is null or receipt_status in ('SUCCESS', 'FAILED')),
  sanitized_result_json jsonb,
  error_code text,
  error_stage text,
  retryable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gateway_move_operations_account_created_idx
  on public.gateway_move_operations (account_id, created_at desc);

create unique index if not exists gateway_move_operations_one_active_per_account
  on public.gateway_move_operations (account_id)
  where status in ('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING', 'UNKNOWN');

alter table public.gateway_move_operations enable row level security;
revoke all on table public.gateway_move_operations from public, anon, authenticated;
grant select, insert, update on table public.gateway_move_operations to service_role;

create or replace function public.enforce_gateway_move_operation_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_id <> old.account_id
    or new.amount_base_units <> old.amount_base_units
    or new.token <> old.token
    or new.source_chain <> old.source_chain
    or new.source_wallet_id <> old.source_wallet_id
    or new.source_address <> old.source_address
    or new.destination_chain <> old.destination_chain
    or new.destination_wallet_id <> old.destination_wallet_id
    or new.destination_address <> old.destination_address
    or new.use_forwarder <> old.use_forwarder
    or new.created_at <> old.created_at then
    raise exception 'Gateway Move operation identity is immutable';
  end if;

  if new.status <> old.status and not (
    (old.status = 'ESTIMATING' and new.status in ('AWAITING_CONFIRMATION', 'FAILED', 'EXPIRED'))
    or (old.status = 'AWAITING_CONFIRMATION' and new.status in ('SUBMITTING', 'REJECTED', 'FAILED', 'EXPIRED'))
    or (old.status = 'SUBMITTING' and new.status in ('CHALLENGE_REQUIRED', 'PROCESSING', 'FAILED', 'UNKNOWN'))
    or (old.status = 'CHALLENGE_REQUIRED' and new.status in ('PROCESSING', 'REJECTED', 'FAILED', 'UNKNOWN'))
    or (old.status = 'PROCESSING' and new.status in ('COMPLETED', 'FAILED', 'UNKNOWN'))
    or (old.status = 'UNKNOWN' and new.status in ('COMPLETED', 'FAILED'))
  ) then
    raise exception 'Invalid Gateway Move transition: % -> %', old.status, new.status;
  end if;

  if new.status = 'COMPLETED' and new.confirmed_at is null then
    new.confirmed_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gateway_move_operation_transition_guard on public.gateway_move_operations;
create trigger gateway_move_operation_transition_guard
before update on public.gateway_move_operations
for each row execute function public.enforce_gateway_move_operation_transition();

create or replace function public.claim_gateway_move_operation(
  p_operation_id uuid,
  p_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.gateway_move_operations%rowtype;
begin
  select * into target
  from public.gateway_move_operations
  where id = p_operation_id and account_id = p_account_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if target.status <> 'AWAITING_CONFIRMATION' then
    return jsonb_build_object('result', 'not_executable', 'status', target.status);
  end if;

  begin
    update public.gateway_move_operations
    set status = 'SUBMITTING', started_at = coalesce(started_at, now()), last_progress_at = now()
    where id = target.id and account_id = p_account_id and status = 'AWAITING_CONFIRMATION';
  exception when unique_violation then
    return jsonb_build_object('result', 'active_operation_exists');
  end;

  if not found then
    return jsonb_build_object('result', 'not_executable');
  end if;
  return jsonb_build_object('result', 'claimed', 'operation_id', target.id);
end;
$$;

revoke all on function public.claim_gateway_move_operation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_gateway_move_operation(uuid, uuid) to service_role;
