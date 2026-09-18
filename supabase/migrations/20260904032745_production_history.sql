create or replace function public.sync_restroom_remediation_from_observation()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_business_id uuid;
  v_priority integer;
  v_case record;
  v_reporter uuid;
begin
  select coalesce(l.claimed_business_id,l.business_id)
  into v_business_id
  from public.locations l
  where l.id=new.location_id;

  if v_business_id is null then return new; end if;

  if new.status='present'
     and coalesce(new.confidence,0)>=0.7
     and coalesce(new.metadata->>'sentiment','')<>'needs_attention'
     and coalesce(new.metadata->>'source','')<>'business_remediation' then
    for v_case in
      select c.id,c.source_observation_id,c.business_id,c.location_id,c.amenity_id
      from public.business_restroom_remediation_cases c
      where c.business_id=v_business_id and c.location_id=new.location_id and c.amenity_id=new.amenity_id
        and c.status in ('open','assigned','in_progress')
    loop
      update public.business_restroom_remediation_cases
      set status='resolved',resolved_at=now(),resolution_observation_id=new.id,
          resolution_notes='Automatically resolved by newer strong canonical evidence.',
          resolution_snapshot=coalesce(resolution_snapshot,'{}'::jsonb)||jsonb_build_object('auto_resolved',true,'auto_resolved_at',now(),'auto_resolution_observation_id',new.id,'auto_resolution_source',coalesce(new.metadata->>'source','canonical_observation')),
          updated_at=now()
      where id=v_case.id;

      select o.user_id into v_reporter from public.location_amenity_observations o where o.id=v_case.source_observation_id;
      if v_reporter is not null and v_reporter<>new.user_id then
        insert into public.notifications(user_id,type,title,body,data)
        values(v_reporter,'restroom_attention_cleared','Restroom evidence was updated',
          coalesce((select l.name from public.locations l where l.id=new.location_id),'A restroom')||' now has newer evidence indicating the reported amenity is present.',
          jsonb_build_object('business_id',v_business_id,'case_id',v_case.id,'location_id',new.location_id,'amenity_id',new.amenity_id,'resolution_observation_id',new.id,'resolution_source','canonical_evidence'));
      end if;

      insert into public.notifications(user_id,type,title,body,data)
      select distinct bm.user_id,'business_remediation_auto_resolved','Restroom issue cleared by new evidence',
        coalesce(l.name,'A restroom')||' · '||coalesce(a.name,'Amenity')||' now has newer strong canonical evidence.',
        jsonb_build_object('business_id',v_business_id,'case_id',v_case.id,'location_id',new.location_id,'amenity_id',new.amenity_id,'resolution_observation_id',new.id)
      from public.business_members bm
      join public.locations l on l.id=new.location_id
      join public.amenities a on a.id=new.amenity_id
      where bm.business_id=v_business_id and lower(bm.role::text) in ('owner','admin','manager');
    end loop;
    return new;
  end if;

  if not (new.status='absent' or coalesce(new.metadata->>'sentiment','')='needs_attention') then return new; end if;

  v_priority := least(100,greatest(40,
    55
    + case when new.status='absent' then 20 else 0 end
    + case when coalesce(new.metadata->>'sentiment','')='needs_attention' then 15 else 0 end
    + case when new.observed_at>=now()-interval '7 days' then 10 else 0 end
  ));

  insert into public.business_restroom_remediation_cases(
    business_id,location_id,amenity_id,source_observation_id,priority,resolution_snapshot
  ) values (
    v_business_id,new.location_id,new.amenity_id,new.id,v_priority,
    jsonb_build_object('source_status',new.status,'source_confidence',new.confidence,'source_observed_at',new.observed_at,'source_metadata',coalesce(new.metadata,'{}'::jsonb),'event_opened',true)
  )
  on conflict (business_id,location_id,amenity_id) where status in ('open','assigned','in_progress') do update
  set source_observation_id=excluded.source_observation_id,
      priority=greatest(public.business_restroom_remediation_cases.priority,excluded.priority),
      resolution_snapshot=coalesce(public.business_restroom_remediation_cases.resolution_snapshot,'{}'::jsonb)||excluded.resolution_snapshot,
      updated_at=now();

  return new;
end $$;
