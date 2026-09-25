create or replace function public.deliver_gateway_move_real_signature(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_challenge_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare job public.gateway_move_execution_jobs%rowtype; challenge public.gateway_move_challenges%rowtype;
begin
  select * into job from public.gateway_move_execution_jobs
  where id = p_job_id and operation_id = p_operation_id
  for update;
  if not found or job.execution_mode <> 'REAL' or job.execution_attempt_id <> p_execution_attempt_id
    or job.lease_owner <> p_worker_id or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() or job.status = 'COMPLETED' then
    return jsonb_build_object('result', 'lease_lost');
  end if;

  select * into challenge from public.gateway_move_challenges
  where id = p_challenge_id and job_id = p_job_id and operation_id = p_operation_id
    and execution_attempt_id = p_execution_attempt_id and challenge_type = 'CIRCLE_TYPED_DATA'
    and superseded_at is null for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if challenge.status <> 'APPROVED' or challenge.encrypted_response_material is null then
    return jsonb_build_object('result', case when challenge.status = 'REJECTED' then 'rejected' else 'not_ready' end);
  end if;
  if challenge.signature_delivered_at is not null then return jsonb_build_object('result', 'replayed'); end if;
  if job.execution_phase <> 'WAITING_CHALLENGE' or job.status <> 'WAITING' then
    return jsonb_build_object('result', 'not_ready');
  end if;

  update public.gateway_move_challenges
  set signature_delivered_at = clock_timestamp()
  where id = challenge.id and signature_delivered_at is null;
  if not found then return jsonb_build_object('result', 'replayed'); end if;

  update public.gateway_move_execution_jobs
  set status = 'RUNNING', execution_phase = 'PROCESSING',
      last_progress_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = job.id and operation_id = p_operation_id and execution_mode = 'REAL'
    and execution_attempt_id = p_execution_attempt_id
    and lease_owner = p_worker_id and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp()
    and status = 'WAITING' and execution_phase = 'WAITING_CHALLENGE';
  if not found then raise exception 'REAL signature delivery lost its fenced job'; end if;

  update public.gateway_move_operations
  set status = 'PROCESSING', last_progress_at = clock_timestamp()
  where id = p_operation_id and status = 'CHALLENGE_REQUIRED';
  if not found then raise exception 'REAL signature delivery operation transition failed'; end if;
  return jsonb_build_object('result', 'delivered');
end;
$$;

create or replace function public.finish_gateway_move_real_execution(
  p_job_id uuid, p_operation_id uuid, p_execution_attempt_id uuid,
  p_worker_id uuid, p_lease_token uuid, p_status text, p_error_code text default null,
  p_sanitized_result jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare job public.gateway_move_execution_jobs%rowtype; current_status text;
begin
  if p_status not in ('COMPLETED', 'FAILED', 'UNKNOWN', 'REJECTED') then
    return jsonb_build_object('result', 'invalid_status');
  end if;

  select * into job from public.gateway_move_execution_jobs
  where id = p_job_id and operation_id = p_operation_id
  for update;
  if not found or job.execution_mode <> 'REAL' or job.execution_attempt_id <> p_execution_attempt_id
    or job.lease_owner <> p_worker_id or job.lease_token <> p_lease_token
    or job.lease_expires_at <= clock_timestamp() or job.financial_ambiguity_started_at is null
    or job.status = 'COMPLETED' or job.execution_phase not in ('PROCESSING', 'WAITING_CHALLENGE') then
    return jsonb_build_object('result', 'lease_lost');
  end if;

  select status into current_status from public.gateway_move_operations
  where id = p_operation_id for update;
  if not found then return jsonb_build_object('result', 'not_ready'); end if;
  if p_status = 'REJECTED'
    and (current_status <> 'CHALLENGE_REQUIRED' or job.execution_phase <> 'WAITING_CHALLENGE') then
    return jsonb_build_object('result', 'not_ready');
  end if;
  if p_status = 'COMPLETED'
    and (current_status <> 'PROCESSING' or job.execution_phase <> 'PROCESSING') then
    return jsonb_build_object('result', 'not_ready');
  end if;
  if p_status = 'FAILED' and current_status not in ('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING') then
    return jsonb_build_object('result', 'not_ready');
  end if;
  if p_status = 'UNKNOWN' and current_status not in ('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING') then
    return jsonb_build_object('result', 'not_ready');
  end if;

  update public.gateway_move_execution_jobs
  set status = 'COMPLETED', execution_phase = 'TERMINAL',
      completed_at = clock_timestamp(), last_progress_at = clock_timestamp(), updated_at = clock_timestamp(),
      lease_owner = null, lease_token = null, lease_expires_at = null
  where id = job.id and operation_id = p_operation_id and execution_mode = 'REAL'
    and execution_attempt_id = p_execution_attempt_id
    and lease_owner = p_worker_id and lease_token = p_lease_token
    and lease_expires_at > clock_timestamp()
    and status <> 'COMPLETED' and execution_phase = job.execution_phase;
  if not found then raise exception 'REAL terminal mutation lost its fenced job'; end if;

  update public.gateway_move_operations
  set status = p_status, error_code = p_error_code,
      error_stage = case when p_error_code is null then null else 'execution' end,
      retryable = false, sanitized_result_json = coalesce(p_sanitized_result, sanitized_result_json),
      last_progress_at = clock_timestamp()
  where id = p_operation_id and status = current_status;
  if not found then raise exception 'REAL terminal operation transition lost its expected state'; end if;
  return jsonb_build_object('result', 'completed', 'status', p_status);
end;
$$;

revoke all on function public.deliver_gateway_move_real_signature(uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finish_gateway_move_real_execution(uuid, uuid, uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.deliver_gateway_move_real_signature(uuid, uuid, uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function public.finish_gateway_move_real_execution(uuid, uuid, uuid, uuid, uuid, text, text, jsonb)
  to service_role;
