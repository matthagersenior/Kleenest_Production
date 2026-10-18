CREATE OR REPLACE FUNCTION internal.location_consolidation_unconstrained_refs(p_source_id uuid, p_survivor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d record; n bigint; m bigint; entries jsonb:='[]'::jsonb; total bigint:=0;
BEGIN
 FOR d IN SELECT col.table_schema AS schema_name,col.table_name,col.column_name
 FROM information_schema.columns col
 JOIN pg_catalog.pg_namespace nsbase ON nsbase.nspname=col.table_schema
 JOIN pg_catalog.pg_class relbase ON relbase.relnamespace=nsbase.oid AND relbase.relname=col.table_name
 WHERE col.table_schema IN ('public','internal') AND relbase.relkind IN ('r','p','m')
   AND col.udt_name='uuid'
   AND col.column_name ~ '(location_id|canonical_location_id|target_location_id|last_location_id)$'
   AND col.table_name NOT IN('location_consolidation_outbox','location_duplicate_cases',
     'location_colocation_links','location_identity_redirects','location_consolidation_ledger')
   AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class rel ON rel.oid=con.conrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN LATERAL unnest(con.conkey) AS ck(attnum) ON true
      JOIN pg_catalog.pg_attribute att ON att.attrelid=rel.oid AND att.attnum=ck.attnum
      WHERE con.contype='f' AND con.confrelid='public.locations'::regclass
        AND ns.nspname=col.table_schema AND rel.relname=col.table_name
        AND att.attname=col.column_name)
 LOOP
   EXECUTE format('SELECT count(*) FILTER(WHERE %1$I=$1),count(*) FILTER(WHERE %1$I=$2) FROM %2$I.%3$I',
      d.column_name,d.schema_name,d.table_name) INTO n,m USING p_source_id,p_survivor_id;
   total:=total+n;
   IF n>0 OR m>0 THEN
     entries:=entries||jsonb_build_array(jsonb_build_object('table',d.schema_name||'.'||d.table_name,
       'column',d.column_name,'source_rows',n,'survivor_rows',m,
       'handling',CASE WHEN n>0 THEN 'Unconstrained reference; blocked until reconciled' ELSE 'Retained on survivor' END));
   END IF;
 END LOOP;
 RETURN jsonb_build_object('entries',entries,'source_total',total);
END;
$function$
;