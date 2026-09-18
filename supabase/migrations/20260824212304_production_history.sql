begin;

create or replace function public.record_geofence_event(
  p_geofence_id uuid,
  p_user_id uuid,
  p_location_id uuid,
  p_business_id uuid,
  p_event_type text,
  p_dwell_seconds integer default null,
  p_metadata jsonb default '{}'::jsonb,
  p_notification_id uuid default null,
  p_qr_code_id uuid default null,
  p_check_in_id uuid default null
) returns uuid
language plpgsql security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_user_id is distinct from auth.uid() then raise exception 'user identity mismatch'; end if;
  if p_geofence_id is null or p_location_id is null then raise exception 'geofence and location required'; end if;
  insert into public.geofence_events(geofence_id,user_id,location_id,business_id,event_type,dwell_seconds,metadata,notification_id,qr_code_id,check_in_id)
  values(p_geofence_id,auth.uid(),p_location_id,p_business_id,p_event_type,p_dwell_seconds,coalesce(p_metadata,'{}'::jsonb),p_notification_id,p_qr_code_id,p_check_in_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.consumer_feature_access(
  p_feature_code text,
  p_user_id uuid default auth.uid()
) returns boolean
language sql stable security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select case
    when auth.uid() is null then false
    when p_user_id is distinct from auth.uid() then false
    when not exists (select 1 from public.feature_catalog f where f.feature_code=p_feature_code and f.enabled) then false
    when exists (select 1 from public.feature_catalog f where f.feature_code=p_feature_code and f.category in ('business','fleet','enterprise','admin')) then false
    else true
  end;
$$;

create or replace function public.quest_advance_activity(
  p_user_id uuid,
  p_activity_type text,
  p_source_id uuid,
  p_location_id uuid default null,
  p_checkin_id uuid default null,
  p_qr_code_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare s record; v public.quest_participation; n integer:=0; v_user uuid:=auth.uid(); v_event text:=lower(trim(coalesce(p_activity_type,'')));
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_user_id is distinct from v_user then raise exception 'user identity mismatch'; end if;
  if v_event not in ('checkin','review','evidence','game') then return 0; end if;
  for s in
    select qs.*,q.id quest_id
    from public.quest_steps qs join public.quests q on q.id=qs.quest_id
    join public.quest_participation qp on qp.quest_id=q.id and qp.user_id=v_user and qp.status='started'
    where q.status='active' and qs.step_order=qp.current_step_order
      and ((v_event='checkin' and qs.step_type in ('checkin','visit','scan','arrive')) or
           (v_event='review' and qs.step_type in ('review','rate','evidence')) or
           (v_event='evidence' and qs.step_type in ('evidence','photo')) or
           (v_event='game' and qs.step_type='challenge'))
      and (qs.location_id is null or qs.location_id=p_location_id)
      and not exists(select 1 from public.quest_step_events e where e.participation_id=qp.id and e.quest_step_id=qs.id and ((p_checkin_id is not null and e.checkin_id=p_checkin_id) or (p_source_id is not null and e.metadata->>'source_id'=p_source_id::text)))
    order by q.id,qs.step_order
  loop
    select * into v from public.quest_participation where id=s.id for update;
    if v.status='started' and v.current_step_order=s.step_order then
      perform public.quest_record_step(v.id,s.id,v_event,'automatic',coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('source_id',p_source_id,'activity_type',v_event),p_location_id,null,p_qr_code_id,p_checkin_id);
      n:=n+1;
    end if;
  end loop;
  return n;
end;
$$;

commit;
