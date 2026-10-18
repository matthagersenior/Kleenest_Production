CREATE OR REPLACE FUNCTION public.kleenest_ai_worker_claim(p_task_id uuid, p_model_id text, p_reserve_usd numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t kleenest_ai.ai_tasks%rowtype; r uuid;
begin
 if current_user <> 'service_role' then raise exception 'forbidden'; end if;
 select * into t from kleenest_ai.ai_tasks where id=p_task_id for update skip locked;
 if not found or t.status<>'queued' or t.not_before>now() then return jsonb_build_object('claimed',false); end if;
 if not exists(select 1 from kleenest_ai.provider_models where id=p_model_id and enabled and model<>'unconfigured') then return jsonb_build_object('claimed',false); end if;
 r:=kleenest_ai.reserve_ai_budget(p_task_id,p_model_id,p_reserve_usd);
 update kleenest_ai.ai_tasks set status='running',attempt_count=attempt_count+1,updated_at=now() where id=p_task_id;
 return jsonb_build_object('claimed',true,'reservation_id',r,'evidence',t.evidence,'capability',t.capability);
end $function$
;

CREATE OR REPLACE FUNCTION public.kleenest_ai_worker_finish(p_task_id uuid, p_reservation_id uuid, p_result jsonb, p_error text, p_cost numeric, p_input_tokens integer, p_output_tokens integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_model text;
begin
 if current_user<>'service_role' then raise exception 'forbidden'; end if;
 select provider_model_id into v_model from kleenest_ai.ai_budget_reservations where id=p_reservation_id and task_id=p_task_id and status='reserved' for update;
 if not found then return false; end if;
 if not exists(select 1 from kleenest_ai.ai_tasks where id=p_task_id and status='running' for update) then return false; end if;
 perform kleenest_ai.settle_ai_budget(p_reservation_id,case when p_error is null then p_cost else least(coalesce(p_cost,0),(select reserved_usd from kleenest_ai.ai_budget_reservations where id=p_reservation_id)) end,false);
 update kleenest_ai.ai_tasks set status=case when p_error is null then 'completed' else 'review' end,result=case when p_error is null then p_result else null end,error_code=p_error,updated_at=now() where id=p_task_id;
 insert into kleenest_ai.ai_attempts(task_id,provider_model_id,finished_at,outcome,input_tokens,output_tokens,estimated_cost_usd,error_code)
 values(p_task_id,v_model,now(),case when p_error is null then 'success' else 'error' end,p_input_tokens,p_output_tokens,p_cost,p_error);
 return true;
end $function$
;
revoke all on function public.kleenest_ai_worker_claim(uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.kleenest_ai_worker_claim(uuid,text,numeric) to service_role;
revoke all on function public.kleenest_ai_worker_finish(uuid,uuid,jsonb,text,numeric,integer,integer) from public,anon,authenticated;
grant execute on function public.kleenest_ai_worker_finish(uuid,uuid,jsonb,text,numeric,integer,integer) to service_role;
