create or replace function public.start_my_trust_mission(p_location_id uuid,p_source text default 'location')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_source text:=lower(trim(coalesce(p_source,'location')));
  v_location public.locations%rowtype;
  v_active public.user_trust_missions%rowtype;
  v_active_location_name text;
  v_summary record;
  v_verified bigint:=0;
  v_photos bigint:=0;
  v_amenities bigint:=0;
  v_latest timestamptz;
  v_days numeric;
  v_score integer:=0;
  v_priority text;
  v_goal jsonb;
  v_row public.user_trust_missions%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_source not in ('explore','saved','play','location') then v_source:='location'; end if;

  select * into v_active
  from public.user_trust_missions
  where user_id=v_user and status='active'
  order by started_at desc
  limit 1
  for update;

  if found then
    select name into v_active_location_name from public.locations where id=v_active.location_id;
    if v_active.location_id=p_location_id then
      return jsonb_build_object(
        'id',v_active.id,'location_id',v_active.location_id,'location_name',coalesce(v_active_location_name,'Restroom location'),
        'source',v_active.source,'status',v_active.status,'priority',v_active.priority,'goal',v_active.goal,
        'baseline_evidence',v_active.baseline_evidence,'reward_points',v_active.reward_points,
        'started_at',v_active.started_at,'completed_at',v_active.completed_at
      );
    end if;
    raise exception 'An active trust mission already exists at %. Complete or cancel it before starting another.',coalesce(v_active_location_name,'another restroom');
  end if;

  select * into v_location from public.locations where id=p_location_id and is_active=true;
  if not found then raise exception 'Location is not available'; end if;

  select * into v_summary from public.mobile_location_trust_summaries(array[p_location_id]) limit 1;
  v_verified:=coalesce(v_summary.verified_visit_count,0);
  v_photos:=coalesce(v_summary.photo_evidence_count,0);
  v_amenities:=coalesce(v_summary.amenity_evidence_count,0);
  v_latest:=v_summary.latest_verified_at;
  v_score:=least(40,v_verified::integer*10)+least(20,v_photos::integer*4)+least(20,v_amenities::integer*4);
  if v_latest is not null then
    v_days:=greatest(0,extract(epoch from (now()-v_latest))/86400);
    v_score:=v_score+case when v_days<=1 then 20 when v_days<=7 then 16 when v_days<=30 then 10 when v_days<=90 then 5 else 2 end;
  end if;
  if v_verified=0 then v_priority:='high'; elsif v_score<45 then v_priority:='medium'; elsif v_score<70 then v_priority:='low'; else raise exception 'This restroom already has strong current evidence'; end if;

  v_goal:=jsonb_build_object(
    'kind',case
      when v_verified=0 then 'verified_visit'
      when v_photos=0 and v_amenities=0 then 'supplemental_evidence'
      when v_photos=0 then 'photo_evidence'
      when v_amenities=0 then 'amenity_evidence'
      else 'fresh_verified_visit' end,
    'requires_verified_review',true,
    'requires_photo',v_verified>0 and v_photos=0 and v_amenities>0,
    'requires_amenity',v_verified>0 and v_amenities=0 and v_photos>0,
    'requires_photo_or_amenity',v_verified>0 and v_photos=0 and v_amenities=0,
    'steps',jsonb_build_array(
      'Check in while physically at the restroom',
      'Publish a verified review from that check-in',
      case when v_verified=0 then 'Add current photo or amenity evidence when possible'
           when v_photos=0 and v_amenities=0 then 'Add a current photo or amenity observation'
           when v_photos=0 then 'Add a current restroom photo'
           when v_amenities=0 then 'Record an amenity observation'
           else 'Refresh the verified evidence' end
    )
  );

  insert into public.user_trust_missions(user_id,location_id,source,status,priority,goal,baseline_evidence)
  values(v_user,p_location_id,v_source,'active',v_priority,v_goal,jsonb_build_object(
    'verified_visit_count',v_verified,'photo_evidence_count',v_photos,'amenity_evidence_count',v_amenities,'latest_verified_at',v_latest,'score',v_score
  )) returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,'location_id',v_row.location_id,'location_name',v_location.name,'source',v_row.source,'status',v_row.status,
    'priority',v_row.priority,'goal',v_row.goal,'baseline_evidence',v_row.baseline_evidence,'reward_points',v_row.reward_points,
    'started_at',v_row.started_at,'completed_at',v_row.completed_at
  );
end;
$$;

revoke all on function public.start_my_trust_mission(uuid,text) from public,anon;
grant execute on function public.start_my_trust_mission(uuid,text) to authenticated,service_role;
