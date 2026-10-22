
-- Owner-controlled implementation operations for AI findings. Freeform AI text is never executable.
create table if not exists kleenest_ai.ai_implementation_actions (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references kleenest_ai.ai_tasks(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 action_key text not null check (action_key in ('run_bounded_ingestion_cycle','repair_stalled_ingestion','development_request')),
 owner_instructions text not null default '' check (char_length(owner_instructions)<=1500),
 status text not null check (status in ('requested','queued','executed','deferred','awaiting_development','failed')),
 execution_result jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(task_id,action_key)
);
create index if not exists ai_implementation_actions_recent_idx on kleenest_ai.ai_implementation_actions(created_at desc);
alter table kleenest_ai.ai_implementation_actions enable row level security;
revoke all on kleenest_ai.ai_implementation_actions from public,anon,authenticated;

create or replace function public.owner_ai_implementation_preview(p_task_id uuid, p_action_key text)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare v_task kleenest_ai.ai_tasks%rowtype; v_prior jsonb; v_title text; v_effect text; v_scope text;
begin
 if auth.uid() is null or not public.is_platform_owner(auth.uid()) then
  raise exception 'owner access required' using errcode='42501';
 end if;
 select * into v_task from kleenest_ai.ai_tasks where id=p_task_id;
 if not found or v_task.result is null or v_task.status not in ('completed','review') then
  raise exception 'AI recommendation not actionable yet' using errcode='22023';
 end if;
 if p_action_key='run_bounded_ingestion_cycle' and v_task.capability in ('ingestion_signal_intelligence','coverage_gap') then
  v_title:='Run one bounded ingestion cycle';
  v_effect:='Request exactly one real ingestion scheduler cycle using current capacity guards. Queued does not mean new locations were imported.';
  v_scope:='ingestion';
 elsif p_action_key='repair_stalled_ingestion' and v_task.capability='ingestion_signal_intelligence' then
  v_title:='Repair stalled ingestion cells';
  v_effect:='Run the existing guarded repair routine once, then retain its returned national-ingestion status. This does not certify every failure is resolved.';
  v_scope:='ingestion';
 elsif p_action_key='development_request' then
  v_title:='Create an implementation work item';
  v_effect:='Record a specific change request linked to this finding for development and verification. No code, database record, or configuration changes are applied by this action.';
  v_scope:='development';
 else
  raise exception 'Action is not supported for this AI recommendation' using errcode='22023';
 end if;
 select to_jsonb(a) into v_prior from (
  select id,action_key,status,owner_instructions,execution_result,created_at,updated_at
  from kleenest_ai.ai_implementation_actions
  where task_id=p_task_id and action_key=p_action_key
 ) a;
 return jsonb_build_object('task_id',p_task_id,'action_key',p_action_key,'title',v_title,
  'effect',v_effect,'scope',v_scope,'needs_confirmation',true,'prior',v_prior,
  'warning','The model recommendation is a hypothesis, not verified evidence. Only this named operation will be run.',
  'recommendation',left(coalesce(v_task.result->>'recommendation',''),1200));
end $fn$;
revoke all on function public.owner_ai_implementation_preview(uuid,text) from public,anon;
grant execute on function public.owner_ai_implementation_preview(uuid,text) to authenticated;

create or replace function public.owner_ai_implementation_execute(
 p_task_id uuid,p_action_key text,p_confirmation text,p_owner_instructions text default ''
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare v_owner uuid:=auth.uid();v_task kleenest_ai.ai_tasks%rowtype;
 v_note text:=btrim(coalesce(p_owner_instructions,''));v_id uuid;v_response jsonb;v_status text;v_existing jsonb;
begin
 if v_owner is null or not public.is_platform_owner(v_owner) then
  raise exception 'owner access required' using errcode='42501';
 end if;
 if p_confirmation is distinct from 'CONFIRM_IMPLEMENTATION' then
  raise exception 'explicit implementation confirmation required' using errcode='22023';
 end if;
 if char_length(v_note)>1500 or (p_action_key='development_request' and char_length(v_note)<15) then
  raise exception 'provide specific development instructions (15-1500 characters)' using errcode='22023';
 end if;
 select * into v_task from kleenest_ai.ai_tasks where id=p_task_id;
 if not found or v_task.result is null or v_task.status not in ('completed','review') then
  raise exception 'AI recommendation is not ready to implement' using errcode='22023';
 end if;
 -- Server-owned allowlist: never interpret recommendations as SQL, code, function names or arguments.
 if not ((p_action_key='run_bounded_ingestion_cycle' and v_task.capability in ('ingestion_signal_intelligence','coverage_gap'))
 or (p_action_key='repair_stalled_ingestion' and v_task.capability='ingestion_signal_intelligence')
 or p_action_key='development_request') then
  raise exception 'unsupported action for task' using errcode='22023';
 end if;
 insert into kleenest_ai.ai_implementation_actions(task_id,owner_id,action_key,owner_instructions,status)
 values (p_task_id,v_owner,p_action_key,v_note,'requested')
 on conflict (task_id,action_key) do nothing returning id into v_id;
 if v_id is null then
  select jsonb_build_object('id',id,'action_key',action_key,'status',status,
   'execution_result',execution_result,'created_at',created_at,'already_recorded',true)
  into v_existing from kleenest_ai.ai_implementation_actions where task_id=p_task_id and action_key=p_action_key;
  return v_existing;
 end if;
 if p_action_key='development_request' then
  v_status:='awaiting_development';
  v_response:=jsonb_build_object('message','Implementation request recorded; engineering change not yet applied',
   'task_id',p_task_id,'capability',v_task.capability,
   'proposed_recommendation',left(coalesce(v_task.result->>'recommendation',''),3000));
 else
  begin
   if p_action_key='run_bounded_ingestion_cycle' then
    v_response:=public.owner_run_ingestion_cycle('Owner-approved AI recommendation '||p_task_id::text||
     case when v_note='' then '' else ': '||left(v_note,140) end);
    v_status:=case when v_response->>'status'='queued' and coalesce((v_response->>'request_id')::bigint,0)>0 then 'queued'
      else 'deferred' end;
   elsif p_action_key='repair_stalled_ingestion' then
    v_response:=public.owner_repair_ingestion_cells('Owner-approved AI recommendation '||p_task_id::text||
     case when v_note='' then '' else ': '||left(v_note,140) end);
    v_status:='executed';
   end if;
  exception when others then
   v_status:='failed';
   v_response:=jsonb_build_object('message','Operational action failed','sqlstate',sqlstate,
     'details',left(sqlerrm,300));
  end;
 end if;
 update kleenest_ai.ai_implementation_actions
 set status=v_status, execution_result=coalesce(v_response,'{}'::jsonb),updated_at=now()
 where id=v_id;
 return jsonb_build_object('id',v_id,'task_id',p_task_id,'action_key',p_action_key,
  'status',v_status,'execution_result',v_response,'already_recorded',false,'created_at',now());
end $fn$;
revoke all on function public.owner_ai_implementation_execute(uuid,text,text,text) from public,anon;
grant execute on function public.owner_ai_implementation_execute(uuid,text,text,text) to authenticated;

create or replace function public.owner_ai_jobs_snapshot(p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare v_result jsonb;
begin
 if auth.uid() is null or not public.is_platform_owner(auth.uid()) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 select jsonb_build_object(
 'budget',kleenest_ai.budget_status(),
 'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc)
 from (select id,capability,status,priority,attempt_count,created_at,updated_at,result,error_code,data_class
 from kleenest_ai.ai_tasks order by created_at desc limit least(greatest(p_limit,1),100)) t),'[]'::jsonb),
 'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.finished_at desc)
 from (select task_id,provider_model_id,finished_at,outcome,input_tokens,output_tokens,estimated_cost_usd,error_code
 from kleenest_ai.ai_attempts order by finished_at desc nulls last limit 25) a),'[]'::jsonb),
 'providers',coalesce((select jsonb_agg(jsonb_build_object('provider',m.provider,'model',m.model,'enabled',m.enabled) order by m.provider)
 from kleenest_ai.provider_models m where m.provider<>'huggingface'),'[]'::jsonb),
 'feedback',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc)
 from (select id,task_id,owner_id,action,note,followup_task_id,created_at
 from kleenest_ai.ai_task_feedback order by created_at desc limit 300) f),'[]'::jsonb),
 'implementations',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc)
 from (select id,task_id,owner_id,action_key,owner_instructions,status,execution_result,created_at,updated_at
 from kleenest_ai.ai_implementation_actions order by created_at desc limit 300) i),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $fn$;
