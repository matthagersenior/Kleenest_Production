CREATE OR REPLACE FUNCTION kleenest_ai.refresh_deep_intelligence()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_date text:=to_char(now() at time zone 'utc','YYYYMMDD'); v_count integer;
begin
 if current_user not in ('postgres','service_role') then raise exception 'forbidden'; end if;
 with metrics as (
 select count(*) total,count(*) filter(where is_active) active,count(*) filter(where bathroom_verification_count>0) verified,count(*) filter(where accessible is true) access_true,count(*) filter(where state is null and is_active) missing_state from public.locations
 ), duplicates as (
 select count(*) total,count(*) filter(where status='needs_geocoding') geocoding,count(*) filter(where status='pending') pending,count(*) filter(where status='confirmed') confirmed from public.location_duplicate_cases
 ), sessions as (
 select count(*) total from public.location_discovery_sessions where created_at>=now()-interval '30 days'
 ), ingest as (
 select count(*) total from public.location_ingestion_jobs where created_at>=now()-interval '30 days'
 ), seed as (
 select 'restroom_evidence_gap' capability,jsonb_build_object('location_count',m.total,'verification_count',m.verified,'accessible_true',m.access_true) evidence,
 jsonb_build_object('origin','deterministic_database_analysis','summary',format('%s of %s canonical locations have bathroom verification records; %s are marked accessible=true. These fields do not prove other restrooms inaccessible.',m.verified,m.total,m.access_true),'recommendation','Audit verification provenance, boolean defaults and missing restroom evidence by geography and source.','confidence',0.99,'requires_human_approval',true) result from metrics m
 union all select 'entity_relationship_intelligence',jsonb_build_object('duplicate_cases',d.total,'geocode_pending',d.geocoding,'pending',d.pending,'confirmed',d.confirmed),
 jsonb_build_object('origin','deterministic_database_analysis','summary',format('%s duplicate cases need geocoding, %s await review and %s are confirmed.',d.geocoding,d.pending,d.confirmed),'recommendation','Prioritize geocoding and source reconciliation; never auto-merge co-located businesses.','confidence',0.99,'requires_human_approval',true) from duplicates d
 union all select 'ingestion_signal_intelligence',jsonb_build_object('geographic_distribution',jsonb_build_object('active_missing_state',m.missing_state),'ingestion_observability',jsonb_build_object('jobs_30d',i.total)),
 jsonb_build_object('origin','deterministic_database_analysis','summary',format('%s active locations have no state; %s ingestion jobs appear in this job table in the last 30 days. Other pipelines may be active.',m.missing_state,i.total),'recommendation','Investigate state enrichment and reconcile all ingestion orchestrators before tuning capacity.','confidence',0.98,'requires_human_approval',true) from metrics m cross join ingest i
 union all select 'behavioral_signal_intelligence',jsonb_build_object('session_count',s.total,'measurement_window','30 days'),
 jsonb_build_object('origin','deterministic_database_analysis','summary',format('%s discovery sessions recorded in this table in 30 days; other telemetry may exist.',s.total),'recommendation','Compare all guest/search/map event sources before drawing behavioral conclusions.','confidence',0.99,'requires_human_approval',true) from sessions s
 )
 insert into kleenest_ai.ai_tasks(capability,input_fingerprint,evidence,data_class,status,priority,result)
 select capability,'osai-deep-daily-'||v_date||'-'||capability,evidence,'internal','completed',10,result from seed
 on conflict(capability,input_fingerprint) do update set evidence=excluded.evidence,result=excluded.result,updated_at=now();
 get diagnostics v_count=row_count;
 return v_count;
end $function$
;
revoke all on function kleenest_ai.refresh_deep_intelligence() from public,anon,authenticated;
grant execute on function kleenest_ai.refresh_deep_intelligence() to service_role;
select cron.schedule('kleenest-ai-deep-intelligence-daily-v1','43 4 * * *','select kleenest_ai.refresh_deep_intelligence();');
