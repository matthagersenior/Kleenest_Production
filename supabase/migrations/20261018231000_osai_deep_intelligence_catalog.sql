-- Deep intelligence task definitions. Reports are evidence-driven, advisory, and non-destructive.
insert into kleenest_ai.task_catalog(capability,description,deterministic_first,max_input_tokens,max_output_tokens,preferred_tier,escalation_tier,required_evidence,response_fields,enabled)
select x.capability,x.description,true,1100,260,'medium','strong',x.required_evidence,array['summary','recommendation','confidence','requires_human_approval'],true from (values
('restroom_evidence_gap','Investigate canonical location coverage versus verified restroom accessibility',array['location_count','verification_count']),
('entity_relationship_intelligence','Analyze duplicate candidates and geocoding gaps without destructive merges',array['duplicate_cases','geocode_pending']),
('ingestion_signal_intelligence','Assess geographic source growth and ingestion observability',array['geographic_distribution','ingestion_observability']),
('behavioral_signal_intelligence','Detect discovery activity measurement gaps without inferring personal intent',array['session_count','measurement_window'])
) as x(capability,description,required_evidence)
on conflict(capability) do update set description=excluded.description,required_evidence=excluded.required_evidence,enabled=true;