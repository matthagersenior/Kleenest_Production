CREATE OR REPLACE FUNCTION internal.location_consolidation_unconstrained_refs(
 p_source_id uuid,p_survivor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $extra$
DECLARE d record; n bigint; m bigint; entries jsonb:='[]'::jsonb; total bigint:=0;
BEGIN
 FOR d IN SELECT col.table_schema AS schema_name,col.table_name,col.column_name
 FROM information_schema.columns col
 WHERE col.table_schema IN ('public','internal')
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
$extra$;
REVOKE ALL ON FUNCTION internal.location_consolidation_unconstrained_refs(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION internal.location_consolidation_preflight(p_case_id bigint, p_survivor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_case public.location_duplicate_cases%ROWTYPE;
 v_survivor public.locations%ROWTYPE;
 v_source public.locations%ROWTYPE;
 v_dep record;
 v_from bigint; v_to bigint;
 v_deps jsonb := '[]'::jsonb;
 v_blockers jsonb := '[]'::jsonb;
 v_source_count bigint := 0;
 v_existing bigint;
 v_payload jsonb;
 v_unc jsonb;
 v_hash text;
BEGIN
 SELECT * INTO v_case FROM public.location_duplicate_cases WHERE id=p_case_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review case not found'; END IF;
 IF p_survivor_id IS NULL OR p_survivor_id NOT IN (v_case.first_location_id,v_case.second_location_id) THEN
  RAISE EXCEPTION 'Survivor must be one of the two reviewed locations';
 END IF;
 SELECT * INTO v_survivor FROM public.locations WHERE id=p_survivor_id;
 SELECT * INTO v_source FROM public.locations
  WHERE id=CASE WHEN v_case.first_location_id=p_survivor_id THEN v_case.second_location_id ELSE v_case.first_location_id END;
 IF v_case.reviewed_at IS NULL THEN v_blockers:=v_blockers||jsonb_build_array('A manual Owner confirmation with timestamp is required'); END IF;
 IF v_case.status<>'confirmed' THEN v_blockers:=v_blockers||jsonb_build_array('Case is not confirmed by an Owner reviewer'); END IF;
 IF v_source.is_active IS DISTINCT FROM true OR v_survivor.is_active IS DISTINCT FROM true THEN
  v_blockers:=v_blockers||jsonb_build_array('Both records must be active before consolidation');
 END IF;
 IF EXISTS(SELECT 1 FROM internal.location_identity_redirects WHERE duplicate_location_id=v_source.id OR duplicate_location_id=v_survivor.id) THEN
  v_blockers:=v_blockers||jsonb_build_array('An existing canonical redirect already governs one of these IDs');
 END IF;
 IF EXISTS(SELECT 1 FROM internal.location_consolidation_ledger WHERE case_id=p_case_id AND undone_at IS NULL) THEN
  v_blockers:=v_blockers||jsonb_build_array('A consolidation ledger already exists for this case');
 END IF;
 IF v_source.business_id IS NOT NULL OR v_source.claimed_business_id IS NOT NULL OR
    v_survivor.business_id IS NOT NULL OR v_survivor.claimed_business_id IS NOT NULL THEN
  v_blockers:=v_blockers||jsonb_build_array('Business ownership or claims require separate, verified transfer');
 END IF;
 IF (v_source.latitude IS NOT NULL AND v_survivor.latitude IS NOT NULL
     AND (abs(v_source.latitude-v_survivor.latitude)>0.001 OR abs(v_source.longitude-v_survivor.longitude)>0.001)) THEN
  v_blockers:=v_blockers||jsonb_build_array('Map coordinates differ too much; resolve geocoding first');
 END IF;
 IF (v_source.state IS DISTINCT FROM v_survivor.state AND
     v_source.state IS NOT NULL AND v_survivor.state IS NOT NULL) THEN
  v_blockers:=v_blockers||jsonb_build_array('Conflicting state; verify identity and address');
 END IF;
 -- Duplicate cases and co-location links are review evidence; never retarget them.
 FOR v_dep IN
   SELECT n.nspname AS schema_name,rel.relname AS table_name,att.attname AS column_name
   FROM pg_catalog.pg_constraint con
   JOIN pg_catalog.pg_class rel ON rel.oid=con.conrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=rel.relnamespace
   JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
   JOIN pg_catalog.pg_attribute att ON att.attrelid=con.conrelid AND att.attnum=k.attnum
   WHERE con.contype='f' AND con.confrelid='public.locations'::regclass
     AND con.conrelid NOT IN ('public.location_duplicate_cases'::regclass,
                             'public.location_colocation_links'::regclass,
                             'internal.location_identity_redirects'::regclass,
                             'internal.location_consolidation_ledger'::regclass)
   ORDER BY n.nspname,rel.relname,att.attname
 LOOP
  EXECUTE format('SELECT count(*) FILTER(WHERE %1$I=$1),count(*) FILTER(WHERE %1$I=$2) FROM %2$I.%3$I',
       v_dep.column_name,v_dep.schema_name,v_dep.table_name)
    INTO v_from,v_to USING v_source.id,v_survivor.id;
  IF v_from>0 OR v_to>0 THEN
   v_deps:=v_deps||jsonb_build_array(jsonb_build_object(
       'table',v_dep.schema_name||'.'||v_dep.table_name,'column',v_dep.column_name,
       'source_rows',v_from,'survivor_rows',v_to,
       'handling',CASE WHEN v_from>0 THEN 'Requires identity-safe transfer; blocked'
                       ELSE 'Retained on survivor' END));
  END IF;
  v_source_count:=v_source_count+v_from;
 END LOOP;
 SELECT internal.location_consolidation_unconstrained_refs(v_source.id,v_survivor.id) INTO v_unc;
 v_source_count:=v_source_count+(v_unc->>'source_total')::bigint;
 v_deps:=v_deps||(v_unc->'entries');
 IF v_source_count>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(format('%s source-linked records across dependent tables require reconciliation before consolidation',v_source_count));
 END IF;
 SELECT count(*) INTO v_existing FROM public.location_duplicate_cases c
 WHERE c.id<>p_case_id
   AND c.status IN ('pending','needs_geocoding')
   AND (c.first_location_id=v_source.id OR c.second_location_id=v_source.id);
 IF v_existing>0 THEN
  v_blockers:=v_blockers||jsonb_build_array(format('%s other unresolved review cases also reference the retiring ID',v_existing));
 END IF;
 v_payload:=jsonb_build_object(
    'case_id',p_case_id,'case_status',v_case.status,'case_reviewed_at',v_case.reviewed_at,
    'survivor',jsonb_build_object('id',v_survivor.id,'name',v_survivor.name,'address',v_survivor.address,
       'city',v_survivor.city,'state',v_survivor.state,'source_dataset',v_survivor.source_dataset,
       'source_external_id',v_survivor.source_external_id,'is_active',v_survivor.is_active,
       'business_id',v_survivor.business_id,'claimed_business_id',v_survivor.claimed_business_id),
    'retiring',jsonb_build_object('id',v_source.id,'name',v_source.name,'address',v_source.address,
       'city',v_source.city,'state',v_source.state,'source_dataset',v_source.source_dataset,
       'source_external_id',v_source.source_external_id,'is_active',v_source.is_active,
       'business_id',v_source.business_id,'claimed_business_id',v_source.claimed_business_id),
    'impact',v_deps,'source_linked_total',v_source_count,'blockers',v_blockers,
    'unresolved_other_cases',v_existing,
    'preservation','Original UUID, source dataset, source external ID and complete record remain stored; surviving fields are not overwritten. Ingestion history and evidence remain auditable.',
    'mirror_status','After consolidation, Kleenest_Data removal is queued and must be acknowledged'
 );
 v_hash:=encode(extensions.digest(convert_to(
  v_payload::text||'|'||coalesce(v_source.updated_at::text,'')||'|'||coalesce(v_survivor.updated_at::text,''),
  'UTF8'),'sha256'),'hex');
 RETURN v_payload||jsonb_build_object('allowed',jsonb_array_length(v_blockers)=0,'fingerprint',v_hash);
END;
$function$
;