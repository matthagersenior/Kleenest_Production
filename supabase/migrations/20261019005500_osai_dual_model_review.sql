create or replace function public.kleenest_ai_peer_primary_provider(p_capability text,p_fingerprint text) returns text language sql stable security definer set search_path='' as $$
 select m.provider from kleenest_ai.ai_tasks t join kleenest_ai.ai_attempts a on a.task_id=t.id join kleenest_ai.provider_models m on m.id=a.provider_model_id where t.capability=p_capability and t.input_fingerprint=p_fingerprint and a.outcome='success' order by a.finished_at desc limit 1
$$;
revoke all on function public.kleenest_ai_peer_primary_provider(text,text) from public,anon,authenticated;
grant execute on function public.kleenest_ai_peer_primary_provider(text,text) to service_role;
create or replace function kleenest_ai.peer_review_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare v_primary kleenest_ai.ai_tasks%rowtype; v_primary_provider text; v_peer_provider text;
begin
 if new.status <> 'completed' or old.status='completed' then return new; end if;
 if new.input_fingerprint like 'investigate-v1-%' then
  insert into kleenest_ai.ai_tasks(capability,input_fingerprint,evidence,data_class,status,priority)
  values(new.capability,'peer-v1-'||new.input_fingerprint,new.evidence,'public','queued',new.priority)
  on conflict(capability,input_fingerprint) do nothing;
 elsif new.input_fingerprint like 'peer-v1-%' then
  select * into v_primary from kleenest_ai.ai_tasks where capability=new.capability and input_fingerprint=substr(new.input_fingerprint,9) limit 1;
  if v_primary.id is null then return new; end if;
  select m.provider into v_primary_provider from kleenest_ai.ai_attempts a join kleenest_ai.provider_models m on m.id=a.provider_model_id where a.task_id=v_primary.id and a.outcome='success' order by a.finished_at desc limit 1;
  select m.provider into v_peer_provider from kleenest_ai.ai_attempts a join kleenest_ai.provider_models m on m.id=a.provider_model_id where a.task_id=new.id and a.outcome='success' order by a.finished_at desc limit 1;
  if v_primary_provider is null or v_peer_provider is null or v_primary_provider=v_peer_provider then return new; end if;
  update kleenest_ai.ai_tasks set result=coalesce(result,'{}'::jsonb)||jsonb_build_object('independent_review',jsonb_build_object(
   'status','completed','primary_provider',v_primary_provider,'peer_provider',v_peer_provider,
   'peer_task_id',new.id,'peer_summary',new.result->>'summary','peer_recommendation',new.result->>'recommendation',
   'peer_confidence',new.result->'confidence','confidence_difference',abs(coalesce((v_primary.result->>'confidence')::numeric,0)-coalesce((new.result->>'confidence')::numeric,0)),
   'agreement_status','not_yet_adjudicated','note','Both hypotheses are independently generated; disagreement requires evidence-based review, not assumed consensus'
  )) where id=v_primary.id;
 end if;
 return new;
end $$;
drop trigger if exists ai_peer_review_lifecycle on kleenest_ai.ai_tasks;
create trigger ai_peer_review_lifecycle after update of status on kleenest_ai.ai_tasks for each row execute function kleenest_ai.peer_review_lifecycle();
revoke all on function kleenest_ai.peer_review_lifecycle() from public,anon,authenticated;
