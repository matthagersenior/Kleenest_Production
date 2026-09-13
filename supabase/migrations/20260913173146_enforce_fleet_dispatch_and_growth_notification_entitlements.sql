
create or replace function public.fleet_update_dispatch_signal_policy(
  p_business_id uuid,
  p_occupancy_enabled boolean default true,
  p_occupancy_fresh_minutes integer default 30,
  p_high_utilization_pct numeric default 80,
  p_queue_threshold integer default 1,
  p_high_utilization_weight integer default 15,
  p_queue_weight integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.fleet_actor_is_manager(p_business_id) then
    raise exception 'Fleet manager access required';
  end if;

  if p_occupancy_fresh_minutes not between 5 and 240 then
    raise exception 'Occupancy freshness window out of range';
  end if;
  if p_high_utilization_pct < 0 or p_high_utilization_pct > 100 then
    raise exception 'Utilization threshold out of range';
  end if;
  if p_queue_threshold < 0 or p_queue_threshold > 10000 then
    raise exception 'Queue threshold out of range';
  end if;
  if p_high_utilization_weight < 0 or p_high_utilization_weight > 100
     or p_queue_weight < 0 or p_queue_weight > 100 then
    raise exception 'Priority weight out of range';
  end if;

  insert into public.fleet_dispatch_signal_policies(
    business_id,occupancy_enabled,occupancy_fresh_minutes,high_utilization_pct,
    queue_threshold,high_utilization_weight,queue_weight,updated_by,updated_at
  )
  values(
    p_business_id,coalesce(p_occupancy_enabled,true),p_occupancy_fresh_minutes,
    p_high_utilization_pct,p_queue_threshold,p_high_utilization_weight,
    p_queue_weight,auth.uid(),now()
  )
  on conflict(business_id) do update set
    occupancy_enabled=excluded.occupancy_enabled,
    occupancy_fresh_minutes=excluded.occupancy_fresh_minutes,
    high_utilization_pct=excluded.high_utilization_pct,
    queue_threshold=excluded.queue_threshold,
    high_utilization_weight=excluded.high_utilization_weight,
    queue_weight=excluded.queue_weight,
    updated_by=auth.uid(),
    updated_at=now();

  return public.fleet_dispatch_signal_policy(p_business_id);
end;
$$;

revoke all on function public.fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer) from public,anon;
grant execute on function public.fleet_update_dispatch_signal_policy(uuid,boolean,integer,numeric,integer,integer,integer) to authenticated,service_role;

create or replace function public.business_send_custom_notification(
  p_business_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_audience_scope text default 'business',
  p_payload jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_scope text:=lower(trim(coalesce(p_audience_scope,'business')));
  v_event_type text:=nullif(left(trim(coalesce(p_event_type,'')),100),'');
  v_title text:=nullif(left(trim(coalesce(p_title,'')),160),'');
  v_body text:=nullif(left(trim(coalesce(p_body,'')),2000),'');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not public.business_capability_allowed(p_business_id,'growth.custom_notifications') then
    raise exception 'Business Growth custom-notification capability required';
  end if;

  if not exists(
    select 1
    from public.feature_catalog
    where feature_code='business_custom_notifications' and enabled
  ) then
    raise exception 'Capability unavailable';
  end if;

  if v_event_type is null then raise exception 'Event type is required'; end if;
  if v_title is null then raise exception 'Notification title is required'; end if;
  if v_body is null then raise exception 'Notification body is required'; end if;
  if v_scope not in ('user','nearby','followers','business') then
    raise exception 'Invalid audience scope';
  end if;
  if jsonb_typeof(coalesce(p_payload,'{}'::jsonb))<>'object' then
    raise exception 'Notification payload must be an object';
  end if;

  insert into public.notification_events(
    event_type,actor_user_id,audience_scope,payload,expires_at
  )
  values(
    v_event_type,
    auth.uid(),
    v_scope,
    jsonb_build_object(
      'business_id',p_business_id,
      'title',v_title,
      'body',v_body
    ) || coalesce(p_payload,'{}'::jsonb),
    p_expires_at
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.business_send_custom_notification(uuid,text,text,text,text,jsonb,timestamptz) from public,anon;
grant execute on function public.business_send_custom_notification(uuid,text,text,text,text,jsonb,timestamptz) to authenticated,service_role;
