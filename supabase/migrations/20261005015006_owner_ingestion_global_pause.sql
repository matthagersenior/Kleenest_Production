-- Owner ingestion control-plane authority; audited controls are surfaced through KleenestOS.
-- Modern KleenestOS global ingestion control.
-- PR lifecycle metadata documents the Owner flow and verification contract.
-- Keeps the existing storage guard as the single enforcement point while replacing
-- the retired resume-authorization UI with an audited owner pause/resume action.

create or replace function public.owner_set_ingestion_global_pause(
  p_paused boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_status jsonb;
  v_reason text := nullif(left(trim(coalesce(p_reason,'')),500),'');
begin
  if v_uid is null or not public.is_platform_owner(v_uid) then
    raise exception 'Platform owner access required';
  end if;

  select to_jsonb(g)
    into v_before
  from public.national_ingestion_storage_guard g
  where g.singleton=true
  for update;

  if v_before is null then
    raise exception 'Ingestion storage guard is unavailable';
  end if;

  if coalesce(p_paused,false) then
    update public.national_ingestion_storage_guard
       set paused=true,
           pause_reason=coalesce(v_reason,'manual_owner_pause'),
           paused_at=coalesce(paused_at,now()),
           resume_authorized=false,
           resume_authorized_at=null,
           resume_authorized_by=null,
           updated_at=now()
     where singleton=true;
  else
    v_status:=public.national_ingestion_storage_status();
    if coalesce((v_status->>'hard_stop')::boolean,false) then
      raise exception 'Cannot resume ingestion while the storage hard stop is active';
    end if;

    update public.national_ingestion_storage_guard
       set paused=false,
           pause_reason=null,
           paused_at=null,
           resume_authorized=true,
           resume_authorized_at=now(),
           resume_authorized_by=v_uid,
           updated_at=now()
     where singleton=true;
  end if;

  select to_jsonb(g)
    into v_after
  from public.national_ingestion_storage_guard g
  where g.singleton=true;

  insert into public.platform_owner_control_audit(
    owner_user_id,domain,action,target_key,previous_state,new_state,reason
  )
  values(
    v_uid,
    'ingestion',
    case when coalesce(p_paused,false) then 'global_pause' else 'global_resume' end,
    'global',
    coalesce(v_before,'{}'::jsonb),
    coalesce(v_after,'{}'::jsonb),
    coalesce(v_reason,case when coalesce(p_paused,false) then 'Paused from KleenestOS' else 'Resumed from KleenestOS' end)
  );

  return jsonb_build_object(
    'paused',coalesce((v_after->>'paused')::boolean,false),
    'pause_reason',v_after->>'pause_reason',
    'storage_guard',v_after,
    'updated_at',v_after->>'updated_at'
  );
end;
$function$;

revoke all on function public.owner_set_ingestion_global_pause(boolean,text) from public,anon;
grant execute on function public.owner_set_ingestion_global_pause(boolean,text) to authenticated,service_role;
