create or replace function public.complete_active_route_stop_after_evidence(p_location_id uuid,p_check_in_id uuid,p_evidence_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','auth','extensions','pg_temp'
as $function$
declare r record; c public.check_ins; v_completed timestamptz := now(); v_points integer; v_evidence_valid boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_location_id is null or p_check_in_id is null or p_evidence_id is null then raise exception 'location, check-in, and evidence are required'; end if;
  select * into c from public.check_ins where id=p_check_in_id and user_id=auth.uid();
  if not found or c.location_id<>p_location_id then raise exception 'check-in does not belong to this user and location'; end if;
  if coalesce(c.verification_method,'') not in ('gps','qr','place') then raise exception 'check-in is not verified'; end if;
  v_evidence_valid := exists(select 1 from public.data_feature_events e where e.actor_user_id=auth.uid() and e.location_id=p_location_id and e.source_id=p_evidence_id and e.occurred_at>=coalesce(c.checked_in_at,now()-interval '1 hour') and e.occurred_at<=now()+interval '5 minutes' and e.event_validity='valid')
    or exists(select 1 from public.restroom_observations o where o.id=p_evidence_id and o.user_id=auth.uid() and o.location_id=p_location_id and o.check_in_id=p_check_in_id)
    or exists(select 1 from public.location_amenity_observations o where o.id=p_evidence_id and o.user_id=auth.uid() and o.location_id=p_location_id and o.check_in_id=p_check_in_id)
    or exists(select 1 from public.location_quality_observations o where o.id=p_evidence_id and o.user_id=auth.uid() and o.location_id=p_location_id and o.check_in_id=p_check_in_id);
  if not v_evidence_valid then raise exception 'evidence is not an authoritative contribution for this verified visit'; end if;
  select rp.id as route_id, rs.id as route_stop_id, rs.points_value into r
  from public.route_plans rp join public.route_stops rs on rs.route_id=rp.id
  where rp.user_id=auth.uid() and rp.status='active' and rs.location_id=p_location_id and rs.completed_at is null and rs.arrived_at is not null
  order by rp.updated_at desc nulls last, rp.created_at desc limit 1;
  if not found then return jsonb_build_object('matched',false,'location_id',p_location_id,'evidence_id',p_evidence_id); end if;
  v_points:=greatest(0,coalesce(r.points_value,15));
  update public.route_stops set completed_at=v_completed,evidence_id=p_evidence_id where id=r.route_stop_id;
  insert into public.route_events(route_id,user_id,event_type,route_stop_id,points_awarded,metadata)
  values(r.route_id,auth.uid(),'stop_completed',r.route_stop_id,v_points,jsonb_build_object('check_in_id',p_check_in_id,'evidence_id',p_evidence_id,'location_id',p_location_id,'server_authoritative',true));
  return jsonb_build_object('matched',true,'route_id',r.route_id,'route_stop_id',r.route_stop_id,'location_id',p_location_id,'check_in_id',p_check_in_id,'evidence_id',p_evidence_id,'completed_at',v_completed,'points',v_points);
end $function$;

grant execute on function public.complete_active_route_stop_after_evidence(uuid,uuid,uuid) to authenticated;
revoke execute on function public.complete_active_route_stop_after_evidence(uuid,uuid,uuid) from anon;
