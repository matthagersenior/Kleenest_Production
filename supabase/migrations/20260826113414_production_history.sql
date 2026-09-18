create or replace function public.quest_dispatch_event(
  p_user_id uuid,
  p_event_type text,
  p_location_id uuid default null,
  p_checkin_id uuid default null,
  p_qr_code_id uuid default null,
  p_geofence_event_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns setof public.quest_participation
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_participation public.quest_participation;
  v_step public.quest_steps;
  v_event text := lower(coalesce(p_event_type,''));
  v_source text := 'automatic-event-dispatch';
  v_result public.quest_participation;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Authenticated user context required';
  end if;

  for v_participation in
    select qp.*
      from public.quest_participation qp
     where qp.user_id=p_user_id
       and qp.status='started'
  loop
    select qs.* into v_step
      from public.quest_steps qs
     where qs.quest_id=v_participation.quest_id
       and qs.step_order=v_participation.current_step_order
       and (
         (p_location_id is not null and qs.location_id=p_location_id) or
         (p_qr_code_id is not null and qs.qr_code_id=p_qr_code_id) or
         (p_geofence_event_id is not null and qs.geofence_id=(select geofence_id from public.geofence_events where id=p_geofence_event_id limit 1)) or
         (lower(qs.step_type)=v_event)
       )
     order by case when p_location_id is not null and qs.location_id=p_location_id then 0
                   when p_qr_code_id is not null and qs.qr_code_id=p_qr_code_id then 0
                   when p_geofence_event_id is not null and qs.geofence_id=(select geofence_id from public.geofence_events where id=p_geofence_event_id limit 1) then 0
                   else 1 end
     limit 1;

    if found then
      select * into v_result from public.quest_record_step(
        v_participation.id,v_step.id,v_event,v_source,coalesce(p_metadata,'{}'::jsonb),
        p_location_id,p_geofence_event_id,p_qr_code_id,p_checkin_id
      );
      if v_result.id is not null then return next v_result; end if;
    end if;
  end loop;
  return;
end;
$$;

revoke execute on function public.quest_dispatch_event(uuid,text,uuid,uuid,uuid,uuid,jsonb) from public, anon;
grant execute on function public.quest_dispatch_event(uuid,text,uuid,uuid,uuid,uuid,jsonb) to authenticated;
