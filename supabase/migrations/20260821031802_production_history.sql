revoke execute on function public.record_location_verification(uuid,boolean,double precision,double precision,text) from anon;
revoke execute on function public.record_location_filter_event(jsonb,integer,jsonb,double precision,double precision,integer,text) from anon;
revoke execute on function public.record_qr_attribution(text,text,text,jsonb) from anon;
revoke execute on function public.refresh_contributor_milestones(uuid) from anon;
revoke execute on function public.refresh_contributor_reputation(uuid) from anon;
revoke execute on function public.refresh_location_verification_summary(uuid) from anon;
revoke execute on function public.select_location_verification_targets(integer) from anon;
revoke execute on function public.resolve_custom_qr_action(text) from anon;
revoke execute on function public.sync_location_to_place() from anon;
revoke execute on function public.trg_refresh_location_verification_summary() from anon;

-- Public discovery remains intentionally anonymous.
grant execute on function public.nearby_restrooms(double precision,double precision,integer,integer) to anon;
grant execute on function public.get_amenities_catalog() to anon;
grant execute on function public.home_active_contests(integer) to anon;
grant execute on function public.home_active_events(integer) to anon;
grant execute on function public.search_public_data_catalog(text,integer) to anon;
