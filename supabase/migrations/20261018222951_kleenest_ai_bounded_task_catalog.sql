create table if not exists kleenest_ai.task_catalog (
 capability text primary key,
 description text not null,
 deterministic_first boolean not null default true,
 max_input_tokens integer not null,
 max_output_tokens integer not null,
 preferred_tier text not null check(preferred_tier in ('rules','small','medium','strong')),
 escalation_tier text not null check(escalation_tier in ('none','small','medium','strong')),
 required_evidence text[] not null default '{}',
 response_fields text[] not null default '{verdict,confidence,evidence_ids,action}',
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table kleenest_ai.task_catalog enable row level security;
revoke all on kleenest_ai.task_catalog from public,anon,authenticated;
grant select,insert,update,delete on kleenest_ai.task_catalog to service_role;
insert into kleenest_ai.task_catalog(capability,description,max_input_tokens,max_output_tokens,preferred_tier,escalation_tier,required_evidence) values
('finding_review','Assess one specific inspection finding; distinguish actionable defect from false positive',650,220,'small','medium',array['finding_id','severity','finding_type']),
('duplicate_resolution','Determine whether two location records represent the same physical business; never merge without independent verification',900,180,'small','strong',array['candidate_ids','distance_m','name_similarity']),
('ingestion_failure','Classify one failed ingestion run by source, error family and recoverable action',700,180,'small','medium',array['run_id','error_code','source']),
('coverage_gap','Assess one geospatial cell with missing expected businesses',850,200,'small','medium',array['cell_id','source_coverage']),
('route_regression','Diagnose one reproducible route or map defect from trace and expected behavior',1200,280,'medium','strong',array['test_id','trace','expected']),
('auth_regression','Diagnose one authentication flow failure using redacted event trace',900,260,'medium','strong',array['test_id','error_code']),
('accessibility_regression','Identify one actionable usability barrier from a bounded test case',900,220,'medium','strong',array['test_id','expected']),
('amenity_conflict','Resolve one conflicting amenity claim from evidence provenance',650,150,'small','medium',array['location_id','claims']),
('api_contract_regression','Identify cause of one failing API or SDK contract test',1100,260,'medium','strong',array['test_id','expected','actual']),
('capacity_optimization','Recommend one measurable ingestion concurrency or scheduling adjustment',1100,260,'medium','strong',array['time_window','throughput','errors']),
('security_finding','Triage one confirmed security-advisor finding without exposing secrets',900,240,'medium','strong',array['finding_id','severity'])
on conflict(capability) do update set description=excluded.description,max_input_tokens=excluded.max_input_tokens,max_output_tokens=excluded.max_output_tokens,preferred_tier=excluded.preferred_tier,escalation_tier=excluded.escalation_tier,required_evidence=excluded.required_evidence,updated_at=now();
