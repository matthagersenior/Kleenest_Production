-- Additive, owner-only distinct-ID figure for diagnostic install CTA events.
-- Historical events were recorded on mount; do not retroactively call them verified views.
CREATE OR REPLACE FUNCTION public.owner_guest_monetization_snapshot(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_days integer:=greatest(1,least(coalesce(p_days,7),30));
  v_since timestamptz;
  v_guest jsonb;
  v_events jsonb;
  v_native jsonb;
  v_sponsored jsonb;
  v_purchases jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  v_since:=now()-make_interval(days=>v_days);
  select jsonb_build_object(
    'sessions',count(distinct e.session_id),
    'visitor_keys',count(distinct e.visitor_key),
    'install_intents',count(*) filter(where e.event_name='install_intent'),
    'install_successes',count(*) filter(where e.event_name='install_success')
  ) into v_guest from private.guest_journey_events e where e.occurred_at>=v_since;
  select jsonb_build_object(
    'network_request_attempts',count(*) filter(where e.event_type='network_request_attempt'),
    'network_impressions',count(*) filter(where e.event_type='network_impression'),
    'web_missing_config',count(*) filter(where e.event_type='network_slot_missing_config'),
    'network_no_fills',count(*) filter(where e.event_type='network_no_fill'),
    'sponsored_impressions',count(*) filter(where e.event_type='sponsored_impression'),
    'sponsored_clicks',count(*) filter(where e.event_type='sponsored_click'),
    'install_upsell_views',count(*) filter(where e.event_type='install_upsell_view'),
    'install_upsell_viewer_ids',count(distinct e.visitor_key) filter(where e.event_type='install_upsell_view'),
    'install_upsell_clicks',count(*) filter(where e.event_type='install_upsell_click'),
    'upgrade_intents',count(*) filter(where e.event_type='upgrade_intent'),
    'sessions_with_signals',count(distinct e.session_id)
  ) into v_events from private.guest_monetization_events e where e.created_at>=v_since;
  select jsonb_build_object(
    'requests',count(*) filter(where e.event_type='request'),
    'fills',count(*) filter(where e.event_type='fill'),
    'impressions',count(*) filter(where e.event_type='impression'),
    'paid_callbacks',count(*) filter(where e.event_type='paid'),
    'last_event_at',max(e.created_at)
  ) into v_native from public.admob_telemetry_events e where e.created_at>=v_since;
  select jsonb_build_object(
    'authenticated_impressions',count(*) filter(where e.event_type='impression'),
    'authenticated_clicks',count(*) filter(where e.event_type='click')
  ) into v_sponsored from public.sponsored_events e where e.created_at>=v_since;
  select jsonb_build_object(
    'verified_store_purchases',count(*)
  ) into v_purchases from public.mobile_store_purchases p where p.verified_at>=v_since;
  return jsonb_build_object(
    'days',v_days,'updated_at',now(),'guest',v_guest,'guest_ad_diagnostics',v_events,
    'native_admob',v_native,'authenticated_sponsorship',v_sponsored,'purchases',v_purchases,
    'measurement_note','Guest ad signals are client-reported diagnostics, not verified ad deliveries or billable revenue. Native AdMob telemetry and store purchases are platform totals, not attributable to guests. Revenue must be reconciled from the ad network or payment provider.'
  );
end;
$function$
;
revoke all on function public.owner_guest_monetization_snapshot(integer) from public, anon;
grant execute on function public.owner_guest_monetization_snapshot(integer) to authenticated, service_role;
