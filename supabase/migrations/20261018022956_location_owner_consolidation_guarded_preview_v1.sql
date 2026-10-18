
CREATE TABLE IF NOT EXISTS internal.location_consolidation_ledger (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL UNIQUE REFERENCES public.location_duplicate_cases(id),
 source_location_id uuid NOT NULL REFERENCES public.locations(id),
 survivor_location_id uuid NOT NULL REFERENCES public.locations(id),
 source_snapshot jsonb NOT NULL,
 survivor_snapshot jsonb NOT NULL,
 preview_snapshot jsonb NOT NULL,
 executed_by uuid NOT NULL,
 executed_at timestamptz NOT NULL DEFAULT now(),
 undone_by uuid,
 undone_at timestamptz,
 CONSTRAINT consolidation_distinct_locations CHECK (source_location_id <> survivor_location_id)
);
CREATE INDEX IF NOT EXISTS location_consolidation_ledger_source_idx
 ON internal.location_consolidation_ledger(source_location_id);

CREATE TABLE IF NOT EXISTS internal.location_consolidation_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 ledger_id bigint NOT NULL REFERENCES internal.location_consolidation_ledger(id),
 action text NOT NULL CHECK (action IN ('retire','restore')),
 source_location_id uuid NOT NULL,
 survivor_location_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent')),
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS consolidation_outbox_pending_idx
 ON internal.location_consolidation_outbox(id) WHERE status='pending';
REVOKE ALL ON internal.location_consolidation_ledger,internal.location_consolidation_outbox FROM PUBLIC,anon,authenticated;

-- Enumerates real FK relationships, never trusting a hard-coded list of dependent tables.
CREATE OR REPLACE FUNCTION internal.location_consolidation_preflight(p_case_id bigint,p_survivor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
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
$f$;
REVOKE ALL ON FUNCTION internal.location_consolidation_preflight(bigint,uuid) FROM PUBLIC,anon,authenticated;

-- Public Data API wrapper, strictly Owner-only. All dependencies are counted in a privileged private function.
CREATE OR REPLACE FUNCTION public.preview_location_consolidation(p_case_id bigint,p_survivor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_owner_session() THEN
  RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';
 END IF;
 RETURN internal.location_consolidation_preflight(p_case_id,p_survivor_id);
END;
$f$;
REVOKE ALL ON FUNCTION public.preview_location_consolidation(bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_location_consolidation(bigint,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_location_consolidation(
 p_case_id bigint,p_survivor_id uuid,p_fingerprint text,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
 v_case public.location_duplicate_cases%ROWTYPE;
 v_survivor public.locations%ROWTYPE;
 v_source public.locations%ROWTYPE;
 v_preview jsonb;
 v_id bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_owner_session() THEN
  RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';
 END IF;
 IF p_confirmation<>'CONSOLIDATE' THEN RAISE EXCEPTION 'Exact confirmation is required'; END IF;
 PERFORM pg_advisory_xact_lock(471810,p_case_id::integer);
 SELECT * INTO v_case FROM public.location_duplicate_cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND OR v_case.status<>'confirmed' THEN RAISE EXCEPTION 'Case is no longer confirmed'; END IF;
 -- Row locks prevent concurrent FK inserts during the final dependency inventory.
 PERFORM 1 FROM public.locations WHERE id IN(v_case.first_location_id,v_case.second_location_id) ORDER BY id FOR UPDATE;
 SELECT * INTO v_survivor FROM public.locations WHERE id=p_survivor_id;
 SELECT * INTO v_source FROM public.locations WHERE id=CASE WHEN v_case.first_location_id=p_survivor_id THEN v_case.second_location_id ELSE v_case.first_location_id END;
 v_preview:=internal.location_consolidation_preflight(p_case_id,p_survivor_id);
 IF v_preview->>'allowed'<>'true' THEN RAISE EXCEPTION 'Consolidation blocked: %',v_preview->'blockers'; END IF;
 IF p_fingerprint IS DISTINCT FROM v_preview->>'fingerprint' THEN
  RAISE EXCEPTION 'Preview changed: refresh the impact inventory before confirming';
 END IF;
 INSERT INTO internal.location_consolidation_ledger(
 case_id,source_location_id,survivor_location_id,source_snapshot,survivor_snapshot,
 preview_snapshot,executed_by)
 VALUES(p_case_id,v_source.id,v_survivor.id,to_jsonb(v_source),to_jsonb(v_survivor),v_preview,auth.uid())
 RETURNING id INTO v_id;
 INSERT INTO internal.location_identity_redirects(
 duplicate_location_id,canonical_location_id,reason,source_external_id,evidence)
 VALUES(v_source.id,v_survivor.id,'owner_verified_consolidation',v_source.source_external_id,
        jsonb_build_object('ledger_id',v_id,'case_id',p_case_id,'by',auth.uid(),'at',now()));
 UPDATE public.locations SET is_active=false WHERE id=v_source.id;
 UPDATE public.location_duplicate_cases SET status='resolved',
   review_notes=concat_ws(' | ',nullif(review_notes,''),'Consolidated to '||v_survivor.id::text),
   reviewed_at=now()
 WHERE id=p_case_id;
 INSERT INTO internal.location_consolidation_outbox(
 ledger_id,action,source_location_id,survivor_location_id)
 VALUES(v_id,'retire',v_source.id,v_survivor.id);
 RETURN jsonb_build_object('ok',true,'ledger_id',v_id,'survivor_id',v_survivor.id,
                           'retired_id',v_source.id,'mirror_sync','pending');
END;
$f$;
REVOKE ALL ON FUNCTION public.execute_location_consolidation(bigint,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.execute_location_consolidation(bigint,uuid,text,text) TO authenticated;

-- Service role only. Old Geo catalog rows are suppressed by a separate authenticated receiver.
CREATE OR REPLACE FUNCTION public.location_consolidation_geo_outbox_batch(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'action',action,'source_location_id',source_location_id,
     'survivor_location_id',survivor_location_id)), '[]'::jsonb)
 FROM (SELECT * FROM internal.location_consolidation_outbox WHERE status='pending'
   ORDER BY id LIMIT least(greatest(coalesce(p_limit,100),1),200)) t;
$f$;
REVOKE ALL ON FUNCTION public.location_consolidation_geo_outbox_batch(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.location_consolidation_geo_outbox_batch(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.location_consolidation_geo_outbox_ack(p_ids bigint[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_rows integer;
BEGIN
 UPDATE internal.location_consolidation_outbox SET status='sent',sent_at=now()
 WHERE id=ANY(p_ids) AND status='pending';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN v_rows;
END;
$f$;
REVOKE ALL ON FUNCTION public.location_consolidation_geo_outbox_ack(bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.location_consolidation_geo_outbox_ack(bigint[]) TO service_role;
