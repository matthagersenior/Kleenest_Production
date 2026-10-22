
create table if not exists kleenest_ai.ai_task_feedback (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references kleenest_ai.ai_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  action text not null check (action in ('agree','reject','comment','follow_up')),
  note text not null default '' check (length(note) <= 1500),
  followup_task_id uuid references kleenest_ai.ai_tasks(id),
  created_at timestamptz not null default now()
);
create index if not exists ai_task_feedback_task_date_idx on kleenest_ai.ai_task_feedback(task_id,created_at desc);
alter table kleenest_ai.ai_task_feedback enable row level security;
revoke all on kleenest_ai.ai_task_feedback from public,anon,authenticated;

create or replace function public.owner_ai_feedback_submit(
 p_task_id uuid, p_action text, p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = ''
as $func$
declare
 v_owner uuid := auth.uid();
 v_task kleenest_ai.ai_tasks%rowtype;
 v_note text := btrim(coalesce(p_note,''));
 v_feedback_id uuid;
 v_followup_id uuid;
begin
 if v_owner is null or not public.is_platform_owner(v_owner) then
  raise exception 'owner authorization required' using errcode='42501';
 end if;
 if p_action is null or p_action not in ('agree','reject','comment','follow_up') then
  raise exception 'invalid feedback action' using errcode='22023';
 end if;
 if length(v_note)>1500 or (p_action in ('comment','follow_up') and length(v_note)=0) then
  raise exception 'feedback must contain between 1 and 1500 characters for comments and follow-ups' using errcode='22023';
 end if;
 select * into v_task from kleenest_ai.ai_tasks where id=p_task_id;
 if not found or v_task.result is null or v_task.status not in ('completed','review') then
  raise exception 'job result is not ready for owner response' using errcode='22023';
 end if;
 insert into kleenest_ai.ai_task_feedback(task_id,owner_id,action,note)
 values (p_task_id,v_owner,p_action,v_note) returning id into v_feedback_id;
 if p_action='follow_up' then
  insert into kleenest_ai.ai_tasks(capability,input_fingerprint,evidence,data_class,status,priority)
  values (
   v_task.capability,
   'owner-followup-v1-'||v_feedback_id::text,
   jsonb_build_object(
    'owner_follow_up_question',v_note,
    'original_task_id',p_task_id,
    'original_observation',left(coalesce(v_task.result->>'summary',''),3000),
    'original_recommendation',left(coalesce(v_task.result->>'recommendation',''),3000),
    'human_approval_required',true
   ),
   v_task.data_class,
   case when v_task.data_class='public' then 'queued' else 'review' end,
   greatest(1,least(coalesce(v_task.priority,100),100))
  ) returning id into v_followup_id;
  update kleenest_ai.ai_task_feedback set followup_task_id=v_followup_id where id=v_feedback_id;
 end if;
 return jsonb_build_object('id',v_feedback_id,'task_id',p_task_id,'action',p_action,
                           'followup_task_id',v_followup_id,'created',true);
end;
$func$;
revoke all on function public.owner_ai_feedback_submit(uuid,text,text) from public,anon;
grant execute on function public.owner_ai_feedback_submit(uuid,text,text) to authenticated;

create or replace function public.owner_ai_jobs_snapshot(p_limit integer default 40)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $func$
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
           from kleenest_ai.ai_task_feedback order by created_at desc limit 300) f),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $func$;
