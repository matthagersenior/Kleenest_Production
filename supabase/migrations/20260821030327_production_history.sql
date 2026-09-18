revoke execute on function public.submit_restroom_observation(uuid, uuid, text, numeric, text) from anon;
revoke execute on function public.record_location_verification(uuid, boolean, double precision, double precision, text) from anon;
revoke execute on function public.submit_location_photo_record(uuid, text, text, text, text, bigint, integer, integer) from anon;
revoke execute on function public.redeem_qr_code(text) from anon;
revoke execute on function public.record_game_result(text, integer, integer, jsonb) from anon;

-- Keep truly public discovery/read RPCs callable without an account.
grant execute on function public.nearby_restrooms(double precision, double precision, integer, integer) to anon;
grant execute on function public.get_amenities_catalog() to anon;
grant execute on function public.home_active_contests(integer) to anon;
grant execute on function public.home_active_events(integer) to anon;
grant execute on function public.search_public_data_catalog(text, integer) to anon;
