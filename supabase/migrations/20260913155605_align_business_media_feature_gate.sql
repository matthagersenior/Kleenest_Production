
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='business_create_media'
    and pg_get_function_identity_arguments(p.oid)='p_business_id uuid, p_location_id uuid, p_storage_path text, p_caption text, p_media_type text, p_mime_type text, p_size_bytes bigint, p_width integer, p_height integer, p_sort_order integer'
  limit 1;

  v_def:=replace(
    v_def,
    'select not exists(select 1 from public.location_photos',
    'select public.business_advanced_allowed(p_business_id) and not exists(select 1 from public.location_photos'
  );
  execute v_def;
end $$;
