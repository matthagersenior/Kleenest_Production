
do $$
declare
  v_def text;
  v_old text := $old$
  if not public.business_manages_location(p_business_id,p_location_id) then
    raise exception 'Business management access required for location';
  end if;
$old$;
  v_new text := $new$
  if not public.business_manages_location(p_business_id,p_location_id) then
    raise exception 'Business management access required for location';
  end if;
  if not public.business_capability_allowed(p_business_id,'growth.photos_media') then
    raise exception 'Business Growth Photos/Media capability required';
  end if;
$new$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='business_create_media'
    and pg_get_function_identity_arguments(p.oid)=
      'p_business_id uuid, p_location_id uuid, p_storage_path text, p_caption text, p_media_type text, p_mime_type text, p_size_bytes bigint, p_width integer, p_height integer, p_sort_order integer';

  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'business_create_media authorization anchor not found';
  end if;
  execute replace(v_def,v_old,v_new);
end $$;

do $$
declare
  v_def text;
  v_old text := $old$
  if not public.business_manages_location(p_business_id,v_location_id) then
    raise exception 'Business management access required for location';
  end if;
$old$;
  v_new text := $new$
  if not public.business_manages_location(p_business_id,v_location_id) then
    raise exception 'Business management access required for location';
  end if;
  if not public.business_capability_allowed(p_business_id,'growth.photos_media') then
    raise exception 'Business Growth Photos/Media capability required';
  end if;
$new$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='business_update_media'
    and pg_get_function_identity_arguments(p.oid)=
      'p_business_id uuid, p_media_id uuid, p_storage_path text, p_caption text, p_media_type text, p_sort_order integer';

  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'business_update_media authorization anchor not found';
  end if;
  execute replace(v_def,v_old,v_new);
end $$;
