insert into public.progression_actions(code,label,points,enabled)
values('trust_mission_visit_bonus','Complete a verified trust mission visit',5,true)
on conflict (code) do update set label=excluded.label, points=excluded.points, enabled=true;

create or replace function public.complete_my_trust_mission(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_mission public.user_trust_missions%rowtype;
  v_review public.reviews%rowtype;
  v_checkin public.check_ins%rowtype;
  v_location_name text;
  v_photo_count integer:=0;
  v_amenity_count integer:=0;
  v_summary record;
  v_progress jsonb;
  v_points integer:=0;
  v_goal_satisfied boolean:=true;
  v_action text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_mission from public.user_trust_missions
   where user_id=v_user and status='active' order by started_at desc limit 1 for update;
  if not found then
    select * into v_mission from public.user_trust_missions
     where user_id=v_user and status='completed' and qualifying_review_id=p_review_id order by completed_at desc limit 1;
    if found then
      select l.name into v_location_name from public.locations l where l.id=v_mission.location_id;
      return jsonb_build_object('id',v_mission.id,'location_id',v_mission.location_id,'location_name',v_location_name,'status','completed','priority',v_mission.priority,'goal',v_mission.goal,'reward_points',v_mission.reward_points,'started_at',v_mission.started_at,'completed_at',v_mission.completed_at,'completion_evidence',v_mission.completion_evidence);
    end if;
    raise exception 'No active trust mission';
  end if;

  select * into v_review from public.reviews
   where id=p_review_id and user_id=v_user and location_id=v_mission.location_id and status='published';
  if not found or v_review.check_in_id is null then raise exception 'A published verified review for this mission location is required'; end if;

  select * into v_checkin from public.check_ins
   where id=v_review.check_in_id and user_id=v_user and location_id=v_mission.location_id;
  if not found then raise exception 'The review check-in does not qualify for this trust mission'; end if;
  if v_checkin.checked_in_at < v_mission.started_at - interval '5 minutes' then raise exception 'The qualifying visit must belong to this trust mission'; end if;

  select count(*) into v_photo_count from public.review_photos where review_id=v_review.id;
  select count(*) into v_amenity_count from public.review_amenity_feedback where review_id=v_review.id;

  v_goal_satisfied := not (
    (coalesce((v_mission.goal->>'requires_photo')::boolean,false) and v_photo_count=0) or
    (coalesce((v_mission.goal->>'requires_amenity')::boolean,false) and v_amenity_count=0) or
    (coalesce((v_mission.goal->>'requires_photo_or_amenity')::boolean,false) and v_photo_count=0 and v_amenity_count=0)
  );
  v_action:=case when v_goal_satisfied then 'trust_mission_bonus' else 'trust_mission_visit_bonus' end;

  select * into v_summary from public.mobile_location_trust_summaries(array[v_mission.location_id]) limit 1;
  v_progress:=public.record_progression_action(v_action,v_mission.id);
  v_points:=case when coalesce((v_progress->>'awarded')::boolean,false) then coalesce((v_progress->>'points')::integer,0) else 0 end;

  perform public.record_progression_metric_event(
    'trust_mission_completed','trust_mission',v_mission.id,1,null,
    jsonb_build_object('idempotency_key','trust-mission:'||v_mission.id::text,'location_id',v_mission.location_id,'review_id',v_review.id,'goal_satisfied',v_goal_satisfied)
  );
  perform * from public.quest_dispatch_event(
    v_user,'trust_mission_completed',v_mission.location_id,v_checkin.id,null,null,
    jsonb_build_object('mission_id',v_mission.id,'review_id',v_review.id,'goal_satisfied',v_goal_satisfied)
  );

  update public.user_trust_missions set
    status='completed',
    qualifying_review_id=v_review.id,
    qualifying_check_in_id=v_checkin.id,
    reward_points=v_points,
    completion_evidence=jsonb_build_object(
      'verified_visit_count',coalesce(v_summary.verified_visit_count,0),
      'photo_evidence_count',coalesce(v_summary.photo_evidence_count,0),
      'amenity_evidence_count',coalesce(v_summary.amenity_evidence_count,0),
      'latest_verified_at',v_summary.latest_verified_at,
      'review_photo_count',v_photo_count,
      'review_amenity_count',v_amenity_count,
      'goal_satisfied',v_goal_satisfied
    ),
    completed_at=now(),completion_processed_at=now(),updated_at=now()
  where id=v_mission.id and status='active'
  returning * into v_mission;

  select name into v_location_name from public.locations where id=v_mission.location_id;

  insert into public.social_activity(user_id,actor_user_id,activity_type,location_id,metadata)
  values(
    v_user,v_user,'trust_mission_completed',v_mission.location_id,
    jsonb_build_object(
      'mission_id',v_mission.id,
      'review_id',v_review.id,
      'reward_points',v_points,
      'goal_satisfied',v_goal_satisfied,
      'summary',case when v_goal_satisfied then 'Completed the full evidence goal' else 'Completed a verified visit; supplemental evidence is still useful' end
    )
  );

  insert into public.notifications(user_id,type,title,body,data)
  values(
    v_user,
    'progress_trust_mission_completed',
    'Trust mission complete',
    format(
      'You strengthened %s with a verified contribution and earned %s bonus points%s.',
      coalesce(v_location_name,'this restroom'),
      v_points,
      case when v_goal_satisfied then ' for completing the full evidence goal' else '' end
    ),
    jsonb_build_object(
      'mission_id',v_mission.id,
      'location_id',v_mission.location_id,
      'review_id',v_review.id,
      'reward_points',v_points,
      'goal_satisfied',v_goal_satisfied,
      'route','/play'
    )
  );

  return jsonb_build_object(
    'id',v_mission.id,
    'location_id',v_mission.location_id,
    'location_name',v_location_name,
    'status',v_mission.status,
    'priority',v_mission.priority,
    'goal',v_mission.goal,
    'reward_points',v_mission.reward_points,
    'started_at',v_mission.started_at,
    'completed_at',v_mission.completed_at,
    'completion_evidence',v_mission.completion_evidence
  );
end;
$$;

revoke all on function public.complete_my_trust_mission(uuid) from public,anon;
grant execute on function public.complete_my_trust_mission(uuid) to authenticated,service_role;
