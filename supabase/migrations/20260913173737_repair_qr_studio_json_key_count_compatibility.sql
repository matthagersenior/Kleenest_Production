
do $$
declare
  v_def text;
  v_old text := 'if jsonb_object_length(v_patch)=1 and v_patch ? ''active'' then';
  v_new text := 'if (select count(*) from jsonb_object_keys(v_patch))=1 and v_patch ? ''active'' then';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='qr_studio_upsert_asset'
    and pg_get_function_identity_arguments(p.oid)=
      'p_business_id uuid, p_qr_id uuid, p_location_id uuid, p_patch jsonb, p_change_summary text';

  if v_def is null or position(v_old in v_def)=0 then
    raise exception 'QR Studio JSON key-count compatibility anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end $$;
