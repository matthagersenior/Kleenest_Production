create table if not exists public.business_restroom_remediation_cases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  source_observation_id uuid references public.location_amenity_observations(id) on delete set null,
  status text not null default 'open' check (status in ('open','assigned','in_progress','resolved','dismissed')),
  priority integer not null default 50 check (priority between 0 and 100),
  assigned_to uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  assigned_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  dismissed_at timestamptz,
  resolution_notes text,
  resolution_observation_id uuid references public.location_amenity_observations(id) on delete set null,
  resolution_snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists business_restroom_remediation_active_key on public.business_restroom_remediation_cases(business_id,location_id,amenity_id) where status in ('open','assigned','in_progress');
create index if not exists business_restroom_remediation_business_status_idx on public.business_restroom_remediation_cases(business_id,status,priority desc,opened_at);
revoke all on public.business_restroom_remediation_cases from public,anon,authenticated;
grant select,insert,update,delete on public.business_restroom_remediation_cases to service_role;

create or replace function public.business_restroom_remediation_operations(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_cases jsonb; v_members jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;

 insert into public.business_restroom_remediation_cases(business_id,location_id,amenity_id,source_observation_id,priority,resolution_snapshot)
 select p_business_id,ao.location_id,ao.amenity_id,ao.id,
        least(100, greatest(40,55 + case when ao.status='absent' then 20 else 0 end + case when coalesce((ao.metadata->>'sentiment'),'')='needs_attention' then 15 else 0 end + case when ao.observed_at >= now()-interval '7 days' then 10 else 0 end)),
        jsonb_build_object('source_status',ao.status,'source_confidence',ao.confidence,'source_observed_at',ao.observed_at,'source_metadata',coalesce(ao.metadata,'{}'::jsonb))
 from (
   select distinct on (o.location_id,o.amenity_id) o.*
   from public.location_amenity_observations o
   join public.locations l on l.id=o.location_id
   where l.business_id=p_business_id and o.observed_at>=now()-interval '30 days'
     and (o.status='absent' or coalesce(o.metadata->>'sentiment','')='needs_attention')
   order by o.location_id,o.amenity_id,o.observed_at desc
 ) ao
 on conflict (business_id,location_id,amenity_id) where status in ('open','assigned','in_progress') do update
 set source_observation_id=excluded.source_observation_id,
     priority=greatest(public.business_restroom_remediation_cases.priority,excluded.priority),
     resolution_snapshot=public.business_restroom_remediation_cases.resolution_snapshot || excluded.resolution_snapshot,
     updated_at=now();

 update public.business_restroom_remediation_cases c
 set status='resolved',resolved_at=coalesce(c.resolved_at,now()),updated_at=now(),
     resolution_notes=coalesce(c.resolution_notes,'Automatically resolved by newer canonical evidence.'),
     resolution_snapshot=c.resolution_snapshot || jsonb_build_object('auto_resolved',true,'auto_resolved_at',now())
 where c.business_id=p_business_id and c.status in ('open','assigned','in_progress')
   and exists (
     select 1 from public.location_amenity_observations o
     where o.location_id=c.location_id and o.amenity_id=c.amenity_id
       and o.observed_at > coalesce((select so.observed_at from public.location_amenity_observations so where so.id=c.source_observation_id),c.opened_at)
       and o.status='present' and coalesce(o.confidence,0)>=0.7 and coalesce(o.metadata->>'sentiment','')<>'needs_attention'
   );

 select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'status',c.status,'priority',c.priority,'business_id',c.business_id,'location_id',c.location_id,'location_name',l.name,
   'amenity_id',c.amenity_id,'amenity_name',a.name,'assigned_to',c.assigned_to,'assigned_name',p.display_name,'source_observation_id',c.source_observation_id,
   'opened_at',c.opened_at,'assigned_at',c.assigned_at,'started_at',c.started_at,'resolved_at',c.resolved_at,'dismissed_at',c.dismissed_at,
   'resolution_notes',c.resolution_notes,'resolution_observation_id',c.resolution_observation_id,'resolution_snapshot',c.resolution_snapshot,'updated_at',c.updated_at
 ) order by case c.status when 'in_progress' then 0 when 'assigned' then 1 when 'open' then 2 when 'resolved' then 3 else 4 end,c.priority desc,c.opened_at desc),'[]'::jsonb)
 into v_cases
 from public.business_restroom_remediation_cases c
 join public.locations l on l.id=c.location_id join public.amenities a on a.id=c.amenity_id
 left join public.profiles p on p.id=c.assigned_to where c.business_id=p_business_id;

 select coalesce(jsonb_agg(jsonb_build_object('user_id',bm.user_id,'role',lower(bm.role::text),'display_name',coalesce(p.display_name,p.username,'Team member')) order by lower(bm.role::text),coalesce(p.display_name,p.username,'')),'[]'::jsonb)
 into v_members from public.business_members bm left join public.profiles p on p.id=bm.user_id where bm.business_id=p_business_id;

 return jsonb_build_object('business_id',p_business_id,'cases',v_cases,'members',v_members,'generated_at',now());
end $$;

create or replace function public.business_manage_restroom_remediation(p_business_id uuid,p_case_id uuid,p_action text,p_assigned_to uuid default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.business_restroom_remediation_cases; v_obs uuid; v_reporter uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
 select * into c from public.business_restroom_remediation_cases where id=p_case_id and business_id=p_business_id for update;
 if c.id is null then raise exception 'Remediation case not found'; end if;
 if p_action='assign' then
   if p_assigned_to is null or not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=p_assigned_to) then raise exception 'Assignee must be a business member'; end if;
   update public.business_restroom_remediation_cases set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),updated_at=now() where id=c.id;
   insert into public.notifications(user_id,type,title,body,data) values(p_assigned_to,'business_remediation_assignment','Restroom issue assigned',coalesce((select l.name from public.locations l where l.id=c.location_id),'A restroom')||' needs attention.',jsonb_build_object('business_id',p_business_id,'case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id));
 elsif p_action='claim' then
   update public.business_restroom_remediation_cases set status='assigned',assigned_to=auth.uid(),assigned_at=now(),updated_at=now() where id=c.id;
 elsif p_action='start' then
   update public.business_restroom_remediation_cases set status='in_progress',assigned_to=coalesce(assigned_to,auth.uid()),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),updated_at=now() where id=c.id;
 elsif p_action='release' then
   update public.business_restroom_remediation_cases set status='open',assigned_to=null,assigned_at=null,started_at=null,updated_at=now() where id=c.id;
 elsif p_action='dismiss' then
   update public.business_restroom_remediation_cases set status='dismissed',dismissed_at=now(),resolution_notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=c.id;
 elsif p_action='reopen' then
   update public.business_restroom_remediation_cases set status='open',resolved_at=null,dismissed_at=null,resolution_notes=null,resolution_observation_id=null,updated_at=now() where id=c.id;
 elsif p_action='resolve' then
   if nullif(trim(coalesce(p_notes,'')),'') is null then raise exception 'Resolution notes are required'; end if;
   insert into public.location_amenity_observations(location_id,user_id,amenity_id,status,confidence,verification_method,notes,observed_at,metadata)
   values(c.location_id,auth.uid(),c.amenity_id,'present',0.75,'business_remediation',trim(p_notes),now(),jsonb_build_object('source','business_remediation','business_id',p_business_id,'remediation_case_id',c.id,'sentiment','resolved_by_business')) returning id into v_obs;
   update public.business_restroom_remediation_cases set status='resolved',resolved_at=now(),assigned_to=coalesce(assigned_to,auth.uid()),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),resolution_notes=trim(p_notes),resolution_observation_id=v_obs,resolution_snapshot=resolution_snapshot||jsonb_build_object('resolved_by',auth.uid(),'resolved_at',now(),'resolution_observation_id',v_obs),updated_at=now() where id=c.id;
   select user_id into v_reporter from public.location_amenity_observations where id=c.source_observation_id;
   if v_reporter is not null and v_reporter<>auth.uid() then
     insert into public.notifications(user_id,type,title,body,data) values(v_reporter,'business_remediation_resolved','A restroom issue you reported was addressed',coalesce((select l.name from public.locations l where l.id=c.location_id),'A restroom')||' reported a business remediation update.',jsonb_build_object('business_id',p_business_id,'case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id,'resolution_observation_id',v_obs));
   end if;
 else raise exception 'Unsupported remediation action';
 end if;
 return (select to_jsonb(x) from (select rc.*,l.name location_name,a.name amenity_name,p.display_name assigned_name from public.business_restroom_remediation_cases rc join public.locations l on l.id=rc.location_id join public.amenities a on a.id=rc.amenity_id left join public.profiles p on p.id=rc.assigned_to where rc.id=c.id) x);
end $$;

revoke all on function public.business_restroom_remediation_operations(uuid) from public,anon;
revoke all on function public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.business_restroom_remediation_operations(uuid) to authenticated,service_role;
grant execute on function public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text) to authenticated,service_role;
