create or replace function public.claim_gateway_move_real_execution_job(
  p_worker_id uuid,
  p_lease_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  new_token uuid := gen_random_uuid();
begin
  if p_lease_seconds < 5 or p_lease_seconds > 300 then
    raise exception 'Lease duration must be between 5 and 300 seconds';
  end if;

  select job.*, operation.account_id into target
  from public.gateway_move_execution_jobs job
  join public.gateway_move_operations operation on operation.id = job.operation_id
  join public.arklake_sessions session on session.sid = job.auth_session_id
  where job.execution_mode = 'REAL'
    and job.execution_phase = 'NOT_STARTED'
    and job.financial_ambiguity_started_at is null
    and job.status <> 'COMPLETED'
    and (job.lease_expires_at is null or job.lease_expires_at <= clock_timestamp())
    and operation.status = 'SUBMITTING'
    and session.account_id = operation.account_id
    and session.revoked_at is null
    and session.expires_at > clock_timestamp()
  order by job.created_at
  for update of job skip locked
  limit 1;

  if not found then return jsonb_build_object('result', 'empty'); end if;

  update public.gateway_move_execution_jobs
  set status = 'RUNNING', lease_owner = p_worker_id, lease_token = new_token,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      heartbeat_at = clock_timestamp(), last_progress_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = target.id;

  return jsonb_build_object(
    'result', 'claimed', 'job_id', target.id, 'operation_id', target.operation_id,
    'execution_attempt_id', target.execution_attempt_id, 'lease_token', new_token,
    'auth_session_id', target.auth_session_id, 'account_id', target.account_id
  );
end;
$$;

create or replace function public.heartbeat_gateway_move_real_execution_job(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_lease_seconds integer
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if p_lease_seconds < 5 or p_lease_seconds > 300 then return false; end if;
  update public.gateway_move_execution_jobs
  set lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      heartbeat_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_job_id and operation_id = p_operation_id and execution_mode = 'REAL'
    and execution_attempt_id = p_execution_attempt_id
    and lease_owner = p_worker_id and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp() and status <> 'COMPLETED';
  return found;
end;
$$;

create or replace function public.begin_gateway_move_real_financial_attempt(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare job public.gateway_move_execution_jobs%rowtype;
begin
  select * into job from public.gateway_move_execution_jobs
  where id = p_job_id and operation_id = p_operation_id for update;
  if not found or job.execution_mode <> 'REAL' or job.execution_attempt_id <> p_execution_attempt_id
    or job.lease_owner <> p_worker_id or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('result', 'lease_lost');
  end if;
  if job.financial_ambiguity_started_at is not null then
    return jsonb_build_object('result', 'already_started');
  end if;
  if job.execution_phase <> 'NOT_STARTED' or job.status <> 'RUNNING'
    or not exists (select 1 from public.gateway_move_operations where id = p_operation_id and status = 'SUBMITTING') then
    return jsonb_build_object('result', 'not_ready');
  end if;
  update public.gateway_move_execution_jobs
  set financial_ambiguity_started_at = clock_timestamp(), execution_phase = 'PROCESSING',
      last_progress_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = job.id;
  return jsonb_build_object('result', 'started');
end;
$$;

create or replace function public.persist_gateway_move_real_challenge(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_circle_challenge_id text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare job public.gateway_move_execution_jobs%rowtype; existing public.gateway_move_challenges%rowtype;
  next_sequence integer; new_id uuid;
begin
  if p_circle_challenge_id is null or length(p_circle_challenge_id) < 1 then
    return jsonb_build_object('result', 'invalid_challenge');
  end if;
  select * into job from public.gateway_move_execution_jobs
  where id = p_job_id and operation_id = p_operation_id for update;
  if not found or job.execution_mode <> 'REAL' or job.execution_attempt_id <> p_execution_attempt_id
    or job.lease_owner <> p_worker_id or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() then return jsonb_build_object('result', 'lease_lost'); end if;
  if job.financial_ambiguity_started_at is null or job.execution_phase not in ('PROCESSING', 'WAITING_CHALLENGE') then
    return jsonb_build_object('result', 'not_ready');
  end if;

  select * into existing from public.gateway_move_challenges
  where operation_id = p_operation_id and execution_attempt_id = p_execution_attempt_id
    and circle_challenge_id = p_circle_challenge_id for update;
  if found then
    return jsonb_build_object('result', 'waiting', 'challenge_id', existing.id, 'sequence', existing.sequence, 'replayed', true);
  end if;
  if exists (select 1 from public.gateway_move_challenges where operation_id = p_operation_id and status = 'PENDING') then
    return jsonb_build_object('result', 'pending_challenge_exists');
  end if;
  select coalesce(max(sequence), 0) + 1 into next_sequence
  from public.gateway_move_challenges where operation_id = p_operation_id;
  if next_sequence not in (1, 2) then return jsonb_build_object('result', 'invalid_sequence'); end if;

  insert into public.gateway_move_challenges
    (job_id, operation_id, sequence, challenge_type, execution_attempt_id, circle_challenge_id)
  values (job.id, p_operation_id, next_sequence, 'CIRCLE_TYPED_DATA', p_execution_attempt_id, p_circle_challenge_id)
  returning id into new_id;

  update public.gateway_move_operations set status = 'CHALLENGE_REQUIRED',
    challenge_count = greatest(challenge_count, next_sequence), last_progress_at = clock_timestamp()
  where id = p_operation_id and status in ('SUBMITTING', 'PROCESSING');
  if not found then raise exception 'REAL challenge operation transition failed'; end if;
  update public.gateway_move_execution_jobs set status = 'WAITING', execution_phase = 'WAITING_CHALLENGE',
    last_progress_at = clock_timestamp(), updated_at = clock_timestamp() where id = job.id;
  return jsonb_build_object('result', 'waiting', 'challenge_id', new_id, 'sequence', next_sequence, 'replayed', false);
end;
$$;

create or replace function public.read_gateway_move_real_challenge_response(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_challenge_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare challenge public.gateway_move_challenges%rowtype;
begin
  if not exists (
    select 1 from public.gateway_move_execution_jobs job where job.id = p_job_id
      and job.operation_id = p_operation_id and job.execution_mode = 'REAL'
      and job.execution_attempt_id = p_execution_attempt_id and job.lease_owner = p_worker_id
      and job.lease_token = p_lease_token and job.lease_expires_at > clock_timestamp()
      and job.execution_phase = 'WAITING_CHALLENGE'
  ) then return jsonb_build_object('result', 'lease_lost'); end if;
  select * into challenge from public.gateway_move_challenges
  where id = p_challenge_id and job_id = p_job_id and operation_id = p_operation_id
    and execution_attempt_id = p_execution_attempt_id and challenge_type = 'CIRCLE_TYPED_DATA'
    and superseded_at is null;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if challenge.status = 'PENDING' then return jsonb_build_object('result', 'waiting'); end if;
  if challenge.encrypted_response_material is null then return jsonb_build_object('result', 'conflict'); end if;
  return jsonb_build_object('result', lower(challenge.status), 'encrypted_response_material', challenge.encrypted_response_material,
    'already_delivered', challenge.signature_delivered_at is not null);
end;
$$;

create or replace function public.deliver_gateway_move_real_signature(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_challenge_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare job public.gateway_move_execution_jobs%rowtype; challenge public.gateway_move_challenges%rowtype;
begin
  select * into job from public.gateway_move_execution_jobs where id = p_job_id and operation_id = p_operation_id;
  if not found or job.execution_mode <> 'REAL' or job.execution_attempt_id <> p_execution_attempt_id
    or job.lease_owner <> p_worker_id or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() then return jsonb_build_object('result', 'lease_lost'); end if;
  select * into challenge from public.gateway_move_challenges
  where id = p_challenge_id and job_id = p_job_id and operation_id = p_operation_id
    and execution_attempt_id = p_execution_attempt_id and challenge_type = 'CIRCLE_TYPED_DATA'
    and superseded_at is null for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if challenge.status <> 'APPROVED' or challenge.encrypted_response_material is null then
    return jsonb_build_object('result', case when challenge.status = 'REJECTED' then 'rejected' else 'not_ready' end);
  end if;
  if challenge.signature_delivered_at is not null then return jsonb_build_object('result', 'replayed'); end if;
  if job.execution_phase <> 'WAITING_CHALLENGE' then return jsonb_build_object('result', 'not_ready'); end if;
  update public.gateway_move_challenges set signature_delivered_at = clock_timestamp() where id = challenge.id;
  update public.gateway_move_execution_jobs set status = 'RUNNING', execution_phase = 'PROCESSING',
    last_progress_at = clock_timestamp(), updated_at = clock_timestamp() where id = p_job_id;
  update public.gateway_move_operations set status = 'PROCESSING', last_progress_at = clock_timestamp()
    where id = p_operation_id and status = 'CHALLENGE_REQUIRED';
  if not found then raise exception 'REAL signature delivery operation transition failed'; end if;
  return jsonb_build_object('result', 'delivered');
end;
$$;

create or replace function public.record_gateway_move_real_progress(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_progress jsonb
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' then return false; end if;
  update public.gateway_move_execution_jobs
  set recovery_metadata = jsonb_set(recovery_metadata, '{progress}', p_progress, true),
      last_progress_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_job_id and operation_id = p_operation_id and execution_mode = 'REAL'
    and execution_attempt_id = p_execution_attempt_id and lease_owner = p_worker_id
    and lease_token = p_lease_token and lease_expires_at > clock_timestamp()
    and financial_ambiguity_started_at is not null and status <> 'COMPLETED';
  return found;
end;
$$;

create or replace function public.claim_gateway_move_real_reconciliation_job(
  p_worker_id uuid, p_lease_seconds integer
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare target public.gateway_move_execution_jobs%rowtype; new_token uuid := gen_random_uuid();
begin
  if p_lease_seconds < 5 or p_lease_seconds > 300 then raise exception 'Lease duration must be between 5 and 300 seconds'; end if;
  select job.* into target from public.gateway_move_execution_jobs job
  join public.gateway_move_operations operation on operation.id = job.operation_id
  where job.execution_mode = 'REAL' and job.financial_ambiguity_started_at is not null
    and job.status <> 'COMPLETED' and (job.lease_expires_at is null or job.lease_expires_at <= clock_timestamp())
    and operation.status in ('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING')
  order by job.financial_ambiguity_started_at for update of job skip locked limit 1;
  if not found then return jsonb_build_object('result', 'empty'); end if;
  update public.gateway_move_execution_jobs set lease_owner = p_worker_id, lease_token = new_token,
    lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds), heartbeat_at = clock_timestamp(),
    updated_at = clock_timestamp() where id = target.id;
  return jsonb_build_object('result', 'reconcile', 'job_id', target.id, 'operation_id', target.operation_id,
    'execution_attempt_id', target.execution_attempt_id, 'lease_token', new_token);
end;
$$;

create or replace function public.finish_gateway_move_real_execution(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_status text, p_error_code text default null,
  p_sanitized_result jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare current_status text;
begin
  if p_status not in ('COMPLETED', 'FAILED', 'UNKNOWN', 'REJECTED') then return jsonb_build_object('result', 'invalid_status'); end if;
  if not exists (
    select 1 from public.gateway_move_execution_jobs job where job.id = p_job_id
      and job.operation_id = p_operation_id and job.execution_mode = 'REAL'
      and job.execution_attempt_id = p_execution_attempt_id and job.lease_owner = p_worker_id
      and job.lease_token = p_lease_token and job.lease_expires_at > clock_timestamp()
      and job.financial_ambiguity_started_at is not null and job.status <> 'COMPLETED'
  ) then return jsonb_build_object('result', 'lease_lost'); end if;
  select status into current_status from public.gateway_move_operations where id = p_operation_id for update;
  if p_status = 'REJECTED' and current_status <> 'CHALLENGE_REQUIRED' then return jsonb_build_object('result', 'not_ready'); end if;
  if p_status = 'COMPLETED' and current_status not in ('PROCESSING', 'UNKNOWN') then return jsonb_build_object('result', 'not_ready'); end if;
  if p_status = 'FAILED' and current_status not in ('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING', 'UNKNOWN') then return jsonb_build_object('result', 'not_ready'); end if;
  if p_status = 'UNKNOWN' and current_status not in ('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING') then return jsonb_build_object('result', 'not_ready'); end if;
  update public.gateway_move_operations set status = p_status, error_code = p_error_code,
    error_stage = case when p_error_code is null then null else 'execution' end,
    retryable = false, sanitized_result_json = coalesce(p_sanitized_result, sanitized_result_json),
    last_progress_at = clock_timestamp() where id = p_operation_id;
  update public.gateway_move_execution_jobs set status = 'COMPLETED', execution_phase = 'TERMINAL',
    completed_at = clock_timestamp(), last_progress_at = clock_timestamp(), updated_at = clock_timestamp(),
    lease_owner = null, lease_token = null, lease_expires_at = null where id = p_job_id;
  return jsonb_build_object('result', 'completed', 'status', p_status);
end;
$$;

revoke all on function public.claim_gateway_move_real_execution_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_gateway_move_real_execution_job(uuid, uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.begin_gateway_move_real_financial_attempt(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.persist_gateway_move_real_challenge(uuid, uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_gateway_move_real_challenge_response(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.deliver_gateway_move_real_signature(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_gateway_move_real_progress(uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_gateway_move_real_reconciliation_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_gateway_move_real_execution(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_gateway_move_real_execution_job(uuid, integer) to service_role;
grant execute on function public.heartbeat_gateway_move_real_execution_job(uuid, uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.begin_gateway_move_real_financial_attempt(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.persist_gateway_move_real_challenge(uuid, uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.read_gateway_move_real_challenge_response(uuid, uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.deliver_gateway_move_real_signature(uuid, uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.record_gateway_move_real_progress(uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.claim_gateway_move_real_reconciliation_job(uuid, integer) to service_role;
grant execute on function public.finish_gateway_move_real_execution(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) to service_role;
