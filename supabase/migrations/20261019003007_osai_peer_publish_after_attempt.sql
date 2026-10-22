create or replace function kleenest_ai.peer_review_publish() returns trigger language plpgsql security definer set search_path='' as $$
declare p kleenest_ai.ai_tasks%rowtype; t kleenest_ai.ai_tasks%rowtype; primary_provider text; peer_provider text;
begin
 if new.outcome <> 'success' then return new; end if;
 select * into t from kleenest_ai.ai_tasks where id=new.task_id;
 if t.input_fingerprint not like 'peer-v1-%' or t.status<>'completed' then return new; end if;
 select * into p from kleenest_ai.ai_tasks where capability=t.capability and input_fingerprint=substr(t.input_fingerprint,9);
 if p.id is null then return new; end if;
 select m.provider into primary_provider from kleenest_ai.ai_attempts a join kleenest_ai.provider_models m on m.id=a.provider_model_id where a.task_id=p.id and a.outcome='success' order by a.finished_at desc limit 1;
 select m.provider into peer_provider from kleenest_ai.provider_models m where m.id=new.provider_model_id;
 if primary_provider is null or peer_provider is null or primary_provider=peer_provider then return new; end if;
 update kleenest_ai.ai_tasks set result=coalesce(result,'{}'::jsonb)||jsonb_build_object('independent_review',jsonb_build_object('status','completed','primary_provider',primary_provider,'peer_provider',peer_provider,'peer_task_id',t.id,'peer_summary',t.result->>'summary','peer_recommendation',t.result->>'recommendation','peer_confidence',t.result->'confidence','confidence_difference',abs(coalesce((p.result->>'confidence')::numeric,0)-coalesce((t.result->>'confidence')::numeric,0)),'agreement_status','not_yet_adjudicated','note','Independently generated hypotheses; agreement is not inferred without further evidence')) where id=p.id;
 return new;
end $$;
drop trigger if exists ai_peer_review_publish on kleenest_ai.ai_attempts;
create trigger ai_peer_review_publish after update of outcome on kleenest_ai.ai_attempts for each row execute function kleenest_ai.peer_review_publish();
revoke all on function kleenest_ai.peer_review_publish() from public,anon,authenticated;
