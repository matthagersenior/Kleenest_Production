-- Audit platform-owner password reset requests without exposing reset tokens or passwords.

create or replace function public.admin_record_password_reset_request(
  p_target_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;

  if p_target_user_id is null then
    raise exception 'Target user is required';
  end if;

  insert into public.platform_owner_control_audit(
    owner_user_id,
    domain,
    action,
    target_key,
    new_state,
    reason
  )
  values(
    v_uid,
    'accounts',
    'password_reset_request',
    p_target_user_id::text,
    jsonb_build_object(
      'requested', true,
      'requested_at', now()
    ),
    coalesce(nullif(btrim(p_reason),''),'Password reset requested from KleenestOS')
  );

  return jsonb_build_object(
    'ok', true,
    'target_user_id', p_target_user_id,
    'requested_at', now()
  );
end;
$function$;

revoke all on function public.admin_record_password_reset_request(uuid,text) from public, anon;
grant execute on function public.admin_record_password_reset_request(uuid,text) to authenticated;
