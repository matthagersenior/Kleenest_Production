CREATE OR REPLACE FUNCTION public.owner_ai_feedback_submit(p_task_id uuid, p_action text, p_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'original_observation',left(coalesce(v_task.result->>'summary',''),700),
    'original_recommendation',left(coalesce(v_task.result->>'recommendation',''),1100),
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
$function$
;