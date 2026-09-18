create or replace function public.business_manage_contest(p_business_id uuid, p_contest_id uuid default null, p_action text default 'create', p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_action text := lower(trim(coalesce(p_action,'create')));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_id uuid;
  v_ok boolean;
begin
  if v_action = 'create' then
    v_id := public.business_create_contest(
      p_business_id,
      coalesce(nullif(v_payload->>'name',''),'Kleenest community contest'),
      nullif(v_payload->>'description',''),
      coalesce((v_payload->>'starts_at')::timestamptz, now()),
      nullif(v_payload->>'ends_at','')::timestamptz,
      coalesce(v_payload->'scoring_rules','{}'::jsonb),
      coalesce(v_payload->'rewards','{}'::jsonb)
    );
    return jsonb_build_object('id',v_id,'action','create');
  elsif v_action in ('update','activate','pause','resume') then
    if p_contest_id is null then raise exception 'contest id is required'; end if;
    v_ok := public.business_update_contest(
      p_business_id,
      p_contest_id,
      coalesce(nullif(v_payload->>'name',''),null),
      nullif(v_payload->>'description',''),
      nullif(v_payload->>'starts_at','')::timestamptz,
      nullif(v_payload->>'ends_at','')::timestamptz,
      coalesce(v_payload->'scoring_rules','{}'::jsonb),
      coalesce(v_payload->'rewards','{}'::jsonb),
      case v_action when 'activate' then 'active' when 'pause' then 'paused' when 'resume' then 'active' else null end
    );
    return jsonb_build_object('id',p_contest_id,'action',v_action,'updated',coalesce(v_ok,false));
  elsif v_action = 'delete' then
    if p_contest_id is null then raise exception 'contest id is required'; end if;
    v_ok := public.business_delete_contest(p_business_id,p_contest_id);
    return jsonb_build_object('id',p_contest_id,'action','delete','deleted',coalesce(v_ok,false));
  else
    raise exception 'unsupported contest action: %',v_action;
  end if;
end;
$$;
grant execute on function public.business_manage_contest(uuid,uuid,text,jsonb) to authenticated;
