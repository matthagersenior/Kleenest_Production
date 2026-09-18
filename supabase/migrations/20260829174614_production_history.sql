revoke execute on function public.submit_location_photo_record(uuid, text, text, text, text, bigint, integer, integer) from anon, authenticated;
grant execute on function public.submit_location_photo_record(uuid, text, text, text, text, bigint, integer, integer, uuid) to authenticated;
revoke execute on function public.submit_location_photo_record(uuid, text, text, text, text, bigint, integer, integer, uuid) from anon;
