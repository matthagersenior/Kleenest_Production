create or replace function public.converge_qr_attribution_to_intelligence()
returns trigger
language plpgsql
security definer
set search_path=public,auth,extensions,pg_temp
as $$
declare
  v_feature_event_id uuid;
  v_notification_id uuid;
  v_event_type text := lower(coalesce(new.action_type,'scan'));
begin
  if auth.uid() is null or new.user_id is null then return new; end if;
  v_feature_event_id := public.record_data_feature_event(
    p_event_type := 'qr_'||v_event_type,
    p_feature_code := 'business.qr.engagement',
    p_subject_type := 'location',
    p_subject_id := new.location_id,
    p_location_id := new.location_id,
    p_business_id := new.business_id,
    p_fleet_vehicle_id := null,
    p_source_table := 'qr_attribution_events',
    p_source_id := new.id,
    p_value_numeric := null,
    p_value_text := v_event_type,
    p_metadata := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('qr_code_id',new.qr_code_id,'campaign_id',new.campaign_id,'promotion_id',new.promotion_id,'engagement_program_id',new.engagement_program_id,'server_event_id',new.id)
  );
  if v_event_type in ('scan','checkin','redemption','redeem','engagement') then
    begin
      v_notification_id := public.publish_intelligence_location_event(
        p_location_id := new.location_id,
        p_event_type := 'qr_'||v_event_type,
        p_title := 'Kleenest engagement recorded',
        p_body := 'A QR engagement signal was recorded for this location.',
        p_payload := coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('business_id',new.business_id,'qr_code_id',new.qr_code_id,'qr_event_id',new.id,'feature_event_id',v_feature_event_id,'event_type',v_event_type),
        p_radius_m := 500,
        p_dedupe_key := 'qr:'||new.id::text
      );
    exception when others then null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists qr_attribution_intelligence_convergence on public.qr_attribution_events;
create trigger qr_attribution_intelligence_convergence
after insert on public.qr_attribution_events
for each row execute function public.converge_qr_attribution_to_intelligence();
revoke all on function public.converge_qr_attribution_to_intelligence() from public,anon,authenticated;
