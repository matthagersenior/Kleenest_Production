ALTER TABLE internal.location_consolidation_ledger
 DROP CONSTRAINT IF EXISTS location_consolidation_ledger_case_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS location_consolidation_one_active_case_idx
 ON internal.location_consolidation_ledger(case_id) WHERE undone_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_location_consolidation_status(p_case_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE j jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_owner_session() THEN
  RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object('ledger_id',l.id,'source_location_id',l.source_location_id,
   'survivor_location_id',l.survivor_location_id,'executed_at',l.executed_at,
   'undone_at',l.undone_at,'executed_by',l.executed_by,
   'geo_status',coalesce((SELECT o.status FROM internal.location_consolidation_outbox o
     WHERE o.ledger_id=l.id ORDER BY o.id DESC LIMIT 1),'unknown'))
 INTO j FROM internal.location_consolidation_ledger l WHERE l.case_id=p_case_id
 ORDER BY l.id DESC LIMIT 1;
 RETURN coalesce(j,'{}'::jsonb);
END;
$f$;
REVOKE ALL ON FUNCTION public.get_location_consolidation_status(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_location_consolidation_status(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.undo_location_consolidation(
 p_ledger_id bigint,p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE
 l internal.location_consolidation_ledger%ROWTYPE;
 c public.location_duplicate_cases%ROWTYPE;
 v_redirect internal.location_identity_redirects%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_owner_session() THEN
  RAISE EXCEPTION 'Owner authorization required' USING ERRCODE='42501';
 END IF;
 IF p_confirmation<>'RESTORE' THEN RAISE EXCEPTION 'Exact RESTORE confirmation is required'; END IF;
 SELECT * INTO l FROM internal.location_consolidation_ledger WHERE id=p_ledger_id FOR UPDATE;
 IF NOT FOUND OR l.undone_at IS NOT NULL THEN RAISE EXCEPTION 'No active consolidation to undo'; END IF;
 PERFORM pg_advisory_xact_lock(471810,l.case_id::integer);
 SELECT * INTO c FROM public.location_duplicate_cases WHERE id=l.case_id FOR UPDATE;
 IF c.status<>'resolved' THEN RAISE EXCEPTION 'Review case changed since consolidation'; END IF;
 PERFORM 1 FROM public.locations WHERE id IN(l.source_location_id,l.survivor_location_id) ORDER BY id FOR UPDATE;
 SELECT * INTO v_redirect FROM internal.location_identity_redirects
 WHERE duplicate_location_id=l.source_location_id FOR UPDATE;
 IF NOT FOUND OR v_redirect.canonical_location_id<>l.survivor_location_id OR
    v_redirect.reason<>'owner_verified_consolidation' OR
    v_redirect.evidence->>'ledger_id'<>l.id::text THEN
  RAISE EXCEPTION 'Canonical mapping changed; manual reconciliation required';
 END IF;
 IF (SELECT is_active FROM public.locations WHERE id=l.source_location_id) THEN
   RAISE EXCEPTION 'The source has already been reactivated';
 END IF;
 DELETE FROM internal.location_identity_redirects WHERE duplicate_location_id=l.source_location_id;
 UPDATE public.locations SET is_active=true WHERE id=l.source_location_id;
 UPDATE public.location_duplicate_cases SET status='confirmed',reviewed_at=now()
  WHERE id=l.case_id;
 UPDATE internal.location_consolidation_ledger SET undone_at=now(),undone_by=auth.uid()
  WHERE id=l.id;
 INSERT INTO internal.location_consolidation_outbox(ledger_id,action,source_location_id,survivor_location_id)
 VALUES(l.id,'restore',l.source_location_id,l.survivor_location_id);
 RETURN jsonb_build_object('ok',true,'restored_id',l.source_location_id,
   'survivor_id',l.survivor_location_id,'mirror_sync','pending');
END;
$f$;
REVOKE ALL ON FUNCTION public.undo_location_consolidation(bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.undo_location_consolidation(bigint,text) TO authenticated;