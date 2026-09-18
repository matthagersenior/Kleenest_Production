do $$
declare v_def text;
begin
 select pg_get_functiondef(p.oid) into v_def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='ingest_external_locations'
 order by p.oid desc limit 1;
 if v_def is null then raise exception 'ingest_external_locations not found'; end if;
 v_def:=replace(v_def,
   '''source_category'',nullif(item->>''place_type'',''''),',
   '''source_category'',coalesce(nullif(v_input_meta->>''source_category'',''''),nullif(item->>''place_type'','''')),'
 );
 execute v_def;
end $$;
