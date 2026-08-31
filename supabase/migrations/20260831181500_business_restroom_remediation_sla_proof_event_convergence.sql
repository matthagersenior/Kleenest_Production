alter table public.business_restroom_remediation_cases
  add column if not exists due_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists resolution_media_id uuid references public.location_photos(id) on delete set null;

create or replace function public.restroom_remediation_sla_hours(p_priority integer)
returns integer language sql immutable set search_path='' as $$
  select case when coalesce(p_priority,0)>=90 then 4 when coalesce(p_priority,0)>=80 then 8 when coalesce(p_priority,0)>=70 then 12 when coalesce(p_priority,0)>=60 then 24 else 48 end;
$$;

create or replace function public.apply_restroom_remediation_sla()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('open','assigned','in_progress') and (new.due_at is null or new.priority is distinct from old.priority) then
    new.due_at:=new.opened_at+make_interval(hours=>public.restroom_remediation_sla_hours(new.priority));
  end if;
  new.updated_at:=now(); return new;
end $$;
drop trigger if exists trg_apply_restroom_remediation_sla on public.business_restroom_remediation_cases;
create trigger trg_apply_restroom_remediation_sla before insert or update of priority,status on public.business_restroom_remediation_cases for each row execute function public.apply_restroom_remediation_sla();
update public.business_restroom_remediation_cases set due_at=opened_at+make_interval(hours=>public.restroom_remediation_sla_hours(priority)) where due_at is null;
alter table public.business_restroom_remediation_cases alter column due_at set not null;
create index if not exists business_restroom_remediation_due_idx on public.business_restroom_remediation_cases(status,due_at,escalation_level) where status in ('open','assigned','in_progress');

create or replace function public.sync_restroom_remediation_from_observation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_business_id uuid; v_priority integer; v_case record; v_reporter uuid;
begin
  select coalesce(l.business_id,(select bl.business_id from public.business_locations bl where bl.location_id=new.location_id limit 1)) into v_business_id from public.locations l where l.id=new.location_id;
  if v_business_id is null then return new; end if;
  if new.status='present' and coalesce(new.confidence,0)>=0.7 and coalesce(new.metadata->>'sentiment','')<>'needs_attention' and coalesce(new.metadata->>'source','')<>'business_remediation' then
    for v_case in select c.id,c.source_observation_id from public.business_restroom_remediation_cases c where c.business_id=v_business_id and c.location_id=new.location_id and c.amenity_id=new.amenity_id and c.status in ('open','assigned','in_progress') loop
      update public.business_restroom_remediation_cases set status='resolved',resolved_at=now(),resolution_observation_id=new.id,resolution_notes='Automatically resolved by newer strong canonical evidence.',resolution_snapshot=coalesce(resolution_snapshot,'{}'::jsonb)||jsonb_build_object('auto_resolved',true,'auto_resolved_at',now(),'auto_resolution_observation_id',new.id,'auto_resolution_source',coalesce(new.metadata->>'source','canonical_observation')),updated_at=now() where id=v_case.id;
      select o.user_id into v_reporter from public.location_amenity_observations o where o.id=v_case.source_observation_id;
      if v_reporter is not null and v_reporter<>new.user_id then insert into public.notifications(user_id,type,title,body,data) values(v_reporter,'restroom_attention_cleared','Restroom evidence was updated',coalesce((select l.name from public.locations l where l.id=new.location_id),'A restroom')||' now has newer evidence indicating the reported amenity is present.',jsonb_build_object('business_id',v_business_id,'case_id',v_case.id,'location_id',new.location_id,'amenity_id',new.amenity_id,'resolution_observation_id',new.id,'resolution_source','canonical_evidence')); end if;
    end loop;
    return new;
  end if;
  if not(new.status='absent' or coalesce(new.metadata->>'sentiment','')='needs_attention') then return new; end if;
  v_priority:=least(100,greatest(40,55+case when new.status='absent' then 20 else 0 end+case when coalesce(new.metadata->>'sentiment','')='needs_attention' then 15 else 0 end+case when new.observed_at>=now()-interval '7 days' then 10 else 0 end));
  insert into public.business_restroom_remediation_cases(business_id,location_id,amenity_id,source_observation_id,priority,resolution_snapshot)
  values(v_business_id,new.location_id,new.amenity_id,new.id,v_priority,jsonb_build_object('source_status',new.status,'source_confidence',new.confidence,'source_observed_at',new.observed_at,'source_metadata',coalesce(new.metadata,'{}'::jsonb),'event_opened',true))
  on conflict (business_id,location_id,amenity_id) where status in ('open','assigned','in_progress') do update set source_observation_id=excluded.source_observation_id,priority=greatest(public.business_restroom_remediation_cases.priority,excluded.priority),resolution_snapshot=coalesce(public.business_restroom_remediation_cases.resolution_snapshot,'{}'::jsonb)||excluded.resolution_snapshot,updated_at=now();
  return new;
end $$;
drop trigger if exists trg_sync_restroom_remediation_from_observation on public.location_amenity_observations;
create trigger trg_sync_restroom_remediation_from_observation after insert or update of status,confidence,metadata on public.location_amenity_observations for each row execute function public.sync_restroom_remediation_from_observation();

create or replace function public.process_restroom_remediation_slas()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; v_target integer; v_escalated integer:=0;
begin
  for r in select c.*,l.name location_name,a.name amenity_name from public.business_restroom_remediation_cases c join public.locations l on l.id=c.location_id join public.amenities a on a.id=c.amenity_id where c.status in ('open','assigned','in_progress') and c.due_at<=now() loop
    v_target:=case when now()>=r.due_at+interval '24 hours' then 2 else 1 end;
    if coalesce(r.escalation_level,0)<v_target then
      update public.business_restroom_remediation_cases set escalation_level=v_target,escalated_at=now(),updated_at=now() where id=r.id;
      insert into public.notifications(user_id,type,title,body,data)
      select distinct x.user_id,'business_remediation_sla_escalated',case when v_target>=2 then 'Critical restroom remediation overdue' else 'Restroom remediation SLA overdue' end,coalesce(r.location_name,'A restroom')||' · '||coalesce(r.amenity_name,'Amenity')||' is past its remediation deadline.',jsonb_build_object('business_id',r.business_id,'case_id',r.id,'location_id',r.location_id,'amenity_id',r.amenity_id,'priority',r.priority,'due_at',r.due_at,'escalation_level',v_target)
      from (select bm.user_id from public.business_members bm where bm.business_id=r.business_id and lower(bm.role::text) in ('owner','admin','manager') union select r.assigned_to where r.assigned_to is not null) x;
      v_escalated:=v_escalated+1;
    end if;
  end loop;
  return jsonb_build_object('escalated',v_escalated,'processed_at',now());
end $$;
select cron.unschedule(jobid) from cron.job where jobname='kleenest-restroom-remediation-sla';
select cron.schedule('kleenest-restroom-remediation-sla','*/15 * * * *','select public.process_restroom_remediation_slas();');

drop function if exists public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text);
create or replace function public.business_manage_restroom_remediation(p_business_id uuid,p_case_id uuid,p_action text,p_assigned_to uuid default null,p_notes text default null,p_proof_media_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.business_restroom_remediation_cases; v_obs uuid; v_reporter uuid; v_proof_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select * into c from public.business_restroom_remediation_cases where id=p_case_id and business_id=p_business_id for update;
  if c.id is null then raise exception 'Remediation case not found'; end if;
  if p_action='assign' then if p_assigned_to is null or not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=p_assigned_to) then raise exception 'Assignee must be a business member'; end if; update public.business_restroom_remediation_cases set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),updated_at=now() where id=c.id; insert into public.notifications(user_id,type,title,body,data) values(p_assigned_to,'business_remediation_assignment','Restroom issue assigned',coalesce((select l.name from public.locations l where l.id=c.location_id),'A restroom')||' needs attention.',jsonb_build_object('business_id',p_business_id,'case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id,'due_at',c.due_at,'priority',c.priority));
  elsif p_action='claim' then update public.business_restroom_remediation_cases set status='assigned',assigned_to=auth.uid(),assigned_at=now(),updated_at=now() where id=c.id;
  elsif p_action='start' then update public.business_restroom_remediation_cases set status='in_progress',assigned_to=coalesce(assigned_to,auth.uid()),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),updated_at=now() where id=c.id;
  elsif p_action='release' then update public.business_restroom_remediation_cases set status='open',assigned_to=null,assigned_at=null,started_at=null,updated_at=now() where id=c.id;
  elsif p_action='dismiss' then update public.business_restroom_remediation_cases set status='dismissed',dismissed_at=now(),resolution_notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=c.id;
  elsif p_action='reopen' then update public.business_restroom_remediation_cases set status='open',resolved_at=null,dismissed_at=null,resolution_notes=null,resolution_observation_id=null,resolution_media_id=null,escalation_level=0,escalated_at=null,due_at=now()+make_interval(hours=>public.restroom_remediation_sla_hours(c.priority)),updated_at=now() where id=c.id;
  elsif p_action='resolve' then
    if nullif(trim(coalesce(p_notes,'')),'') is null then raise exception 'Resolution notes are required'; end if;
    if c.priority>=90 and p_proof_media_id is null then raise exception 'Photo proof is required for critical remediation'; end if;
    if p_proof_media_id is not null then select p.storage_path into v_proof_path from public.location_photos p join public.locations l on l.id=p.location_id where p.id=p_proof_media_id and p.location_id=c.location_id and l.business_id=p_business_id; if v_proof_path is null then raise exception 'Resolution proof must belong to this business location'; end if; end if;
    insert into public.location_amenity_observations(location_id,user_id,amenity_id,status,confidence,verification_method,photo_id,notes,observed_at,metadata) values(c.location_id,auth.uid(),c.amenity_id,'present',0.75,'business_remediation',p_proof_media_id,trim(p_notes),now(),jsonb_build_object('source','business_remediation','business_id',p_business_id,'remediation_case_id',c.id,'sentiment','resolved_by_business','proof_media_id',p_proof_media_id,'proof_storage_path',v_proof_path)) returning id into v_obs;
    update public.business_restroom_remediation_cases set status='resolved',resolved_at=now(),assigned_to=coalesce(assigned_to,auth.uid()),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),resolution_notes=trim(p_notes),resolution_observation_id=v_obs,resolution_media_id=p_proof_media_id,resolution_snapshot=coalesce(resolution_snapshot,'{}'::jsonb)||jsonb_build_object('resolved_by',auth.uid(),'resolved_at',now(),'resolution_observation_id',v_obs,'proof_media_id',p_proof_media_id,'proof_storage_path',v_proof_path,'sla_met',now()<=c.due_at),updated_at=now() where id=c.id;
    select user_id into v_reporter from public.location_amenity_observations where id=c.source_observation_id;
    if v_reporter is not null and v_reporter<>auth.uid() then insert into public.notifications(user_id,type,title,body,data) values(v_reporter,'business_remediation_resolved','A restroom issue you reported was addressed',coalesce((select l.name from public.locations l where l.id=c.location_id),'A restroom')||' reported a business remediation update.',jsonb_build_object('business_id',p_business_id,'case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id,'resolution_observation_id',v_obs,'proof_media_id',p_proof_media_id,'proof_available',p_proof_media_id is not null)); end if;
  else raise exception 'Unsupported remediation action'; end if;
  return (select to_jsonb(x) from (select rc.*,l.name location_name,a.name amenity_name,p.display_name assigned_name,lp.storage_path proof_storage_path,case when rc.status in ('resolved','dismissed') then rc.status when now()>rc.due_at+interval '24 hours' then 'critical' when now()>rc.due_at then 'overdue' when rc.due_at<=now()+interval '4 hours' then 'due_soon' else 'on_track' end sla_state from public.business_restroom_remediation_cases rc join public.locations l on l.id=rc.location_id join public.amenities a on a.id=rc.amenity_id left join public.profiles p on p.id=rc.assigned_to left join public.location_photos lp on lp.id=rc.resolution_media_id where rc.id=c.id) x);
end $$;

revoke all on function public.restroom_remediation_sla_hours(integer) from public,anon,authenticated;
revoke all on function public.apply_restroom_remediation_sla() from public,anon,authenticated;
revoke all on function public.sync_restroom_remediation_from_observation() from public,anon,authenticated;
revoke all on function public.process_restroom_remediation_slas() from public,anon,authenticated;
revoke all on function public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.restroom_remediation_sla_hours(integer) to service_role;
grant execute on function public.apply_restroom_remediation_sla() to service_role;
grant execute on function public.sync_restroom_remediation_from_observation() to service_role;
grant execute on function public.process_restroom_remediation_slas() to service_role;
grant execute on function public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text,uuid) to authenticated,service_role;
