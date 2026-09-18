create table if not exists public.ai_response_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  trace_id text not null,
  task text,
  provider text,
  model text,
  reason text not null,
  details text,
  answer_excerpt text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create unique index if not exists ai_response_reports_reporter_trace_uidx
  on public.ai_response_reports(reporter_id, trace_id);
create index if not exists ai_response_reports_status_created_idx
  on public.ai_response_reports(status, created_at desc);

alter table public.ai_response_reports enable row level security;
drop policy if exists "Users can view their AI reports" on public.ai_response_reports;
create policy "Users can view their AI reports"
  on public.ai_response_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create or replace function public.current_policy_versions()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'terms','2026-09-01',
    'community','2026-09-01',
    'privacy','2026-09-01'
  );
$$;

create or replace function public.require_current_policy_acceptance()
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.has_current_policy_acceptance() then
    raise exception 'POLICY_ACCEPTANCE_REQUIRED';
  end if;
end;
$$;

create or replace function public.users_have_block_relationship(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_a is not null and p_b is not null and exists(
    select 1
    from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.enforce_ugc_policy_acceptance()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid;
begin
  v_actor := coalesce(
    nullif(to_jsonb(new)->>'user_id','')::uuid,
    nullif(to_jsonb(new)->>'from_id','')::uuid
  );
  if auth.uid() is not null and v_actor = auth.uid() then
    perform public.require_current_policy_acceptance();
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_require_policy_acceptance on public.reviews;
create trigger reviews_require_policy_acceptance
before insert on public.reviews
for each row execute function public.enforce_ugc_policy_acceptance();

drop trigger if exists social_posts_require_policy_acceptance on public.social_posts;
create trigger social_posts_require_policy_acceptance
before insert on public.social_posts
for each row execute function public.enforce_ugc_policy_acceptance();

drop trigger if exists social_post_comments_require_policy_acceptance on public.social_post_comments;
create trigger social_post_comments_require_policy_acceptance
before insert on public.social_post_comments
for each row execute function public.enforce_ugc_policy_acceptance();

drop trigger if exists messages_require_policy_acceptance on public.messages;
create trigger messages_require_policy_acceptance
before insert on public.messages
for each row execute function public.enforce_ugc_policy_acceptance();

create or replace function public.report_ai_response(
  p_trace_id text,
  p_reason text,
  p_details text default null,
  p_task text default null,
  p_provider text default null,
  p_model text default null,
  p_answer_excerpt text default null
)
returns public.ai_response_reports
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.ai_response_reports;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(coalesce(p_trace_id,'')),'') is null then raise exception 'AI_TRACE_REQUIRED'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 2 then raise exception 'REPORT_REASON_REQUIRED'; end if;

  insert into public.ai_response_reports(
    reporter_id, trace_id, task, provider, model, reason, details, answer_excerpt
  ) values (
    auth.uid(), left(trim(p_trace_id),200), nullif(left(trim(coalesce(p_task,'')),80),''),
    nullif(left(trim(coalesce(p_provider,'')),80),''), nullif(left(trim(coalesce(p_model,'')),120),''),
    left(trim(p_reason),120), nullif(left(trim(coalesce(p_details,'')),2000),''),
    nullif(left(coalesce(p_answer_excerpt,''),4000),'')
  )
  on conflict (reporter_id, trace_id) do update set
    reason = excluded.reason,
    details = excluded.details,
    answer_excerpt = excluded.answer_excerpt,
    task = excluded.task,
    provider = excluded.provider,
    model = excluded.model,
    status = 'open',
    resolution = null,
    resolved_at = null,
    resolved_by = null
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.admin_list_ai_response_reports(p_status text default 'open')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'PLATFORM_OWNER_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'reporter_id',r.reporter_id,
    'reporter_name',coalesce(nullif(p.display_name,''),nullif(p.username,''),'Kleenest user'),
    'trace_id',r.trace_id,
    'task',r.task,
    'provider',r.provider,
    'model',r.model,
    'reason',r.reason,
    'details',r.details,
    'answer_excerpt',r.answer_excerpt,
    'status',r.status,
    'resolution',r.resolution,
    'created_at',r.created_at,
    'resolved_at',r.resolved_at
  ) order by r.created_at desc),'[]'::jsonb)
  into v_result
  from public.ai_response_reports r
  left join public.profiles p on p.id=r.reporter_id
  where p_status is null or p_status='' or r.status=p_status;
  return v_result;
end;
$$;

create or replace function public.admin_resolve_ai_response_report(
  p_report_id uuid,
  p_status text,
  p_resolution text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.ai_response_reports;
begin
  if not public.is_platform_owner_session() then raise exception 'PLATFORM_OWNER_REQUIRED'; end if;
  if p_status not in ('reviewing','resolved','dismissed') then raise exception 'INVALID_REPORT_STATUS'; end if;
  update public.ai_response_reports
  set status=p_status,
      resolution=nullif(left(trim(coalesce(p_resolution,'')),2000),''),
      resolved_at=case when p_status in ('resolved','dismissed') then now() else null end,
      resolved_by=case when p_status in ('resolved','dismissed') then auth.uid() else null end
  where id=p_report_id
  returning * into v_row;
  if v_row.id is null then raise exception 'AI_REPORT_NOT_FOUND'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.list_my_blocked_users()
returns table(user_id uuid, blocked_at timestamptz, display_name text, username text, avatar_url text)
language sql
stable
security definer
set search_path to ''
as $$
  select p.id,b.created_at,p.display_name,p.username,p.avatar_url
  from public.user_blocks b
  join public.profiles p on p.id=b.blocked_id
  where b.blocker_id=auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.block_user(p_user_id uuid)
returns public.user_blocks
language plpgsql
security definer
set search_path to ''
as $$
declare v_row public.user_blocks;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'Choose another user'; end if;
  insert into public.user_blocks(blocker_id, blocked_id) values (auth.uid(), p_user_id)
  on conflict (blocker_id, blocked_id) do update set created_at = public.user_blocks.created_at
  returning * into v_row;
  delete from public.follows
  where (follower_id=auth.uid() and following_id=p_user_id)
     or (follower_id=p_user_id and following_id=auth.uid());
  return v_row;
end;
$$;

create or replace function public.community_search_contributors(p_query text, p_limit integer default 20)
returns table(user_id uuid, display_name text, username text, avatar_url text, bio text, points integer, level integer, streak integer, total_check_ins integer, total_reviews integer, reputation_score integer, reputation_level text, helpful_received bigint, badge_count bigint)
language plpgsql
security definer
set search_path to ''
as $$
declare v_query text := trim(coalesce(p_query,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if v_query = '' then return; end if;
  return query
  select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.points,p.level,p.streak,p.total_check_ins,p.total_reviews,
         coalesce(round(cr.reputation_score),0)::integer,coalesce(cr.verification_level,'new'),
         (select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
         (select count(*) from public.user_badges ub where ub.user_id=p.id)
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where coalesce(p.is_demo_test,false)=false
    and p.id<>auth.uid()
    and not public.users_have_block_relationship(auth.uid(),p.id)
    and (coalesce(p.display_name,'') ilike '%'||v_query||'%' or coalesce(p.username,'') ilike '%'||v_query||'%')
  order by
    case
      when lower(coalesce(p.username,'')) = lower(v_query) then 0
      when lower(coalesce(p.display_name,'')) = lower(v_query) then 1
      when lower(coalesce(p.username,'')) like lower(v_query)||'%' then 2
      when lower(coalesce(p.display_name,'')) like lower(v_query)||'%' then 3
      else 4
    end,
    p.points desc,
    p.id
  limit least(greatest(coalesce(p_limit,20),1),50);
end;
$$;

create or replace function public.community_relationship_status(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_user uuid:=auth.uid();
  v_following boolean;
  v_follows_you boolean;
  v_blocked_by_me boolean;
  v_blocked_relationship boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_user_id is null then raise exception 'Contributor id is required'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_user_id and coalesce(p.is_demo_test,false)=false) then raise exception 'Contributor not found'; end if;
  if p_user_id=v_user then return jsonb_build_object('is_self',true,'is_following',false,'follows_you',false,'mutual',false,'blocked_by_me',false,'interaction_available',true); end if;
  select exists(select 1 from public.follows f where f.follower_id=v_user and f.following_id=p_user_id),
         exists(select 1 from public.follows f where f.follower_id=p_user_id and f.following_id=v_user),
         exists(select 1 from public.user_blocks b where b.blocker_id=v_user and b.blocked_id=p_user_id),
         public.users_have_block_relationship(v_user,p_user_id)
  into v_following,v_follows_you,v_blocked_by_me,v_blocked_relationship;
  return jsonb_build_object(
    'is_self',false,
    'is_following',case when v_blocked_relationship then false else v_following end,
    'follows_you',case when v_blocked_relationship then false else v_follows_you end,
    'mutual',case when v_blocked_relationship then false else v_following and v_follows_you end,
    'blocked_by_me',v_blocked_by_me,
    'interaction_available',not v_blocked_relationship
  );
end;
$$;

create or replace function public.community_contributor_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id is null then raise exception 'User id is required'; end if;
  if exists(select 1 from public.user_blocks b where b.blocker_id=p_user_id and b.blocked_id=auth.uid()) then
    raise exception 'Contributor unavailable';
  end if;
  select jsonb_build_object(
    'profile', jsonb_build_object('id',p.id,'display_name',p.display_name,'username',p.username,'avatar_url',p.avatar_url,'bio',p.bio,'points',p.points,'level',p.level,'streak',p.streak,'total_check_ins',p.total_check_ins,'total_reviews',p.total_reviews),
    'reputation', case when cr.user_id is null then jsonb_build_object('score',0,'level','new') else jsonb_build_object('score',cr.reputation_score,'level',cr.verification_level,'updated_at',cr.updated_at) end,
    'helpful_received',(select count(*) from public.review_likes rl join public.reviews rr on rr.id=rl.review_id where rr.user_id=p.id and rr.status='published' and rl.user_id<>p.id),
    'verified_review_count',(select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null),
    'badges',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'description',b.description,'icon',b.icon,'earned_at',ub.earned_at) order by ub.earned_at desc),'[]'::jsonb) from public.user_badges ub join public.badges b on b.id=ub.badge_id where ub.user_id=p.id),
    'reviews',(
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id',r.id,'location_id',r.location_id,'check_in_id',r.check_in_id,'stars',r.stars,'cleanliness_pct',r.cleanliness_pct,'comment',r.comment,'created_at',r.created_at,
          'helpful_count',(select count(*) from public.review_likes rl where rl.review_id=r.id),
          'verified_checked_in_at',case when ci.id is not null then ci.checked_in_at end,
          'verified_check_in_method',case when ci.id is not null then ci.verification_method end,
          'verified_distance_meters',case when ci.id is not null then ci.distance_meters end,
          'photo_evidence_count',(select count(*) from public.review_photos rp where rp.review_id=r.id),
          'amenity_evidence_count',(select count(distinct ao.amenity_id) from public.location_amenity_observations ao where ci.id is not null and ao.location_id=r.location_id and ao.user_id=r.user_id and ao.check_in_id=ci.id)
        ) order by r.created_at desc
      ),'[]'::jsonb)
      from (select * from public.reviews where user_id=p.id and status='published' order by created_at desc limit 20) r
      left join public.check_ins ci on ci.id=r.check_in_id and ci.user_id=r.user_id and ci.location_id=r.location_id
    )
  ) into result
  from public.profiles p
  left join public.contributor_reputation cr on cr.user_id=p.id
  where p.id=p_user_id and coalesce(p.is_demo_test,false)=false;
  if result is null then raise exception 'Contributor not found'; end if;
  return result;
end;
$$;

create or replace function public.community_following_members(p_limit integer default 100)
returns table(user_id uuid, followed_at timestamptz, display_name text, username text, avatar_url text, bio text, points integer, level integer, total_check_ins integer, total_reviews integer, reputation_score integer, reputation_level text, helpful_received bigint, verified_review_count bigint)
language sql
stable
security definer
set search_path to ''
as $$
  select p.id, f.created_at, p.display_name, p.username, p.avatar_url, p.bio, p.points, p.level, p.total_check_ins, p.total_reviews,
         coalesce(round(cr.reputation_score),0)::integer, coalesce(cr.verification_level,'new'),
         (select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
         (select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null)
  from public.follows f
  join public.profiles p on p.id=f.following_id
  left join public.contributor_reputation cr on cr.user_id=p.id
  where auth.uid() is not null and f.follower_id=auth.uid() and coalesce(p.is_demo_test,false)=false
    and not public.users_have_block_relationship(auth.uid(),p.id)
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),100);
$$;

create or replace function public.community_follower_members(p_limit integer default 100)
returns table(user_id uuid, followed_at timestamptz, display_name text, username text, avatar_url text, bio text, points integer, level integer, total_check_ins integer, total_reviews integer, reputation_score integer, reputation_level text, helpful_received bigint, verified_review_count bigint)
language sql
stable
security definer
set search_path to ''
as $$
  select p.id, f.created_at, p.display_name, p.username, p.avatar_url, p.bio, p.points, p.level, p.total_check_ins, p.total_reviews,
         coalesce(round(cr.reputation_score),0)::integer, coalesce(cr.verification_level,'new'),
         (select count(*) from public.review_likes rl join public.reviews r on r.id=rl.review_id where r.user_id=p.id and r.status='published' and rl.user_id<>p.id),
         (select count(*) from public.reviews vr where vr.user_id=p.id and vr.status='published' and vr.check_in_id is not null)
  from public.follows f
  join public.profiles p on p.id=f.follower_id
  left join public.contributor_reputation cr on cr.user_id=p.id
  where auth.uid() is not null and f.following_id=auth.uid() and coalesce(p.is_demo_test,false)=false
    and not public.users_have_block_relationship(auth.uid(),p.id)
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),100);
$$;

create or replace function public.community_following_review_activity(p_limit integer default 30)
returns table(review_id uuid, user_id uuid, display_name text, username text, avatar_url text, reputation_level text, location_id uuid, location_name text, stars smallint, cleanliness_pct numeric, comment text, check_in_id uuid, helpful_count bigint, created_at timestamptz, verified_checked_in_at timestamptz, verified_check_in_method text, verified_distance_meters double precision, photo_evidence_count bigint, amenity_evidence_count bigint)
language sql
stable
security definer
set search_path to ''
as $$
  select
    r.id,p.id,p.display_name,p.username,p.avatar_url,coalesce(cr.verification_level,'new'),r.location_id,l.name,r.stars,r.cleanliness_pct,r.comment,r.check_in_id,
    (select count(*) from public.review_likes rl where rl.review_id=r.id),r.created_at,
    case when ci.id is not null then ci.checked_in_at end,
    case when ci.id is not null then ci.verification_method end,
    case when ci.id is not null then ci.distance_meters end,
    (select count(*) from public.review_photos rp where rp.review_id=r.id),
    (select count(distinct ao.amenity_id) from public.location_amenity_observations ao where ci.id is not null and ao.location_id=r.location_id and ao.user_id=r.user_id and ao.check_in_id=ci.id)
  from public.reviews r
  join public.profiles p on p.id=r.user_id
  join public.locations l on l.id=r.location_id
  left join public.contributor_reputation cr on cr.user_id=p.id
  left join public.check_ins ci on ci.id=r.check_in_id and ci.user_id=r.user_id and ci.location_id=r.location_id
  where auth.uid() is not null
    and r.status='published'
    and coalesce(p.is_demo_test,false)=false
    and not public.users_have_block_relationship(auth.uid(),r.user_id)
    and (r.user_id=auth.uid() or exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.following_id=r.user_id))
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit,30),1),100);
$$;

grant execute on function public.current_policy_versions() to authenticated;
grant execute on function public.require_current_policy_acceptance() to authenticated;
grant execute on function public.users_have_block_relationship(uuid,uuid) to authenticated;
grant execute on function public.report_ai_response(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.list_my_blocked_users() to authenticated;
grant execute on function public.admin_list_ai_response_reports(text) to authenticated;
grant execute on function public.admin_resolve_ai_response_report(uuid,text,text) to authenticated;
