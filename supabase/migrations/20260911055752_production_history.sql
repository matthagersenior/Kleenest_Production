do $$
declare v_def text;
begin
 select pg_get_functiondef(p.oid) into v_def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='ingest_external_locations'
 order by p.oid desc limit 1;
 if v_def is null then raise exception 'ingest_external_locations not found'; end if;
 v_def:=replace(v_def,
   'v_place_type:=public.normalize_ingestion_place_type(item->>''place_type'');',
   'v_place_type:=public.normalize_ingestion_place_type_for_source(p_source_key,item->>''place_type'');');
 v_def:=replace(v_def,
   '''market_key'',nullif(v_input_meta->>''market_key'',''''),' || chr(10) || '     ''captured_at'',nullif(v_input_meta->>''captured_at'',''''),',
   '''market_key'',nullif(v_input_meta->>''market_key'',''''),' || chr(10) || '     ''source_category'',nullif(item->>''place_type'',''''),' || chr(10) || '     ''source_confidence'',nullif(v_input_meta->>''source_confidence'',''''),' || chr(10) || '     ''captured_at'',nullif(v_input_meta->>''captured_at'',''''),');
 execute v_def;
end $$;
