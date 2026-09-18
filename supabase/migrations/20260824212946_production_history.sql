create or replace function public.publish_live_network_event(p_event_type text, p_location_id uuid default null, p_actor_type text default 'user', p_actor_id uuid default null, p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare v_id uuid; v_user uuid := auth.uid(); v_actor_id uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if nullif(trim(p_event_type),'') is null then raise exception 'event_type is required'; end if;
 if p_actor_type not in ('user','business','fleet','enterprise') then raise exception 'Invalid actor type'; end if;
 if p_actor_type='user' then
   if p_actor_id is not null and p_actor_id<>v_user then raise exception 'actor identity mismatch'; end if;
   v_actor_id:=v_user;
 elsif p_actor_type='business' then
   if p_actor_id is null or not exists(select 1 from public.business_members bm where bm.business_id=p_actor_id and bm.user_id=v_user and bm.role in ('owner','manager')) then raise exception 'business actor access denied'; end if;
   v_actor_id:=p_actor_id;
 elsif p_actor_type='fleet' then
   if p_actor_id is null or not exists(select 1 from public.businesses b join public.business_members bm on bm.business_id=b.id where b.id=p_actor_id and lower(b.business_tier::text)='fleet' and bm.user_id=v_user and bm.role in ('owner','manager')) then raise exception 'fleet actor access denied'; end if;
   v_actor_id:=p_actor_id;
 elsif p_actor_type='enterprise' then
   if p_actor_id is null or not exists(select 1 from public.businesses b join public.business_members bm on bm.business_id=b.id where b.id=p_actor_id and lower(b.business_tier::text)='enterprise' and bm.user_id=v_user and bm.role in ('owner','manager')) then raise exception 'enterprise actor access denied'; end if;
   v_actor_id:=p_actor_id;
 end if;
 insert into public.live_network_events(event_type,location_id,actor_type,actor_id,payload) values(trim(p_event_type),p_location_id,p_actor_type,v_actor_id,coalesce(p_payload,'{}'::jsonb)) returning id into v_id;
 return v_id;
end; $$;

create or replace function public.record_network_leaderboard_participation(p_leaderboard_key text,p_actor_id uuid,p_actor_type text,p_metric_value numeric,p_source_event text,p_source_id uuid default null,p_period_start date default null,p_period_end date default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare v_id uuid; v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.network_leaderboard_sources where leaderboard_key=p_leaderboard_key and active) then raise exception 'Unknown or inactive leaderboard'; end if;
 if p_actor_type='user' then if p_actor_id<>v_user then raise exception 'actor identity mismatch'; end if;
 elsif p_actor_type in ('business','fleet','enterprise') then
   if not exists(select 1 from public.business_members bm join public.businesses b on b.id=bm.business_id where bm.business_id=p_actor_id and bm.user_id=v_user and bm.role in ('owner','manager') and (p_actor_type='business' or lower(b.business_tier::text)=p_actor_type)) then raise exception 'actor access denied'; end if;
 else raise exception 'invalid actor type'; end if;
 insert into public.network_leaderboard_participation(leaderboard_key,actor_id,actor_type,metric_value,source_event,source_id,period_start,period_end,metadata) values(p_leaderboard_key,p_actor_id,p_actor_type,p_metric_value,p_source_event,p_source_id,p_period_start,p_period_end,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 return v_id;
end; $$;

create or replace function public.record_data_feature_event(p_event_type text,p_feature_code text default null,p_subject_type text default 'user',p_subject_id uuid default null,p_location_id uuid default null,p_business_id uuid default null,p_fleet_vehicle_id uuid default null,p_source_table text default null,p_source_id uuid default null,p_value_numeric numeric default null,p_value_text text default null,p_metadata jsonb default '{}'::jsonb)
returns public.data_feature_events language plpgsql security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare uid uuid:=auth.uid(); r public.data_feature_events;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_subject_type not in ('user','business','fleet_vehicle','location') then raise exception 'Invalid subject type'; end if;
 if p_subject_type='user' and coalesce(p_subject_id,uid)<>uid then raise exception 'subject identity mismatch'; end if;
 if p_business_id is not null and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=uid and bm.role in ('owner','manager','analyst')) then raise exception 'business access denied'; end if;
 if p_fleet_vehicle_id is not null and not exists(select 1 from public.fleet_vehicles fv join public.business_members bm on bm.business_id=fv.business_id where fv.id=p_fleet_vehicle_id and bm.user_id=uid and bm.role in ('owner','manager','analyst')) then raise exception 'fleet vehicle access denied'; end if;
 if p_subject_type='business' and (p_subject_id is null or not exists(select 1 from public.business_members bm where bm.business_id=p_subject_id and bm.user_id=uid and bm.role in ('owner','manager','analyst'))) then raise exception 'business subject access denied'; end if;
 if p_subject_type='fleet_vehicle' and (p_subject_id is null or not exists(select 1 from public.fleet_vehicles fv join public.business_members bm on bm.business_id=fv.business_id where fv.id=p_subject_id and bm.user_id=uid and bm.role in ('owner','manager','analyst'))) then raise exception 'fleet subject access denied'; end if;
 if p_subject_type='location' and p_subject_id is null then raise exception 'location subject required'; end if;
 insert into public.data_feature_events(subject_type,subject_id,actor_user_id,business_id,location_id,fleet_vehicle_id,event_type,feature_code,source_table,source_id,value_numeric,value_text,metadata,occurred_at,event_validity,confidence,deduplication_key,rate_limit_context) values(p_subject_type,coalesce(p_subject_id,uid),uid,p_business_id,p_location_id,p_fleet_vehicle_id,p_event_type,p_feature_code,p_source_table,p_source_id,p_value_numeric,p_value_text,coalesce(p_metadata,'{}'::jsonb),now(),'valid',1,md5(concat_ws('|',uid::text,p_event_type,coalesce(p_source_id::text,''),coalesce(p_location_id::text,''),coalesce(p_value_text,''),date_trunc('minute',now())::text)),jsonb_build_object('minute',date_trunc('minute',now()))) returning * into r; return r;
end; $$;
