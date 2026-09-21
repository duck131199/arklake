create table public.gateway_move_execution_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.gateway_move_operations(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'WAITING', 'COMPLETED')),
  mock_step integer not null default 0 check (mock_step between 0 and 2),
  lease_owner uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_progress_at timestamptz,
  recovery_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(recovery_metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (id, operation_id),
  check ((lease_owner is null) = (lease_token is null)),
  check ((lease_owner is null) = (lease_expires_at is null))
);

create index gateway_move_execution_jobs_claim_idx
  on public.gateway_move_execution_jobs (status, lease_expires_at, created_at)
  where status <> 'COMPLETED';

create table public.gateway_move_challenges (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  operation_id uuid not null references public.gateway_move_operations(id) on delete cascade,
  sequence integer not null check (sequence in (1, 2)),
  challenge_type text not null check (challenge_type in ('MOCK_AUTHORIZATION_1', 'MOCK_AUTHORIZATION_2')),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  response_json jsonb,
  created_at timestamptz not null default clock_timestamp(),
  responded_at timestamptz,
  unique (operation_id, sequence),
  unique (id, operation_id),
  foreign key (job_id, operation_id)
    references public.gateway_move_execution_jobs(id, operation_id) on delete cascade,
  check (
    (status = 'PENDING' and response_json is null and responded_at is null)
    or (status <> 'PENDING' and response_json is not null and responded_at is not null)
  )
);

create unique index gateway_move_challenges_one_pending_per_operation
  on public.gateway_move_challenges (operation_id)
  where status = 'PENDING';

alter table public.gateway_move_execution_jobs enable row level security;
alter table public.gateway_move_challenges enable row level security;
revoke all on table public.gateway_move_execution_jobs from public, anon, authenticated;
revoke all on table public.gateway_move_challenges from public, anon, authenticated;
grant select, insert, update on table public.gateway_move_execution_jobs to service_role;
grant select, insert, update on table public.gateway_move_challenges to service_role;

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
    or (old.status = 'PROCESSING' and new.status in ('CHALLENGE_REQUIRED', 'COMPLETED', 'FAILED', 'UNKNOWN'))
    or (old.status = 'UNKNOWN' and new.status in ('COMPLETED', 'FAILED'))
  ) then
    raise exception 'Invalid Gateway Move transition: % -> %', old.status, new.status;
  end if;

  if new.status = 'COMPLETED' and new.confirmed_at is null then
    new.confirmed_at = clock_timestamp();
  end if;
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create or replace function public.enqueue_gateway_move_mock_execution_job(
  p_operation_id uuid,
  p_account_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.gateway_move_operations%rowtype;
  execution_job_id uuid;
  inserted boolean := true;
begin
  select * into target
  from public.gateway_move_operations
  where id = p_operation_id and account_id = p_account_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if target.status <> 'SUBMITTING' then
    return jsonb_build_object('result', 'not_executable', 'status', target.status);
  end if;

  insert into public.gateway_move_execution_jobs (operation_id)
  values (target.id)
  on conflict (operation_id) do nothing
  returning id into execution_job_id;

  if execution_job_id is null then
    inserted := false;
    select id into execution_job_id
    from public.gateway_move_execution_jobs
    where operation_id = target.id;
  end if;

  return jsonb_build_object(
    'result', case when inserted then 'created' else 'replayed' end,
    'operation_id', target.id,
    'execution_job_id', execution_job_id,
    'status', 'SUBMITTING'
  );
end;
$$;

create or replace function public.claim_gateway_move_execution_job(
  p_worker_id uuid,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.gateway_move_execution_jobs%rowtype;
  new_token uuid := gen_random_uuid();
begin
  if p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception 'Lease duration must be between 5 and 300 seconds';
  end if;

  select job.* into target
  from public.gateway_move_execution_jobs job
  join public.gateway_move_operations operation on operation.id = job.operation_id
  where job.status <> 'COMPLETED'
    and (job.lease_expires_at is null or job.lease_expires_at <= clock_timestamp())
    and operation.status in ('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING')
  order by job.created_at
  for update of job skip locked
  limit 1;

  if not found then
    return jsonb_build_object('result', 'empty');
  end if;

  update public.gateway_move_execution_jobs
  set status = case when target.status = 'PENDING' then 'RUNNING' else target.status end,
      lease_owner = p_worker_id,
      lease_token = new_token,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      heartbeat_at = clock_timestamp(),
      last_progress_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = target.id;

  return jsonb_build_object(
    'result', 'claimed',
    'job_id', target.id,
    'operation_id', target.operation_id,
    'job_status', case when target.status = 'PENDING' then 'RUNNING' else target.status end,
    'mock_step', target.mock_step,
    'lease_token', new_token
  );
end;
$$;

create or replace function public.heartbeat_gateway_move_execution_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lease_seconds < 5 or p_lease_seconds > 300 then
    return false;
  end if;
  update public.gateway_move_execution_jobs
  set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      heartbeat_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_job_id
    and lease_owner = p_worker_id
    and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp()
    and status <> 'COMPLETED';
  return found;
end;
$$;

create or replace function public.create_gateway_move_mock_challenge(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_sequence integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.gateway_move_execution_jobs%rowtype;
  operation_status text;
  challenge_id uuid;
  expected_status text;
  challenge_kind text;
begin
  if p_sequence not in (1, 2) then
    return jsonb_build_object('result', 'invalid_sequence');
  end if;

  select * into job from public.gateway_move_execution_jobs
  where id = p_job_id for update;
  if not found
    or job.lease_owner <> p_worker_id
    or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('result', 'lease_lost');
  end if;
  if job.mock_step <> p_sequence - 1 then
    return jsonb_build_object('result', 'not_ready');
  end if;

  select status into operation_status from public.gateway_move_operations
  where id = job.operation_id for update;
  expected_status := case when p_sequence = 1 then 'SUBMITTING' else 'PROCESSING' end;
  challenge_kind := case when p_sequence = 1 then 'MOCK_AUTHORIZATION_1' else 'MOCK_AUTHORIZATION_2' end;
  if operation_status <> expected_status then
    return jsonb_build_object('result', 'not_ready');
  end if;

  insert into public.gateway_move_challenges (job_id, operation_id, sequence, challenge_type)
  values (job.id, job.operation_id, p_sequence, challenge_kind)
  on conflict (operation_id, sequence) do nothing
  returning id into challenge_id;

  if challenge_id is null then
    select id into challenge_id from public.gateway_move_challenges
    where operation_id = job.operation_id and sequence = p_sequence;
  end if;

  update public.gateway_move_operations
  set status = 'CHALLENGE_REQUIRED', challenge_count = greatest(challenge_count, p_sequence), last_progress_at = clock_timestamp()
  where id = job.operation_id and status = expected_status;
  if not found then
    return jsonb_build_object('result', 'not_ready');
  end if;

  update public.gateway_move_execution_jobs
  set status = 'WAITING', mock_step = p_sequence, last_progress_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = job.id and lease_owner = p_worker_id and lease_token = p_lease_token;

  return jsonb_build_object('result', 'waiting', 'challenge_id', challenge_id, 'sequence', p_sequence, 'challenge_type', challenge_kind);
end;
$$;

create or replace function public.respond_gateway_move_mock_challenge(
  p_operation_id uuid,
  p_account_id uuid,
  p_challenge_id uuid,
  p_approved boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge public.gateway_move_challenges%rowtype;
  operation_status text;
  response_value jsonb := jsonb_build_object('approved', p_approved);
begin
  select operation.status into operation_status
  from public.gateway_move_operations operation
  where operation.id = p_operation_id and operation.account_id = p_account_id
  for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into challenge from public.gateway_move_challenges
  where id = p_challenge_id and operation_id = p_operation_id
  for update;
  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;
  if challenge.status <> 'PENDING' then
    if challenge.response_json = response_value then
      return jsonb_build_object('result', 'replayed', 'status', challenge.status);
    end if;
    return jsonb_build_object('result', 'conflict', 'status', challenge.status);
  end if;
  if operation_status <> 'CHALLENGE_REQUIRED' then
    return jsonb_build_object('result', 'not_confirmable');
  end if;

  update public.gateway_move_challenges
  set status = case when p_approved then 'APPROVED' else 'REJECTED' end,
      response_json = response_value,
      responded_at = clock_timestamp()
  where id = challenge.id and status = 'PENDING';

  return jsonb_build_object('result', 'recorded', 'status', case when p_approved then 'APPROVED' else 'REJECTED' end);
end;
$$;

create or replace function public.advance_gateway_move_mock_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.gateway_move_execution_jobs%rowtype;
  challenge public.gateway_move_challenges%rowtype;
begin
  select * into job from public.gateway_move_execution_jobs where id = p_job_id for update;
  if not found
    or job.lease_owner <> p_worker_id
    or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('result', 'lease_lost');
  end if;
  if job.status <> 'WAITING' or job.mock_step not in (1, 2) then
    return jsonb_build_object('result', 'not_ready');
  end if;

  select * into challenge from public.gateway_move_challenges
  where operation_id = job.operation_id and sequence = job.mock_step;
  if not found or challenge.status = 'PENDING' then
    return jsonb_build_object('result', 'waiting');
  end if;
  if challenge.status = 'REJECTED' then
    update public.gateway_move_operations
    set status = 'REJECTED', last_progress_at = clock_timestamp()
    where id = job.operation_id and status = 'CHALLENGE_REQUIRED';
    update public.gateway_move_execution_jobs
    set status = 'COMPLETED', completed_at = clock_timestamp(), last_progress_at = clock_timestamp(), updated_at = clock_timestamp(),
        lease_owner = null, lease_token = null, lease_expires_at = null
    where id = job.id and lease_owner = p_worker_id and lease_token = p_lease_token;
    return jsonb_build_object('result', 'rejected');
  end if;

  update public.gateway_move_operations
  set status = 'PROCESSING', last_progress_at = clock_timestamp()
  where id = job.operation_id and status = 'CHALLENGE_REQUIRED';
  update public.gateway_move_execution_jobs
  set status = 'RUNNING', last_progress_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = job.id and lease_owner = p_worker_id and lease_token = p_lease_token;
  return jsonb_build_object('result', 'advanced', 'sequence', job.mock_step);
end;
$$;

create or replace function public.complete_gateway_move_mock_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.gateway_move_execution_jobs%rowtype;
begin
  select * into job from public.gateway_move_execution_jobs where id = p_job_id for update;
  if not found
    or job.lease_owner <> p_worker_id
    or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('result', 'lease_lost');
  end if;
  if job.status <> 'RUNNING' or job.mock_step <> 2 then
    return jsonb_build_object('result', 'not_ready');
  end if;

  update public.gateway_move_operations
  set status = 'COMPLETED',
      last_progress_at = clock_timestamp(),
      sanitized_result_json = jsonb_build_object('mode', 'mock-worker-foundation', 'movedFunds', false)
  where id = job.operation_id and status = 'PROCESSING';
  if not found then
    return jsonb_build_object('result', 'not_ready');
  end if;

  update public.gateway_move_execution_jobs
  set status = 'COMPLETED', completed_at = clock_timestamp(), last_progress_at = clock_timestamp(), updated_at = clock_timestamp(),
      recovery_metadata = jsonb_build_object('mode', 'mock-worker-foundation', 'movedFunds', false),
      lease_owner = null, lease_token = null, lease_expires_at = null
  where id = job.id and lease_owner = p_worker_id and lease_token = p_lease_token;
  return jsonb_build_object('result', 'completed');
end;
$$;

create or replace function public.release_gateway_move_execution_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gateway_move_execution_jobs
  set lease_owner = null, lease_token = null, lease_expires_at = null, updated_at = clock_timestamp()
  where id = p_job_id and lease_owner = p_worker_id and lease_token = p_lease_token and status <> 'COMPLETED';
  return found;
end;
$$;

revoke all on function public.claim_gateway_move_execution_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.enqueue_gateway_move_mock_execution_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.heartbeat_gateway_move_execution_job(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.create_gateway_move_mock_challenge(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.respond_gateway_move_mock_challenge(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.advance_gateway_move_mock_job(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_gateway_move_mock_job(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_gateway_move_execution_job(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_gateway_move_execution_job(uuid, integer) to service_role;
grant execute on function public.enqueue_gateway_move_mock_execution_job(uuid, uuid) to service_role;
grant execute on function public.heartbeat_gateway_move_execution_job(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.create_gateway_move_mock_challenge(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.respond_gateway_move_mock_challenge(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.advance_gateway_move_mock_job(uuid, uuid, uuid) to service_role;
grant execute on function public.complete_gateway_move_mock_job(uuid, uuid, uuid) to service_role;
grant execute on function public.release_gateway_move_execution_job(uuid, uuid, uuid) to service_role;
