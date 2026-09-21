alter table public.gateway_move_operations
  add column if not exists preparation_key uuid not null default gen_random_uuid();

create unique index if not exists gateway_move_operations_account_preparation_unique
  on public.gateway_move_operations (account_id, preparation_key);

create or replace function public.enforce_gateway_move_operation_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_id <> old.account_id
    or new.preparation_key <> old.preparation_key
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
