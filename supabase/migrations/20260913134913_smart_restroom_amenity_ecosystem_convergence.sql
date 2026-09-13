insert into public.amenities(name,category)
values ('Connected / Smart Restroom','Restroom')
on conflict(name) do update set category=excluded.category;

create table if not exists public.location_smart_restroom_state(
  location_id uuid primary key references public.locations(id) on delete cascade,
  business_confirmed boolean not null default false,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.location_smart_restroom_state enable row level security;
revoke all on table public.location_smart_restroom_state from public,anon,authenticated;
grant select,insert,update,delete on table public.location_smart_restroom_state to service_role;

insert into public.location_smart_restroom_state(location_id,business_confirmed,confirmed_at,metadata,updated_at)
select l.id,true,coalesce(l.updated_at,now()),jsonb_build_object('source','legacy_smart_bathroom_flag'),now()
from public.locations l
where coalesce(l.smart_bathroom,false)=true
on conflict(location_id) do update
set business_confirmed=true,
    confirmed_at=coalesce(public.location_smart_restroom_state.confirmed_at,excluded.confirmed_at),
    metadata=public.location_smart_restroom_state.metadata||excluded.metadata,
    updated_at=now();

create or replace function public.sync_smart_restroom_amenity(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_amenity uuid;
  v_business boolean:=false;
  v_device_count integer:=0;
  v_online_count integer:=0;
  v_previous boolean:=false;
  v_present boolean:=false;
  v_partner uuid;
begin
  if p_location_id is null then return '{}'::jsonb; end if;
  select id into v_amenity from public.amenities where name='Connected / Smart Restroom';
  if v_amenity is null then raise exception 'Smart Restroom amenity is missing'; end if;

  select coalesce(s.business_confirmed,false)
  into v_business
  from public.location_smart_restroom_state s
  where s.location_id=p_location_id;
  v_business:=coalesce(v_business,false);

  select count(*)::integer,
         count(*) filter(where d.status='online')::integer
  into v_device_count,v_online_count
  from public.smart_devices d
  join public.smart_device_connectors c on c.id=d.connector_id
  where d.location_id=p_location_id
    and d.status<>'disabled'
    and c.status<>'disabled';

  select coalesce(l.smart_bathroom,false) into v_previous
  from public.locations l where l.id=p_location_id;
  if not found then return '{}'::jsonb; end if;

  v_present:=v_business or v_device_count>0;

  update public.locations
  set smart_bathroom=v_present,
      updated_at=case when smart_bathroom is distinct from v_present then now() else updated_at end
  where id=p_location_id;

  if v_present then
    insert into public.location_amenities(location_id,amenity_id)
    values(p_location_id,v_amenity)
    on conflict do nothing;
  else
    delete from public.location_amenities
    where location_id=p_location_id and amenity_id=v_amenity;
  end if;

  if v_previous is distinct from v_present then
    for v_partner in
      select distinct c.platform_partner_id
      from public.smart_device_connectors c
      where c.location_id=p_location_id and c.platform_partner_id is not null
      union
      select distinct c.platform_partner_id
      from public.smart_device_connectors c
      join public.smart_devices d on d.connector_id=c.id
      where d.location_id=p_location_id and c.platform_partner_id is not null
    loop
      perform public.enqueue_platform_webhook_event(
        v_partner,
        'place.amenities_changed',
        jsonb_build_object(
          'locationId',p_location_id,
          'amenity','Connected / Smart Restroom',
          'present',v_present,
          'businessConfirmed',v_business,
          'deviceVerified',v_device_count>0,
          'deviceCount',v_device_count,
          'onlineDeviceCount',v_online_count
        )
      );
    end loop;
  end if;

  return jsonb_build_object(
    'location_id',p_location_id,
    'amenity_id',v_amenity,
    'present',v_present,
    'business_confirmed',v_business,
    'device_verified',v_device_count>0,
    'device_count',v_device_count,
    'online_device_count',v_online_count
  );
end;
$function$;
revoke all on function public.sync_smart_restroom_amenity(uuid) from public,anon,authenticated;
grant execute on function public.sync_smart_restroom_amenity(uuid) to service_role;

create or replace function public.smart_restroom_device_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_op='DELETE' then
    if old.location_id is not null then perform public.sync_smart_restroom_amenity(old.location_id); end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.location_id is distinct from new.location_id and old.location_id is not null then
    perform public.sync_smart_restroom_amenity(old.location_id);
  end if;
  if new.location_id is not null then perform public.sync_smart_restroom_amenity(new.location_id); end if;
  return new;
end;
$function$;
revoke all on function public.smart_restroom_device_sync_trigger() from public,anon,authenticated;

drop trigger if exists smart_restroom_device_sync on public.smart_devices;
create trigger smart_restroom_device_sync
after insert or delete or update of location_id,status,connector_id
on public.smart_devices
for each row execute function public.smart_restroom_device_sync_trigger();

create or replace function public.smart_restroom_connector_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_location uuid;
begin
  if old.status is not distinct from new.status then return new; end if;
  for v_location in
    select distinct d.location_id from public.smart_devices d
    where d.connector_id=new.id and d.location_id is not null
  loop
    perform public.sync_smart_restroom_amenity(v_location);
  end loop;
  return new;
end;
$function$;
revoke all on function public.smart_restroom_connector_sync_trigger() from public,anon,authenticated;

drop trigger if exists smart_restroom_connector_sync on public.smart_device_connectors;
create trigger smart_restroom_connector_sync
after update of status on public.smart_device_connectors
for each row execute function public.smart_restroom_connector_sync_trigger();

create or replace function public.business_set_location_amenity(
  p_business_id uuid,p_location_id uuid,p_amenity_id uuid,p_action text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_smart_amenity uuid;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_role:=lower(coalesce(public.current_user_business_role(p_business_id)::text,''));
  if not (
    public.is_platform_owner_session()
    or v_role in ('owner','admin','manager')
    or exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_admin,false))
  ) then raise exception 'Business owner/admin/manager permission required'; end if;

  if not exists(
    select 1 from public.locations l
    where l.id=p_location_id and (
      l.business_id=p_business_id or l.claimed_business_id=p_business_id
      or exists(select 1 from public.location_claims c where c.location_id=l.id and c.business_id=p_business_id and c.status='approved')
    )
  ) then raise exception 'Business does not manage this location'; end if;
  if not exists(select 1 from public.amenities a where a.id=p_amenity_id) then
    raise exception 'Amenity is not in the approved Kleenest amenity catalog';
  end if;
  if v_action not in ('add','remove','delete') then raise exception 'Action must be add or remove'; end if;

  select id into v_smart_amenity from public.amenities where name='Connected / Smart Restroom';
  if p_amenity_id=v_smart_amenity then
    insert into public.location_smart_restroom_state(location_id,business_confirmed,confirmed_by,confirmed_at,updated_at)
    values(p_location_id,v_action='add',auth.uid(),case when v_action='add' then now() else null end,now())
    on conflict(location_id) do update
      set business_confirmed=excluded.business_confirmed,
          confirmed_by=excluded.confirmed_by,
          confirmed_at=excluded.confirmed_at,
          updated_at=now();
    v_result:=public.sync_smart_restroom_amenity(p_location_id);
    return v_result || jsonb_build_object('success',true,'action',v_action,'business_id',p_business_id);
  end if;

  if v_action='add' then
    insert into public.location_amenities(location_id,amenity_id)
    values(p_location_id,p_amenity_id) on conflict do nothing;
  else
    delete from public.location_amenities where location_id=p_location_id and amenity_id=p_amenity_id;
  end if;
  return jsonb_build_object('success',true,'action',v_action,'location_id',p_location_id,'amenity_id',p_amenity_id);
end;
$function$;
revoke all on function public.business_set_location_amenity(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.business_set_location_amenity(uuid,uuid,uuid,text) to authenticated,service_role;

create or replace function public.business_smart_amenity_snapshot(p_business_id uuid,p_location_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_rows jsonb; v_summary jsonb;
begin
  if not public.smart_device_business_authorized(p_business_id,false) then
    raise exception 'Business access required' using errcode='42501';
  end if;

  with managed as (
    select l.id,l.name,l.city,l.state,l.smart_bathroom
    from public.locations l
    where l.is_active=true
      and (p_location_id is null or l.id=p_location_id)
      and (
        l.business_id=p_business_id or l.claimed_business_id=p_business_id
        or exists(select 1 from public.location_claims c where c.location_id=l.id and c.business_id=p_business_id and c.status='approved')
      )
  ), rows as (
    select m.*,
      coalesce(s.business_confirmed,false) business_confirmed,
      coalesce(d.device_count,0) device_count,
      coalesce(d.online_device_count,0) online_device_count,
      coalesce(d.offline_device_count,0) offline_device_count,
      coalesce(d.open_commands,0) open_commands,
      coalesce(d.critical_events_24h,0) critical_events_24h,
      coalesce(o.community_present,0) community_present,
      coalesce(o.community_absent,0) community_absent,
      o.latest_community_observation,
      coalesce(q.smart_qr_count,0) smart_qr_count
    from managed m
    left join public.location_smart_restroom_state s on s.location_id=m.id
    left join lateral (
      select count(*) filter(where sd.status<>'disabled' and sc.status<>'disabled')::int device_count,
             count(*) filter(where sd.status='online' and sc.status<>'disabled')::int online_device_count,
             count(*) filter(where sd.status='offline' and sc.status<>'disabled')::int offline_device_count,
             (select count(*)::int from public.smart_device_commands cmd join public.smart_devices x on x.id=cmd.device_id
               where x.location_id=m.id and cmd.status in ('pending_approval','queued','claimed','dispatched','acknowledged')) open_commands,
             (select count(*)::int from public.smart_device_events e join public.smart_devices x on x.id=e.device_id
               where x.location_id=m.id and e.severity='critical' and e.observed_at>now()-interval '24 hours') critical_events_24h
      from public.smart_devices sd join public.smart_device_connectors sc on sc.id=sd.connector_id
      where sd.location_id=m.id
    ) d on true
    left join lateral (
      select count(*) filter(where ao.status='present')::int community_present,
             count(*) filter(where ao.status='absent')::int community_absent,
             max(ao.observed_at) latest_community_observation
      from public.location_amenity_observations ao
      join public.amenities a on a.id=ao.amenity_id and a.name='Connected / Smart Restroom'
      where ao.location_id=m.id and ao.observed_at>=now()-interval '180 days'
    ) o on true
    left join lateral (
      select count(*)::int smart_qr_count
      from public.qr_codes qr
      where qr.business_id=p_business_id and qr.location_id=m.id and qr.active
        and qr.action_type in ('smart_amenity','smart_device_command')
    ) q on true
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by name),'[]'::jsonb) into v_rows from rows;

  select jsonb_build_object(
    'locations',count(*),
    'smart_locations',count(*) filter(where smart_bathroom),
    'business_confirmed',count(*) filter(where business_confirmed),
    'device_verified',count(*) filter(where device_count>0),
    'devices',coalesce(sum(device_count),0),
    'online_devices',coalesce(sum(online_device_count),0),
    'open_commands',coalesce(sum(open_commands),0),
    'critical_events_24h',coalesce(sum(critical_events_24h),0),
    'smart_qr_codes',coalesce(sum(smart_qr_count),0)
  ) into v_summary
  from jsonb_to_recordset(v_rows) as x(
    id uuid,name text,city text,state text,smart_bathroom boolean,business_confirmed boolean,
    device_count int,online_device_count int,offline_device_count int,open_commands int,
    critical_events_24h int,community_present int,community_absent int,
    latest_community_observation timestamptz,smart_qr_count int
  );

  return jsonb_build_object('business_id',p_business_id,'summary',coalesce(v_summary,'{}'::jsonb),'locations',v_rows,'generated_at',now());
end;
$function$;
revoke all on function public.business_smart_amenity_snapshot(uuid,uuid) from public,anon;
grant execute on function public.business_smart_amenity_snapshot(uuid,uuid) to authenticated,service_role;

create or replace function public.get_location_amenity_inventory(p_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with recent as (
  select o.amenity_id,o.status,o.observed_quantity,o.observed_at,o.user_id,o.metadata
  from public.location_amenity_observations o
  where o.location_id=p_location_id and o.observed_at>=now()-interval '180 days'
), agg as (
  select a.id amenity_id,a.name,a.category,
    round(avg(r.observed_quantity) filter(where r.status='present' and r.observed_quantity is not null)::numeric)::int observed_quantity,
    count(r.amenity_id)::int sample_count,count(distinct r.user_id)::int contributor_count,
    count(r.amenity_id) filter(where r.status='present')::int present_count,
    count(r.amenity_id) filter(where r.status='absent')::int absent_count,
    max(r.observed_at) freshest_observed_at,
    max(r.observed_at) filter(where r.status='absent' or coalesce(r.metadata->>'sentiment','')='needs_attention') latest_attention_at
  from public.amenities a
  left join recent r on r.amenity_id=a.id
  where exists(select 1 from public.location_amenities la where la.location_id=p_location_id and la.amenity_id=a.id) or r.amenity_id is not null
  group by a.id,a.name,a.category
), scored as (
  select *,
    (present_count>0 and absent_count>0 and greatest(present_count,absent_count)<3*least(present_count,absent_count)) unresolved_conflict
  from agg
), response as (
  select distinct on (c.amenity_id)
    c.amenity_id,c.status,c.opened_at,c.assigned_at,c.started_at,c.resolved_at,c.resolution_media_id,c.updated_at
  from public.business_restroom_remediation_cases c
  where c.location_id=p_location_id
  order by c.amenity_id,c.opened_at desc,c.updated_at desc
), smart as (
  select
    a.id amenity_id,
    coalesce(s.business_confirmed,false) business_confirmed,
    count(d.id) filter(where d.status<>'disabled' and c.status<>'disabled')::int device_count,
    count(d.id) filter(where d.status='online' and c.status<>'disabled')::int online_device_count,
    count(d.id) filter(where d.status='offline' and c.status<>'disabled')::int offline_device_count
  from public.amenities a
  left join public.location_smart_restroom_state s on s.location_id=p_location_id
  left join public.smart_devices d on d.location_id=p_location_id
  left join public.smart_device_connectors c on c.id=d.connector_id
  where a.name='Connected / Smart Restroom'
  group by a.id,s.business_confirmed
)
select coalesce(jsonb_agg(jsonb_build_object(
  'amenity_id',s.amenity_id,'name',s.name,'category',s.category,'observed_quantity',s.observed_quantity,
  'sample_count',s.sample_count,'contributor_count',s.contributor_count,'present_count',s.present_count,'absent_count',s.absent_count,
  'status_conflict',s.unresolved_conflict,
  'consensus_status',case when s.present_count=0 and s.absent_count=0 then 'unknown' when s.present_count>=3*greatest(s.absent_count,1) then 'present' when s.absent_count>=3*greatest(s.present_count,1) then 'absent' when s.unresolved_conflict then 'disputed' when s.present_count>=s.absent_count then 'present' else 'absent' end,
  'confidence_score',case when s.sample_count=0 then 0 else greatest(0,least(100,35+least(30,s.contributor_count*10)+case when s.freshest_observed_at>=now()-interval '7 days' then 25 when s.freshest_observed_at>=now()-interval '30 days' then 15 when s.freshest_observed_at>=now()-interval '90 days' then 5 else 0 end-case when s.unresolved_conflict then 20 else 0 end))::int end,
  'freshness',case when s.freshest_observed_at is null then 'unknown' when s.freshest_observed_at>=now()-interval '7 days' then 'fresh' when s.freshest_observed_at>=now()-interval '30 days' then 'recent' when s.freshest_observed_at>=now()-interval '90 days' then 'aging' else 'stale' end,
  'freshest_observed_at',s.freshest_observed_at,
  'business_response_status',case when r.status='open' then 'reported' when r.status in ('assigned','in_progress') then 'being_addressed' when r.status='resolved' and (s.latest_attention_at is null or r.resolved_at>=s.latest_attention_at) then 'addressed' else null end,
  'business_response_at',case when r.status='resolved' and (s.latest_attention_at is null or r.resolved_at>=s.latest_attention_at) then r.resolved_at when r.status='in_progress' then coalesce(r.started_at,r.assigned_at,r.opened_at) when r.status='assigned' then coalesce(r.assigned_at,r.opened_at) when r.status='open' then r.opened_at else null end,
  'business_proof_available',case when r.status='resolved' and r.resolution_media_id is not null and (s.latest_attention_at is null or r.resolved_at>=s.latest_attention_at) then true else false end,
  'business_confirmed',case when s.name='Connected / Smart Restroom' then coalesce(sm.business_confirmed,false) else false end,
  'device_verified',case when s.name='Connected / Smart Restroom' then coalesce(sm.device_count,0)>0 else false end,
  'device_count',case when s.name='Connected / Smart Restroom' then coalesce(sm.device_count,0) else 0 end,
  'online_device_count',case when s.name='Connected / Smart Restroom' then coalesce(sm.online_device_count,0) else 0 end,
  'offline_device_count',case when s.name='Connected / Smart Restroom' then coalesce(sm.offline_device_count,0) else 0 end
) order by s.category,s.name),'[]'::jsonb)
from scored s
left join response r on r.amenity_id=s.amenity_id
left join smart sm on sm.amenity_id=s.amenity_id;
$function$;
revoke all on function public.get_location_amenity_inventory(uuid) from public;
grant execute on function public.get_location_amenity_inventory(uuid) to anon,authenticated,service_role;

create or replace function public.qr_studio_validate_action(p_action_type text,p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $function$
declare
  a text:=lower(coalesce(nullif(trim(p_action_type),''),'checkin'));
  v jsonb:=coalesce(p_payload,'{}'::jsonb);
  u text;
begin
  if jsonb_typeof(v)<>'object' then raise exception 'QR action payload must be an object'; end if;
  if a not in (
    'checkin','location_details','review','directions','route_add','promotion_redeem',
    'contest_entry','game_entry','loyalty','reward','event_entry','reverify','trust_mission',
    'premium_redeem','fleet_checkpoint','enterprise_campaign','kleenest_deep_link','external_url',
    'smart_amenity','smart_device_command'
  ) then raise exception 'Unsupported QR action type: %',a; end if;
  if a='external_url' then
    u:=nullif(trim(v->>'url'),'');
    if u is null or u !~* '^https?://' then raise exception 'External QR actions require an http(s) URL'; end if;
  end if;
  if a='kleenest_deep_link' then
    u:=nullif(trim(v->>'url'),'');
    if u is null or u !~* '^kleenest(-[a-z0-9]+)?://' then raise exception 'Kleenest deep link is invalid'; end if;
  end if;
  if a='smart_device_command' then
    if coalesce(v->>'deviceId','') !~* '^[0-9a-f-]{36}$' then raise exception 'Smart Device QR requires deviceId'; end if;
    if nullif(trim(v->>'command'),'') is null then raise exception 'Smart Device QR requires command'; end if;
    if v ? 'arguments' and jsonb_typeof(v->'arguments')<>'object' then raise exception 'Smart Device QR arguments must be an object'; end if;
  end if;
  return v;
end;
$function$;

create or replace function public.business_create_smart_restroom_qr(
  p_business_id uuid,p_location_id uuid,p_mode text default 'contribute',
  p_device_id uuid default null,p_command text default null
) returns public.qr_codes
language plpgsql
security definer
set search_path=''
as $function$
declare v_mode text:=lower(trim(coalesce(p_mode,'contribute'))); v_qr public.qr_codes;
begin
  if not public.smart_device_business_authorized(p_business_id,true) then raise exception 'Business owner/admin/manager permission required'; end if;
  if not exists(
    select 1 from public.locations l where l.id=p_location_id and (
      l.business_id=p_business_id or l.claimed_business_id=p_business_id
      or exists(select 1 from public.location_claims c where c.location_id=l.id and c.business_id=p_business_id and c.status='approved')
    )
  ) then raise exception 'Business does not manage this location'; end if;

  if v_mode='contribute' then
    select * into v_qr from public.business_create_custom_qr(
      p_business_id,p_location_id,'Confirm Smart Restroom','smart_restroom','smart_amenity',
      jsonb_build_object('amenity','Connected / Smart Restroom','locationId',p_location_id),
      jsonb_build_object('theme','smart_restroom'),false,null
    );
  elsif v_mode='command' then
    if p_device_id is null or nullif(trim(coalesce(p_command,'')),'') is null then raise exception 'Device and command are required'; end if;
    if not exists(select 1 from public.smart_devices d where d.id=p_device_id and d.business_id=p_business_id and d.location_id=p_location_id) then
      raise exception 'Smart Device is not attached to this Business location';
    end if;
    select * into v_qr from public.business_create_custom_qr(
      p_business_id,p_location_id,'Smart Device Action','smart_device','smart_device_command',
      jsonb_build_object('deviceId',p_device_id,'command',trim(p_command),'arguments','{}'::jsonb),
      jsonb_build_object('theme','smart_restroom'),false,null
    );
  else raise exception 'Mode must be contribute or command'; end if;
  return v_qr;
end;
$function$;
revoke all on function public.business_create_smart_restroom_qr(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.business_create_smart_restroom_qr(uuid,uuid,text,uuid,text) to authenticated,service_role;

create or replace function public.execute_smart_device_qr_action(p_qr_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_qr public.qr_codes; v_device uuid; v_command text; v_args jsonb; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_qr from public.qr_codes where code=p_qr_code and active=true and action_type='smart_device_command' limit 1;
  if v_qr.id is null then raise exception 'Invalid or inactive Smart Device QR'; end if;
  if not public.smart_device_business_authorized(v_qr.business_id,true) then raise exception 'Business owner/admin/manager permission required'; end if;

  v_device:=nullif(v_qr.action_payload->>'deviceId','')::uuid;
  v_command:=trim(coalesce(v_qr.action_payload->>'command',''));
  v_args:=case when jsonb_typeof(v_qr.action_payload->'arguments')='object' then v_qr.action_payload->'arguments' else '{}'::jsonb end;
  if not exists(
    select 1 from public.smart_devices d
    where d.id=v_device and d.business_id=v_qr.business_id
      and (v_qr.location_id is null or d.location_id=v_qr.location_id)
  ) then raise exception 'Smart Device QR scope mismatch'; end if;

  v_result:=public.smart_device_command(
    v_qr.business_id,v_device,v_command,v_args,
    'qr:'||v_qr.id::text||':'||gen_random_uuid()::text,now()+interval '5 minutes'
  );
  perform public.record_qr_attribution(v_qr.code,'smart_device_command','operator',
    jsonb_build_object('qr_id',v_qr.id,'device_id',v_device,'command',v_command));
  return jsonb_build_object('qr_id',v_qr.id,'location_id',v_qr.location_id,'command',v_result);
end;
$function$;
revoke all on function public.execute_smart_device_qr_action(text) from public,anon;
grant execute on function public.execute_smart_device_qr_action(text) to authenticated,service_role;

select public.sync_smart_restroom_amenity(l.id)
from public.locations l
where l.smart_bathroom=true
   or exists(select 1 from public.smart_devices d where d.location_id=l.id and d.status<>'disabled');
