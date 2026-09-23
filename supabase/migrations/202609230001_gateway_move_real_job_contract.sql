alter table public.gateway_move_execution_jobs
  add column execution_mode text not null default 'MOCK'
    check (execution_mode in ('MOCK', 'REAL')),
  add column execution_phase text not null default 'NOT_STARTED'
    check (execution_phase in ('NOT_STARTED', 'WAITING_CHALLENGE', 'PROCESSING', 'TERMINAL')),
  add column execution_attempt_id uuid,
  add column auth_session_id text references public.arklake_sessions(sid) on delete restrict,
  add column financial_ambiguity_started_at timestamptz,
  add column provider_request_fingerprint text,
  add column encrypted_recovery_blob text,
  add column recovery_blob_version integer
    check (recovery_blob_version is null or recovery_blob_version > 0),
  add constraint gateway_move_execution_jobs_real_contract check (
    (execution_mode = 'MOCK' and auth_session_id is null)
    or (execution_mode = 'REAL' and auth_session_id is not null and execution_attempt_id is not null)
  ),
  add constraint gateway_move_execution_jobs_recovery_pair check (
    (encrypted_recovery_blob is null) = (recovery_blob_version is null)
  );

alter table public.gateway_move_challenges
  drop constraint gateway_move_challenges_challenge_type_check,
  add constraint gateway_move_challenges_challenge_type_check check (
    challenge_type in ('MOCK_AUTHORIZATION_1', 'MOCK_AUTHORIZATION_2', 'CIRCLE_TYPED_DATA')
  ),
  add column execution_attempt_id uuid,
  add column circle_challenge_id text,
  add column encrypted_response_material text,
  add column response_received_at timestamptz,
  add column signature_delivered_at timestamptz,
  add column superseded_at timestamptz,
  add column superseded_reason text,
  add constraint gateway_move_challenges_real_contract check (
    (challenge_type in ('MOCK_AUTHORIZATION_1', 'MOCK_AUTHORIZATION_2')
      and execution_attempt_id is null
      and circle_challenge_id is null
      and encrypted_response_material is null)
    or (challenge_type = 'CIRCLE_TYPED_DATA'
      and execution_attempt_id is not null
      and circle_challenge_id is not null)
  ),
  add constraint gateway_move_challenges_response_timing check (
    (response_received_at is null and encrypted_response_material is null)
    or (response_received_at is not null and encrypted_response_material is not null)
  ),
  add constraint gateway_move_challenges_delivery_timing check (
    signature_delivered_at is null or response_received_at is not null
  ),
  add constraint gateway_move_challenges_superseded_pair check (
    (superseded_at is null) = (superseded_reason is null)
  );

create unique index gateway_move_challenges_circle_id_unique
  on public.gateway_move_challenges (circle_challenge_id)
  where circle_challenge_id is not null;

create or replace function public.confirm_and_enqueue_gateway_move_operation(
  p_operation_id uuid,
  p_account_id uuid,
  p_session_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.gateway_move_operations%rowtype;
  existing_job public.gateway_move_execution_jobs%rowtype;
  new_job_id uuid;
begin
  select * into target
  from public.gateway_move_operations
  where id = p_operation_id and account_id = p_account_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into existing_job
  from public.gateway_move_execution_jobs
  where operation_id = target.id;

  if target.status = 'SUBMITTING'
    and existing_job.id is not null
    and existing_job.execution_mode = 'REAL' then
    return jsonb_build_object(
      'result', 'replayed',
      'operation_id', target.id,
      'status', 'SUBMITTING'
    );
  end if;

  if target.status <> 'AWAITING_CONFIRMATION' then
    return jsonb_build_object('result', 'not_executable', 'status', target.status);
  end if;

  if not exists (
    select 1 from public.arklake_sessions session
    where session.sid = p_session_id
      and session.account_id = p_account_id
      and session.revoked_at is null
      and session.expires_at > clock_timestamp()
  ) then
    return jsonb_build_object('result', 'auth_context_unavailable');
  end if;

  if target.estimate_created_at is null
    or target.estimate_created_at + interval '60 seconds' <= clock_timestamp() then
    update public.gateway_move_operations
    set status = 'EXPIRED', last_progress_at = clock_timestamp()
    where id = target.id and account_id = p_account_id and status = 'AWAITING_CONFIRMATION';
    return jsonb_build_object('result', 'expired', 'status', 'EXPIRED');
  end if;

  if existing_job.id is not null then
    return jsonb_build_object('result', 'not_executable', 'status', target.status);
  end if;

  begin
    update public.gateway_move_operations
    set status = 'SUBMITTING',
        started_at = coalesce(started_at, clock_timestamp()),
        last_progress_at = clock_timestamp()
    where id = target.id and account_id = p_account_id and status = 'AWAITING_CONFIRMATION';

    insert into public.gateway_move_execution_jobs (
      operation_id,
      execution_mode,
      execution_phase,
      execution_attempt_id,
      auth_session_id
    ) values (
      target.id,
      'REAL',
      'NOT_STARTED',
      gen_random_uuid(),
      p_session_id
    ) returning id into new_job_id;
  exception when unique_violation then
    return jsonb_build_object('result', 'active_operation_exists');
  end;

  if new_job_id is null then
    raise exception 'Gateway Move REAL execution job was not created';
  end if;

  return jsonb_build_object(
    'result', 'created',
    'operation_id', target.id,
    'status', 'SUBMITTING'
  );
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
  existing_job public.gateway_move_execution_jobs%rowtype;
  execution_job_id uuid;
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

  select * into existing_job
  from public.gateway_move_execution_jobs
  where operation_id = target.id;
  if existing_job.id is not null then
    return jsonb_build_object(
      'result', case when existing_job.execution_mode = 'MOCK' then 'replayed' else 'mode_conflict' end,
      'operation_id', target.id,
      'execution_job_id', case when existing_job.execution_mode = 'MOCK' then existing_job.id else null end,
      'status', 'SUBMITTING'
    );
  end if;

  insert into public.gateway_move_execution_jobs (operation_id, execution_mode)
  values (target.id, 'MOCK')
  returning id into execution_job_id;

  return jsonb_build_object(
    'result', 'created',
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
  where job.execution_mode = 'MOCK'
    and job.status <> 'COMPLETED'
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

revoke all on function public.confirm_and_enqueue_gateway_move_operation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_and_enqueue_gateway_move_operation(uuid, uuid, text) to service_role;
revoke all on function public.claim_gateway_move_operation(uuid, uuid) from public, anon, authenticated, service_role;

revoke all on table public.gateway_move_execution_jobs from public, anon, authenticated;
revoke all on table public.gateway_move_challenges from public, anon, authenticated;
grant select, insert, update on table public.gateway_move_execution_jobs to service_role;
grant select, insert, update on table public.gateway_move_challenges to service_role;
