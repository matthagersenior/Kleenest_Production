create table if not exists public.user_trust_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  source text not null default 'location' check (source in ('explore','saved','play','location')),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  priority text not null check (priority in ('high','medium','low')),
  goal jsonb not null default '{}'::jsonb,
  baseline_evidence jsonb not null default '{}'::jsonb,
  completion_evidence jsonb,
  qualifying_review_id uuid references public.reviews(id) on delete set null,
  qualifying_check_in_id uuid references public.check_ins(id) on delete set null,
  reward_points integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  completion_processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_trust_missions_one_active_idx
  on public.user_trust_missions(user_id) where status='active';
create index if not exists user_trust_missions_user_history_idx
  on public.user_trust_missions(user_id, started_at desc);
create index if not exists user_trust_missions_location_idx
  on public.user_trust_missions(location_id);

alter table public.user_trust_missions enable row level security;
drop policy if exists user_trust_missions_self_read on public.user_trust_missions;
create policy user_trust_missions_self_read on public.user_trust_missions
  for select to authenticated using (user_id=(select auth.uid()));

revoke all on table public.user_trust_missions from public, anon, authenticated;
grant select, insert, update, delete on table public.user_trust_missions to service_role;

insert into public.progression_actions(code,label,points,enabled)
values('trust_mission_bonus','Complete a trust mission',15,true)
on conflict (code) do update set label=excluded.label, points=excluded.points, enabled=true;

create or replace function public.start_my_trust_mission(p_location_id uuid, p_source text default 'location')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_source text:=lower(trim(coalesce(p_source,'location')));
  v_location public.locations%rowtype;
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

  update public.user_trust_missions set status='cancelled',cancelled_at=now(),updated_at=now()
   where user_id=v_user and status='active';

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

create or replace function public.my_trust_mission()
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object(
    'id',m.id,'location_id',m.location_id,'location_name',l.name,'source',m.source,'status',m.status,'priority',m.priority,
    'goal',m.goal,'baseline_evidence',m.baseline_evidence,'completion_evidence',m.completion_evidence,'reward_points',m.reward_points,
    'started_at',m.started_at,'completed_at',m.completed_at
  ) into v_result
  from public.user_trust_missions m join public.locations l on l.id=m.location_id
  where m.user_id=v_user and m.status='active' order by m.started_at desc limit 1;
  return v_result;
end;
$$;

create or replace function public.my_trust_mission_history(p_limit integer default 20)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_limit integer:=least(greatest(coalesce(p_limit,20),1),100); v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'location_id',x.location_id,'location_name',x.location_name,'source',x.source,'status',x.status,'priority',x.priority,
    'goal',x.goal,'baseline_evidence',x.baseline_evidence,'completion_evidence',x.completion_evidence,'qualifying_review_id',x.qualifying_review_id,
    'reward_points',x.reward_points,'started_at',x.started_at,'completed_at',x.completed_at,'cancelled_at',x.cancelled_at
  ) order by x.started_at desc),'[]'::jsonb) into v_result
  from (
    select m.*,l.name as location_name from public.user_trust_missions m join public.locations l on l.id=m.location_id
    where m.user_id=v_user order by m.started_at desc limit v_limit
  ) x;
  return v_result;
end;
$$;

create or replace function public.cancel_my_trust_mission()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_row public.user_trust_missions%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  update public.user_trust_missions set status='cancelled',cancelled_at=now(),updated_at=now()
  where user_id=v_user and status='active' returning * into v_row;
  if not found then return null; end if;
  return jsonb_build_object('id',v_row.id,'location_id',v_row.location_id,'status',v_row.status,'cancelled_at',v_row.cancelled_at);
end;
$$;

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

  select * into v_review from public.reviews where id=p_review_id and user_id=v_user and location_id=v_mission.location_id and status='published';
  if not found or v_review.check_in_id is null then raise exception 'A published verified review for this mission location is required'; end if;
  select * into v_checkin from public.check_ins where id=v_review.check_in_id and user_id=v_user and location_id=v_mission.location_id;
  if not found then raise exception 'The review check-in does not qualify for this trust mission'; end if;
  if v_checkin.checked_in_at < v_mission.started_at - interval '5 minutes' then raise exception 'The qualifying visit must belong to this trust mission'; end if;

  select count(*) into v_photo_count from public.review_photos where review_id=v_review.id;
  select count(*) into v_amenity_count from public.review_amenity_feedback where review_id=v_review.id;
  if coalesce((v_mission.goal->>'requires_photo')::boolean,false) and v_photo_count=0 then raise exception 'This mission requires a current review photo'; end if;
  if coalesce((v_mission.goal->>'requires_amenity')::boolean,false) and v_amenity_count=0 then raise exception 'This mission requires an amenity observation'; end if;
  if coalesce((v_mission.goal->>'requires_photo_or_amenity')::boolean,false) and v_photo_count=0 and v_amenity_count=0 then raise exception 'This mission requires a current photo or amenity observation'; end if;

  select * into v_summary from public.mobile_location_trust_summaries(array[v_mission.location_id]) limit 1;
  v_progress:=public.record_progression_action('trust_mission_bonus',v_mission.id);
  v_points:=case when coalesce((v_progress->>'awarded')::boolean,false) then coalesce((v_progress->>'points')::integer,0) else 0 end;
  perform public.record_progression_metric_event('trust_mission_completed','trust_mission',v_mission.id,1,null,jsonb_build_object('idempotency_key','trust-mission:'||v_mission.id::text,'location_id',v_mission.location_id,'review_id',v_review.id));
  perform * from public.quest_dispatch_event(v_user,'trust_mission_completed',v_mission.location_id,v_checkin.id,null,null,jsonb_build_object('mission_id',v_mission.id,'review_id',v_review.id));

  update public.user_trust_missions set
    status='completed',qualifying_review_id=v_review.id,qualifying_check_in_id=v_checkin.id,reward_points=v_points,
    completion_evidence=jsonb_build_object('verified_visit_count',coalesce(v_summary.verified_visit_count,0),'photo_evidence_count',coalesce(v_summary.photo_evidence_count,0),'amenity_evidence_count',coalesce(v_summary.amenity_evidence_count,0),'latest_verified_at',v_summary.latest_verified_at,'review_photo_count',v_photo_count,'review_amenity_count',v_amenity_count),
    completed_at=now(),completion_processed_at=now(),updated_at=now()
  where id=v_mission.id and status='active' returning * into v_mission;

  select name into v_location_name from public.locations where id=v_mission.location_id;
  insert into public.social_activity(user_id,actor_user_id,activity_type,location_id,metadata)
  values(v_user,v_user,'trust_mission_completed',v_mission.location_id,jsonb_build_object('mission_id',v_mission.id,'review_id',v_review.id,'reward_points',v_points));
  insert into public.notifications(user_id,type,title,body,data)
  values(v_user,'progress_trust_mission_completed','Trust mission complete',format('You strengthened %s with verified evidence%s.',coalesce(v_location_name,'this restroom'),case when v_points>0 then format(' and earned %s bonus points',v_points) else '' end),jsonb_build_object('mission_id',v_mission.id,'location_id',v_mission.location_id,'review_id',v_review.id,'reward_points',v_points,'route','/play'));

  return jsonb_build_object('id',v_mission.id,'location_id',v_mission.location_id,'location_name',v_location_name,'status',v_mission.status,'priority',v_mission.priority,'goal',v_mission.goal,'reward_points',v_mission.reward_points,'started_at',v_mission.started_at,'completed_at',v_mission.completed_at,'completion_evidence',v_mission.completion_evidence);
end;
$$;

revoke all on function public.start_my_trust_mission(uuid,text) from public,anon;
revoke all on function public.my_trust_mission() from public,anon;
revoke all on function public.my_trust_mission_history(integer) from public,anon;
revoke all on function public.cancel_my_trust_mission() from public,anon;
revoke all on function public.complete_my_trust_mission(uuid) from public,anon;
grant execute on function public.start_my_trust_mission(uuid,text) to authenticated,service_role;
grant execute on function public.my_trust_mission() to authenticated,service_role;
grant execute on function public.my_trust_mission_history(integer) to authenticated,service_role;
grant execute on function public.cancel_my_trust_mission() to authenticated,service_role;
grant execute on function public.complete_my_trust_mission(uuid) to authenticated,service_role;
