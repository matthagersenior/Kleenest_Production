create or replace function public.converge_geofence_event_to_intelligence()
returns trigger
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_event_type text := lower(coalesce(new.event_type,'event'));
  v_feature_event_id uuid;
  v_notification_id uuid;
begin
  if new.location_id is null then return new; end if;

  if auth.uid() is not null then
    v_feature_event_id := public.record_data_feature_event(
      p_event_type := 'geofence_'||v_event_type,
      p_feature_code := 'business.geofence.engagement',
      p_subject_type := 'location',
      p_subject_id := new.location_id,
      p_location_id := new.location_id,
      p_business_id := new.business_id,
      p_fleet_vehicle_id := null,
      p_source_table := 'geofence_events',
      p_source_id := new.id,
      p_value_numeric := new.dwell_seconds,
      p_value_text := v_event_type,
      p_metadata := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('geofence_id',new.geofence_id,'qr_code_id',new.qr_code_id,'check_in_id',new.check_in_id,'server_event_id',new.id)
    );

    if v_event_type in ('enter','entered','dwell') then
      begin
        v_notification_id := public.publish_intelligence_location_event(
          p_location_id := new.location_id,
          p_event_type := 'geofence_'||v_event_type,
          p_title := 'Nearby Kleenest activity',
          p_body := case when v_event_type='dwell' then 'A location engagement signal is active nearby.' else 'A location engagement signal was recorded nearby.' end,
          p_payload := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('business_id',new.business_id,'geofence_id',new.geofence_id,'geofence_event_id',new.id,'feature_event_id',v_feature_event_id,'event_type',v_event_type),
          p_radius_m := 500,
          p_dedupe_key := 'geofence:'||new.id::text
        );
      exception when others then
        null;
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists geofence_event_intelligence_convergence on public.geofence_events;
create trigger geofence_event_intelligence_convergence
after insert on public.geofence_events
for each row execute function public.converge_geofence_event_to_intelligence();

revoke all on function public.converge_geofence_event_to_intelligence() from public,anon,authenticated;
