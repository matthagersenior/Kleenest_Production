CREATE OR REPLACE FUNCTION public.owner_ai_jobs_snapshot(p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if auth.uid() is null or not public.is_platform_owner(auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
 select jsonb_build_object(
 'budget',kleenest_ai.budget_status(),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select id,capability,status,priority,attempt_count,created_at,updated_at,result,error_code,data_class from kleenest_ai.ai_tasks order by created_at desc limit least(greatest(p_limit,1),100)) t),'[]'::jsonb),
 'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.finished_at desc) from (select task_id,provider_model_id,finished_at,outcome,input_tokens,output_tokens,estimated_cost_usd,error_code from kleenest_ai.ai_attempts order by finished_at desc nulls last limit 25) a),'[]'::jsonb),
 'providers',coalesce((select jsonb_agg(jsonb_build_object('provider',m.provider,'model',m.model,'enabled',m.enabled) order by m.provider) from kleenest_ai.provider_models m where m.provider<>'huggingface'),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $function$
;
revoke all on function public.owner_ai_jobs_snapshot(integer) from public,anon,authenticated;
grant execute on function public.owner_ai_jobs_snapshot(integer) to authenticated,service_role;
