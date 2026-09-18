begin;

-- SECURITY DEFINER functions are privileged code paths. PUBLIC EXECUTE is not an acceptable default.
revoke execute on function public.family_has_premium_access(uuid) from public, anon, authenticated;
grant execute on function public.family_has_premium_access(uuid) to authenticated;

revoke execute on function public.get_effective_consumer_tier(uuid) from public, anon, authenticated;
grant execute on function public.get_effective_consumer_tier(uuid) to authenticated;

revoke execute on function public.create_family_group(text) from public, anon, authenticated;
grant execute on function public.create_family_group(text) to authenticated;
revoke execute on function public.invite_family_member(text) from public, anon, authenticated;
grant execute on function public.invite_family_member(text) to authenticated;
revoke execute on function public.accept_family_invite() from public, anon, authenticated;
grant execute on function public.accept_family_invite() to authenticated;

revoke execute on function public.submit_location_info(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.submit_location_info(uuid,jsonb) to authenticated;
revoke execute on function public.claim_location_for_business(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_location_for_business(uuid,uuid) to authenticated;
revoke execute on function public.location_favorite_route_metrics(uuid) from public, anon, authenticated;
grant execute on function public.location_favorite_route_metrics(uuid) to authenticated;

revoke execute on function public.fleet_dashboard_summary_v2(uuid) from public, anon, authenticated;
grant execute on function public.fleet_dashboard_summary_v2(uuid) to authenticated;
revoke execute on function public.apply_user_amenity_confirmation() from public, anon, authenticated;
grant execute on function public.apply_user_amenity_confirmation() to authenticated;
revoke execute on function public.apply_external_amenity_to_location(uuid,text,text) from public, anon, authenticated;
grant execute on function public.apply_external_amenity_to_location(uuid,text,text) to authenticated;
revoke execute on function public.apply_external_amenity_observation() from public, anon, authenticated;
revoke execute on function public._kleenest_capture_feature_event() from public, anon, authenticated;

-- nearby_locations_enriched is a public read contract used by Maps discovery; retain it for anonymous and authenticated map use.
revoke execute on function public.nearby_locations_enriched(double precision,double precision,integer,integer,uuid[]) from public, anon, authenticated;
grant execute on function public.nearby_locations_enriched(double precision,double precision,integer,integer,uuid[]) to anon, authenticated;

commit;
