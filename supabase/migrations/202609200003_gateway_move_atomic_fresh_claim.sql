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
  if target.estimate_created_at is null
    or target.estimate_created_at + interval '60 seconds' <= clock_timestamp() then
    update public.gateway_move_operations
    set status = 'EXPIRED', last_progress_at = clock_timestamp()
    where id = target.id and account_id = p_account_id and status = 'AWAITING_CONFIRMATION';
    return jsonb_build_object('result', 'expired', 'status', 'EXPIRED');
  end if;

  begin
    update public.gateway_move_operations
    set status = 'SUBMITTING', started_at = coalesce(started_at, clock_timestamp()), last_progress_at = clock_timestamp()
    where id = target.id and account_id = p_account_id and status = 'AWAITING_CONFIRMATION';
  exception when unique_violation then
    return jsonb_build_object('result', 'active_operation_exists');
  end;

  if not found then
    return jsonb_build_object('result', 'not_executable');
  end if;
  return jsonb_build_object('result', 'claimed', 'operation_id', target.id, 'status', 'SUBMITTING');
end;
$$;
