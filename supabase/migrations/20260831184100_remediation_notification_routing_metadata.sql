create or replace function public.notify_business_restroom_remediation_opened()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(user_id,type,title,body,data)
  select bm.user_id,'business_remediation_opened','Restroom issue needs attention',
         coalesce(l.name,'A restroom')||' · '||coalesce(a.name,'Amenity')||' needs operational attention.',
         jsonb_build_object('business_id',new.business_id,'case_id',new.id,'location_id',new.location_id,'amenity_id',new.amenity_id,'priority',new.priority,
           'destination','/location/'||new.location_id::text,
           'web_destination','/workspace/business?business='||new.business_id::text||'&focus=remediation&case='||new.id::text)
  from public.business_members bm
  join public.locations l on l.id=new.location_id
  join public.amenities a on a.id=new.amenity_id
  where bm.business_id=new.business_id and lower(bm.role::text) in ('owner','admin','manager');
  return new;
end $$;

create or replace function public.process_restroom_remediation_slas()
returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; v_target integer; v_escalated integer:=0;
begin
  for r in
    select c.*,l.name location_name,a.name amenity_name
    from public.business_restroom_remediation_cases c
    join public.locations l on l.id=c.location_id
    join public.amenities a on a.id=c.amenity_id
    where c.status in ('open','assigned','in_progress') and c.due_at<=now()
  loop
    v_target:=case when now()>=r.due_at+interval '24 hours' then 2 else 1 end;
    if coalesce(r.escalation_level,0)<v_target then
      update public.business_restroom_remediation_cases set escalation_level=v_target,escalated_at=now(),updated_at=now() where id=r.id;
      insert into public.notifications(user_id,type,title,body,data)
      select distinct x.user_id,'business_remediation_sla_escalated',
        case when v_target>=2 then 'Critical restroom remediation overdue' else 'Restroom remediation SLA overdue' end,
        coalesce(r.location_name,'A restroom')||' · '||coalesce(r.amenity_name,'Amenity')||' is past its remediation deadline.',
        jsonb_build_object('business_id',r.business_id,'case_id',r.id,'location_id',r.location_id,'amenity_id',r.amenity_id,'priority',r.priority,'due_at',r.due_at,'escalation_level',v_target,
          'destination','/location/'||r.location_id::text,
          'web_destination','/workspace/business?business='||r.business_id::text||'&focus=remediation&case='||r.id::text)
      from (
        select bm.user_id from public.business_members bm where bm.business_id=r.business_id and lower(bm.role::text) in ('owner','admin','manager')
        union select r.assigned_to where r.assigned_to is not null
      ) x;
      v_escalated:=v_escalated+1;
    end if;
  end loop;
  return jsonb_build_object('escalated',v_escalated,'processed_at',now());
end;
$$;

create or replace function public.business_manage_restroom_remediation(p_business_id uuid,p_case_id uuid,p_action text,p_assigned_to uuid default null,p_notes text default null,p_proof_media_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.business_restroom_remediation_cases; v_obs uuid; v_reporter uuid; v_proof_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  select * into c from public.business_restroom_remediation_cases where id=p_case_id and business_id=p_business_id for update;
  if c.id is null then raise exception 'Remediation case not found'; end if;

  if p_action='assign' then
    if p_assigned_to is null or not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=p_assigned_to) then raise exception 'Assignee must be a business member'; end if;
    update public.business_restroom_remediation_cases set status='assigned',assigned_to=p_assigned_to,assigned_at=now(),updated_at=now() where id=c.id;
    insert into public.notifications(user_id,type,title,body,data)
    values(p_assigned_to,'business_remediation_assignment','Restroom issue assigned',coalesce((select l.name from public.locations l where l.id=c.location_id),'A restroom')||' needs attention.',
      jsonb_build_object('business_id',p_business_id,'case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id,'due_at',c.due_at,'priority',c.priority,
        'destination','/location/'||c.location_id::text,
        'web_destination','/workspace/business?business='||p_business_id::text||'&focus=remediation&case='||c.id::text));
  elsif p_action='claim' then
    update public.business_restroom_remediation_cases set status='assigned',assigned_to=auth.uid(),assigned_at=now(),updated_at=now() where id=c.id;
  elsif p_action='start' then
    update public.business_restroom_remediation_cases set status='in_progress',assigned_to=coalesce(assigned_to,auth.uid()),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),updated_at=now() where id=c.id;
  elsif p_action='release' then
    update public.business_restroom_remediation_cases set status='open',assigned_to=null,assigned_at=null,started_at=null,updated_at=now() where id=c.id;
  elsif p_action='dismiss' then
    update public.business_restroom_remediation_cases set status='dismissed',dismissed_at=now(),resolution_notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now() where id=c.id;
  elsif p_action='reopen' then
    update public.business_restroom_remediation_cases set status='open',resolved_at=null,dismissed_at=null,resolution_notes=null,resolution_observation_id=null,resolution_media_id=null,escalation_level=0,escalated_at=null,due_at=now()+make_interval(hours=>public.restroom_remediation_sla_hours(c.priority)),updated_at=now() where id=c.id;
  elsif p_action='resolve' then
    if nullif(trim(coalesce(p_notes,'')),'') is null then raise exception 'Resolution notes are required'; end if;
    if c.priority>=90 and p_proof_media_id is null then raise exception 'Photo proof is required for critical remediation'; end if;
    if p_proof_media_id is not null then
      select p.storage_path into v_proof_path from public.location_photos p join public.locations l on l.id=p.location_id where p.id=p_proof_media_id and p.location_id=c.location_id and l.business_id=p_business_id;
      if v_proof_path is null then raise exception 'Resolution proof must belong to this business location'; end if;
    end if;
    insert into public.location_amenity_observations(location_id,user_id,amenity_id,status,confidence,verification_method,photo_id,notes,observed_at,metadata)
    values(c.location_id,auth.uid(),c.amenity_id,'present',0.75,'business_remediation',p_proof_media_id,trim(p_notes),now(),jsonb_build_object('source','business_remediation','business_id',p_business_id,'remediation_case_id',c.id,'sentiment','resolved_by_business','proof_media_id',p_proof_media_id,'proof_storage_path',v_proof_path)) returning id into v_obs;
    update public.business_restroom_remediation_cases
    set status='resolved',resolved_at=now(),assigned_to=coalesce(assigned_to,auth.uid()),assigned_at=coalesce(assigned_at,now()),started_at=coalesce(started_at,now()),resolution_notes=trim(p_notes),resolution_observation_id=v_obs,resolution_media_id=p_proof_media_id,
        resolution_snapshot=coalesce(resolution_snapshot,'{}'::jsonb)||jsonb_build_object('resolved_by',auth.uid(),'resolved_at',now(),'resolution_observation_id',v_obs,'proof_media_id',p_proof_media_id,'proof_storage_path',v_proof_path,'sla_met',now()<=c.due_at),updated_at=now()
    where id=c.id;
    select user_id into v_reporter from public.location_amenity_observations where id=c.source_observation_id;
    if v_reporter is not null and v_reporter<>auth.uid() then
      insert into public.notifications(user_id,type,title,body,data)
      values(v_reporter,'business_remediation_resolved','A restroom issue you reported was addressed',coalesce((select l.name from public.locations l where l.id=c.location_id),'A restroom')||' reported a business remediation update.',
        jsonb_build_object('business_id',p_business_id,'case_id',c.id,'location_id',c.location_id,'amenity_id',c.amenity_id,'resolution_observation_id',v_obs,'proof_media_id',p_proof_media_id,'proof_available',p_proof_media_id is not null,
          'destination','/location/'||c.location_id::text,'web_destination','/location/'||c.location_id::text));
    end if;
  else raise exception 'Unsupported remediation action'; end if;

  return (select to_jsonb(x) from (
    select rc.*,l.name location_name,a.name amenity_name,p.display_name assigned_name,lp.storage_path proof_storage_path,
      case when rc.status in ('resolved','dismissed') then rc.status when now()>rc.due_at+interval '24 hours' then 'critical' when now()>rc.due_at then 'overdue' when rc.due_at<=now()+interval '4 hours' then 'due_soon' else 'on_track' end sla_state
    from public.business_restroom_remediation_cases rc join public.locations l on l.id=rc.location_id join public.amenities a on a.id=rc.amenity_id left join public.profiles p on p.id=rc.assigned_to left join public.location_photos lp on lp.id=rc.resolution_media_id where rc.id=c.id
  ) x);
end;
$$;

revoke all on function public.notify_business_restroom_remediation_opened() from public,anon,authenticated;
revoke all on function public.process_restroom_remediation_slas() from public,anon,authenticated;
revoke all on function public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text,uuid) from public,anon;
grant execute on function public.notify_business_restroom_remediation_opened() to service_role;
grant execute on function public.process_restroom_remediation_slas() to service_role;
grant execute on function public.business_manage_restroom_remediation(uuid,uuid,text,uuid,text,uuid) to authenticated,service_role;
