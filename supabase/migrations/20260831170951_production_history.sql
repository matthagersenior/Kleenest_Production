create or replace function public.start_reverification_trust_mission(p_location_id uuid,p_source text default 'reverification')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare q jsonb; m jsonb; v_id uuid; v_goal jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 q:=public.get_location_trust_quality(p_location_id);
 if q is null then raise exception 'Location is not available'; end if;
 if not coalesce((q->>'needs_reverification')::boolean,false) then raise exception 'This restroom does not currently need reverification'; end if;
 m:=public.start_my_trust_mission(p_location_id,'play');
 v_id:=(m->>'id')::uuid;
 v_goal:=coalesce(m->'goal','{}'::jsonb)||jsonb_build_object(
   'workflow','reverification',
   'requires_amenity',coalesce((q->>'contradiction_count')::int,0)>0,
   'requires_conflict_resolution',coalesce((q->>'contradiction_count')::int,0)>0,
   'baseline_contradiction_count',coalesce((q->>'contradiction_count')::int,0),
   'consensus_policy',coalesce(q->>'consensus_policy','3_to_1_canonical_observation_consensus'),
   'steps',jsonb_build_array('Check in while physically at the restroom','Publish a verified review','Confirm the amenities you actually observe','Kleenest will recalculate freshness and conflict consensus automatically')
 );
 update public.user_trust_missions set source=coalesce(nullif(trim(p_source),''),'reverification'),goal=v_goal,baseline_evidence=coalesce(baseline_evidence,'{}'::jsonb)||jsonb_build_object('trust_quality',q),updated_at=now() where id=v_id and user_id=auth.uid() and status='active';
 return public.my_trust_mission();
end;
$function$;

create or replace function public.complete_reverification_trust_mission(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare m jsonb; q jsonb; v_id uuid; v_location uuid; v_before int; v_after int; v_cleared boolean;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select id,location_id,coalesce((goal->>'baseline_contradiction_count')::int,0) into v_id,v_location,v_before from public.user_trust_missions where user_id=auth.uid() and status='active' order by started_at desc limit 1;
 if v_id is null then raise exception 'No active trust mission'; end if;
 m:=public.complete_my_trust_mission(p_review_id);
 q:=public.get_location_trust_quality(v_location);
 v_after:=coalesce((q->>'contradiction_count')::int,0);
 v_cleared:=not coalesce((q->>'needs_reverification')::boolean,true);
 update public.user_trust_missions set completion_evidence=coalesce(completion_evidence,'{}'::jsonb)||jsonb_build_object('post_trust_quality',q,'reverification_cleared',v_cleared,'contradictions_before',v_before,'contradictions_after',v_after,'conflict_reduced',v_after<v_before),updated_at=now() where id=v_id and user_id=auth.uid();
 return (select jsonb_build_object('id',x.id,'location_id',x.location_id,'location_name',l.name,'source',x.source,'status',x.status,'priority',x.priority,'goal',x.goal,'baseline_evidence',x.baseline_evidence,'completion_evidence',x.completion_evidence,'reward_points',x.reward_points,'started_at',x.started_at,'completed_at',x.completed_at) from public.user_trust_missions x join public.locations l on l.id=x.location_id where x.id=v_id);
end;
$function$;

revoke all on function public.start_reverification_trust_mission(uuid,text) from public,anon;
revoke all on function public.complete_reverification_trust_mission(uuid) from public,anon;
grant execute on function public.start_reverification_trust_mission(uuid,text) to authenticated,service_role;
grant execute on function public.complete_reverification_trust_mission(uuid) to authenticated,service_role;
