create or replace function public.business_restroom_remediation_operations(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_cases jsonb; v_members jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;

  insert into public.business_restroom_remediation_cases(business_id,location_id,amenity_id,source_observation_id,priority,resolution_snapshot)
  select p_business_id,ao.location_id,ao.amenity_id,ao.id,
         least(100,greatest(40,55+case when ao.status='absent' then 20 else 0 end+case when coalesce(ao.metadata->>'sentiment','')='needs_attention' then 15 else 0 end+case when ao.observed_at>=now()-interval '7 days' then 10 else 0 end)),
         jsonb_build_object('source_status',ao.status,'source_confidence',ao.confidence,'source_observed_at',ao.observed_at,'source_metadata',coalesce(ao.metadata,'{}'::jsonb),'queue_backfill',true)
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
      resolution_snapshot=coalesce(public.business_restroom_remediation_cases.resolution_snapshot,'{}'::jsonb)||excluded.resolution_snapshot,
      updated_at=now();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'status',c.status,'priority',c.priority,'business_id',c.business_id,'location_id',c.location_id,'location_name',l.name,
    'amenity_id',c.amenity_id,'amenity_name',a.name,'assigned_to',c.assigned_to,'assigned_name',p.display_name,'source_observation_id',c.source_observation_id,
    'opened_at',c.opened_at,'assigned_at',c.assigned_at,'started_at',c.started_at,'resolved_at',c.resolved_at,'dismissed_at',c.dismissed_at,
    'due_at',c.due_at,'escalated_at',c.escalated_at,'escalation_level',c.escalation_level,
    'sla_state',case when c.status in ('resolved','dismissed') then c.status when now()>c.due_at+interval '24 hours' then 'critical' when now()>c.due_at then 'overdue' when c.due_at<=now()+interval '4 hours' then 'due_soon' else 'on_track' end,
    'minutes_to_due',round(extract(epoch from (c.due_at-now()))/60.0)::integer,
    'resolution_notes',c.resolution_notes,'resolution_observation_id',c.resolution_observation_id,'resolution_media_id',c.resolution_media_id,'proof_storage_path',lp.storage_path,
    'resolution_snapshot',c.resolution_snapshot,'updated_at',c.updated_at
  ) order by case c.status when 'in_progress' then 0 when 'assigned' then 1 when 'open' then 2 when 'resolved' then 3 else 4 end,c.priority desc,c.due_at asc),'[]'::jsonb)
  into v_cases
  from public.business_restroom_remediation_cases c
  join public.locations l on l.id=c.location_id
  join public.amenities a on a.id=c.amenity_id
  left join public.profiles p on p.id=c.assigned_to
  left join public.location_photos lp on lp.id=c.resolution_media_id
  where c.business_id=p_business_id;

  select coalesce(jsonb_agg(jsonb_build_object('user_id',bm.user_id,'role',lower(bm.role::text),'display_name',coalesce(p.display_name,p.username,'Team member')) order by lower(bm.role::text),coalesce(p.display_name,p.username,'')),'[]'::jsonb)
  into v_members
  from public.business_members bm left join public.profiles p on p.id=bm.user_id
  where bm.business_id=p_business_id;

  return jsonb_build_object('business_id',p_business_id,'cases',v_cases,'members',v_members,'sla_policy','priority_derived_4_8_12_24_48_hours','generated_at',now());
end;
$$;

revoke all on function public.business_restroom_remediation_operations(uuid) from public,anon;
grant execute on function public.business_restroom_remediation_operations(uuid) to authenticated,service_role;
