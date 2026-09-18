-- Unified review-photo trust moderation + Fleet operator convergence.
-- Adds user/business photo voting and reporting, immediate KleenestOS owner queueing,
-- moderation visibility, and canonical Fleet operator authority for Fleet-enabled businesses.

alter table public.review_photos
  add column if not exists moderation_status text not null default 'visible';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.review_photos'::regclass
      and conname='review_photos_moderation_status_check'
  ) then
    alter table public.review_photos
      add constraint review_photos_moderation_status_check
      check (moderation_status in ('visible','hidden'));
  end if;
end
$$;

create table if not exists public.review_photo_votes (
  id uuid primary key default gen_random_uuid(),
  review_photo_id uuid not null references public.review_photos(id) on delete cascade,
  voter_user_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  vote text not null check (vote in ('helpful','not_helpful')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(review_photo_id,voter_user_id)
);

create index if not exists review_photo_votes_photo_idx
  on public.review_photo_votes(review_photo_id,vote);

alter table public.review_photo_votes enable row level security;
revoke all on table public.review_photo_votes from public,anon,authenticated;

drop policy if exists review_photo_votes_client_deny on public.review_photo_votes;
create policy review_photo_votes_client_deny
  on public.review_photo_votes
  for all to anon,authenticated
  using (false)
  with check (false);

create table if not exists public.review_photo_reports (
  id uuid primary key default gen_random_uuid(),
  review_photo_id uuid not null references public.review_photos(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reporter_business_id uuid references public.businesses(id) on delete cascade,
  reason text not null check (reason in ('privacy','explicit','relevance','other')),
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolution text check (resolution is null or resolution in ('hide','restore','no_action')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_photo_reports_details_length check (details is null or char_length(details)<=2000)
);

create index if not exists review_photo_reports_queue_idx
  on public.review_photo_reports(status,created_at);
create index if not exists review_photo_reports_photo_idx
  on public.review_photo_reports(review_photo_id,created_at desc);
create unique index if not exists review_photo_reports_open_reporter_unique
  on public.review_photo_reports(review_photo_id,reporter_user_id)
  where status in ('open','reviewing');

alter table public.review_photo_reports enable row level security;
revoke all on table public.review_photo_reports from public,anon,authenticated;

drop policy if exists review_photo_reports_client_deny on public.review_photo_reports;
create policy review_photo_reports_client_deny
  on public.review_photo_reports
  for all to anon,authenticated
  using (false)
  with check (false);

create or replace function public.review_photo_business_scope_allowed(
  p_business_id uuid,
  p_review_photo_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select p_business_id is null
    or exists (
      select 1
      from public.review_photos rp
      join public.reviews r on r.id=rp.review_id
      where rp.id=p_review_photo_id
        and public.business_manages_location(p_business_id,r.location_id)
    );
$$;

revoke all on function public.review_photo_business_scope_allowed(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.review_photo_business_scope_allowed(uuid,uuid)
  to service_role;

create or replace function public.queue_review_photo_report(
  p_review_photo_id uuid,
  p_reporter_user_id uuid,
  p_reason text,
  p_details text default null,
  p_business_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text:=lower(trim(coalesce(p_reason,'')));
  v_details text:=nullif(left(trim(coalesce(p_details,'')),2000),'');
  v_report_id uuid;
  v_location_id uuid;
  v_notification_id uuid;
begin
  if p_reporter_user_id is null then raise exception 'REPORTER_REQUIRED'; end if;
  if v_reason not in ('privacy','explicit','relevance','other') then
    raise exception 'PHOTO_REPORT_REASON_INVALID';
  end if;

  select r.location_id
  into v_location_id
  from public.review_photos rp
  join public.reviews r on r.id=rp.review_id
  where rp.id=p_review_photo_id;

  if v_location_id is null then raise exception 'REVIEW_PHOTO_NOT_FOUND'; end if;
  if not public.review_photo_business_scope_allowed(p_business_id,p_review_photo_id) then
    raise exception 'BUSINESS_PHOTO_SCOPE_REQUIRED';
  end if;

  select rr.id
  into v_report_id
  from public.review_photo_reports rr
  where rr.review_photo_id=p_review_photo_id
    and rr.reporter_user_id=p_reporter_user_id
    and rr.status in ('open','reviewing')
  order by rr.created_at desc
  limit 1
  for update;

  if v_report_id is null then
    insert into public.review_photo_reports(
      review_photo_id,reporter_user_id,reporter_business_id,reason,details,status
    )
    values(
      p_review_photo_id,p_reporter_user_id,p_business_id,v_reason,v_details,'open'
    )
    returning id into v_report_id;
  else
    update public.review_photo_reports
    set reporter_business_id=coalesce(p_business_id,reporter_business_id),
        reason=v_reason,
        details=v_details,
        status='open',
        resolution=null,
        reviewed_by=null,
        reviewed_at=null,
        updated_at=now()
    where id=v_report_id;
  end if;

  insert into public.notification_events(
    event_type,actor_user_id,location_id,audience_scope,payload,dedupe_key
  )
  values(
    'review_photo_reported',
    p_reporter_user_id,
    v_location_id,
    'platform_owner',
    jsonb_build_object(
      'title','Photo requires immediate review',
      'body','A community trust photo was flagged for '||v_reason||'.',
      'report_id',v_report_id,
      'review_photo_id',p_review_photo_id,
      'business_id',p_business_id,
      'reason',v_reason,
      'route','/moderation'
    ),
    'review-photo-report:'||v_report_id::text
  )
  on conflict(dedupe_key) where dedupe_key is not null
  do update set
    payload=excluded.payload,
    created_at=now()
  returning id into v_notification_id;

  insert into public.notification_deliveries(notification_id,recipient_user_id,channel)
  select v_notification_id,p.id,c.channel
  from public.profiles p
  cross join (values('in_app'::text),('push'::text)) c(channel)
  where coalesce(p.is_platform_owner,false)=true
  on conflict(notification_id,recipient_user_id,channel) do nothing;

  return v_report_id;
end;
$$;

revoke all on function public.queue_review_photo_report(uuid,uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.queue_review_photo_report(uuid,uuid,text,text,uuid)
  to service_role;

create or replace function public.report_review_photo(
  p_review_photo_id uuid,
  p_reason text,
  p_details text default null,
  p_business_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_report_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_report_id:=public.queue_review_photo_report(
    p_review_photo_id,v_uid,p_reason,p_details,p_business_id
  );
  return (
    select jsonb_build_object(
      'report_id',r.id,
      'review_photo_id',r.review_photo_id,
      'reason',r.reason,
      'status',r.status,
      'created_at',r.created_at
    )
    from public.review_photo_reports r
    where r.id=v_report_id
  );
end;
$$;

revoke all on function public.report_review_photo(uuid,text,text,uuid)
  from public,anon;
grant execute on function public.report_review_photo(uuid,text,text,uuid)
  to authenticated,service_role;

create or replace function public.vote_review_photo(
  p_review_photo_id uuid,
  p_vote text,
  p_business_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_vote text:=lower(trim(coalesce(p_vote,'')));
  v_helpful integer;
  v_not_helpful integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_vote not in ('helpful','not_helpful') then raise exception 'PHOTO_VOTE_INVALID'; end if;
  if not exists(
    select 1
    from public.review_photos rp
    join public.reviews r on r.id=rp.review_id
    where rp.id=p_review_photo_id
      and r.status='published'
      and rp.moderation_status='visible'
  ) then raise exception 'REVIEW_PHOTO_NOT_AVAILABLE'; end if;
  if not public.review_photo_business_scope_allowed(p_business_id,p_review_photo_id) then
    raise exception 'BUSINESS_PHOTO_SCOPE_REQUIRED';
  end if;

  insert into public.review_photo_votes(review_photo_id,voter_user_id,business_id,vote)
  values(p_review_photo_id,v_uid,p_business_id,v_vote)
  on conflict(review_photo_id,voter_user_id)
  do update set
    business_id=excluded.business_id,
    vote=excluded.vote,
    updated_at=now();

  select
    count(*) filter(where vote='helpful')::integer,
    count(*) filter(where vote='not_helpful')::integer
  into v_helpful,v_not_helpful
  from public.review_photo_votes
  where review_photo_id=p_review_photo_id;

  return jsonb_build_object(
    'review_photo_id',p_review_photo_id,
    'vote',v_vote,
    'helpful_votes',coalesce(v_helpful,0),
    'not_helpful_votes',coalesce(v_not_helpful,0)
  );
end;
$$;

revoke all on function public.vote_review_photo(uuid,text,uuid)
  from public,anon;
grant execute on function public.vote_review_photo(uuid,text,uuid)
  to authenticated,service_role;

create or replace function public.admin_list_review_photo_reports(
  p_status text default 'open'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not (
    public.is_platform_owner_session()
    or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  return coalesce((
    select jsonb_agg(to_jsonb(x) order by
      case x.reason when 'privacy' then 0 when 'explicit' then 1 when 'relevance' then 2 else 3 end,
      x.created_at asc
    )
    from (
      select
        rr.id,
        rr.review_photo_id,
        rr.reporter_user_id,
        rr.reporter_business_id,
        rr.reason,
        rr.details,
        rr.status,
        rr.resolution,
        rr.created_at,
        rr.updated_at,
        rr.reviewed_by,
        rr.reviewed_at,
        rp.storage_path,
        rp.mime_type,
        rp.moderation_status,
        r.id as review_id,
        r.location_id,
        r.user_id as photo_author_user_id,
        l.name as location_name,
        b.name as reporter_business_name,
        reporter.display_name as reporter_display_name,
        (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rr.review_photo_id and v.vote='helpful') helpful_votes,
        (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rr.review_photo_id and v.vote='not_helpful') not_helpful_votes
      from public.review_photo_reports rr
      join public.review_photos rp on rp.id=rr.review_photo_id
      join public.reviews r on r.id=rp.review_id
      join public.locations l on l.id=r.location_id
      left join public.businesses b on b.id=rr.reporter_business_id
      left join public.profiles reporter on reporter.id=rr.reporter_user_id
      where p_status is null or p_status='' or rr.status=p_status
    ) x
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_review_photo_reports(text)
  from public,anon;
grant execute on function public.admin_list_review_photo_reports(text)
  to authenticated,service_role;

create or replace function public.admin_resolve_review_photo_report(
  p_report_id uuid,
  p_status text,
  p_resolution text default 'no_action',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_status text:=lower(trim(coalesce(p_status,'')));
  v_resolution text:=lower(trim(coalesce(p_resolution,'no_action')));
  v_report public.review_photo_reports;
begin
  if v_uid is null or not (
    public.is_platform_owner_session()
    or exists(select 1 from public.profiles p where p.id=v_uid and p.is_admin=true)
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if v_status not in ('reviewing','resolved','dismissed') then
    raise exception 'PHOTO_REPORT_STATUS_INVALID';
  end if;
  if v_resolution not in ('hide','restore','no_action') then
    raise exception 'PHOTO_REPORT_RESOLUTION_INVALID';
  end if;

  select * into v_report
  from public.review_photo_reports
  where id=p_report_id
  for update;
  if v_report.id is null then raise exception 'PHOTO_REPORT_NOT_FOUND'; end if;

  if v_resolution='hide' then
    update public.review_photos
    set moderation_status='hidden'
    where id=v_report.review_photo_id;
  elsif v_resolution='restore' then
    update public.review_photos
    set moderation_status='visible'
    where id=v_report.review_photo_id;
  end if;

  update public.review_photo_reports
  set status=v_status,
      resolution=v_resolution,
      reviewed_by=v_uid,
      reviewed_at=now(),
      details=case
        when nullif(trim(coalesce(p_notes,'')),'') is null then details
        else concat_ws(E'\n',details,'Owner moderation: '||left(trim(p_notes),1000))
      end,
      updated_at=now()
  where id=p_report_id
  returning * into v_report;

  if v_status='resolved' and v_resolution in ('hide','restore') then
    update public.review_photo_reports
    set status='resolved',
        resolution=v_resolution,
        reviewed_by=v_uid,
        reviewed_at=now(),
        updated_at=now()
    where review_photo_id=v_report.review_photo_id
      and id<>v_report.id
      and status in ('open','reviewing');
  end if;

  return jsonb_build_object(
    'report',to_jsonb(v_report),
    'review_photo_id',v_report.review_photo_id,
    'moderation_status',(select moderation_status from public.review_photos where id=v_report.review_photo_id)
  );
end;
$$;

revoke all on function public.admin_resolve_review_photo_report(uuid,text,text,text)
  from public,anon;
grant execute on function public.admin_resolve_review_photo_report(uuid,text,text,text)
  to authenticated,service_role;

create or replace function public.business_photo_dispute_owner_queue()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text;
begin
  v_reason:=case
    when lower(new.reason) like '%privacy%' then 'privacy'
    when lower(new.reason) like '%inappropriate%' or lower(new.reason) like '%explicit%' then 'explicit'
    when lower(new.reason) in ('wrong location','outdated','misleading') then 'relevance'
    else 'other'
  end;

  perform public.queue_review_photo_report(
    new.review_photo_id,
    new.reporter_user_id,
    v_reason,
    concat_ws(E'\n',new.reason,new.details),
    new.business_id
  );
  return new;
end;
$$;

revoke all on function public.business_photo_dispute_owner_queue()
  from public,anon,authenticated;
grant execute on function public.business_photo_dispute_owner_queue()
  to service_role;

drop trigger if exists business_photo_dispute_owner_queue
  on public.business_photo_disputes;
create trigger business_photo_dispute_owner_queue
after insert or update of reason,details,status
on public.business_photo_disputes
for each row
when (new.status in ('open','reviewing'))
execute function public.business_photo_dispute_owner_queue();

drop function if exists public.mobile_review_photos_for_reviews(uuid[]);
create function public.mobile_review_photos_for_reviews(p_review_ids uuid[])
returns table(
  review_photo_id uuid,
  review_id uuid,
  storage_path text,
  mime_type text,
  width integer,
  height integer,
  sort_order integer,
  helpful_votes integer,
  not_helpful_votes integer
)
language sql
stable
security definer
set search_path=''
as $$
  select
    rp.id,
    rp.review_id,
    rp.storage_path,
    rp.mime_type,
    rp.width,
    rp.height,
    rp.sort_order,
    (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rp.id and v.vote='helpful'),
    (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rp.id and v.vote='not_helpful')
  from public.review_photos rp
  join public.reviews r on r.id=rp.review_id
  where r.status='published'
    and rp.moderation_status='visible'
    and rp.review_id=any(coalesce(p_review_ids,'{}'::uuid[]))
  order by rp.review_id,rp.sort_order,rp.created_at;
$$;

revoke all on function public.mobile_review_photos_for_reviews(uuid[]) from public;
grant execute on function public.mobile_review_photos_for_reviews(uuid[])
  to anon,authenticated,service_role;

drop function if exists public.business_list_location_community_photos(uuid,uuid);
create function public.business_list_location_community_photos(
  p_business_id uuid,
  p_location_id uuid
)
returns table(
  review_photo_id uuid,
  review_id uuid,
  location_id uuid,
  storage_path text,
  mime_type text,
  user_id uuid,
  display_name text,
  username text,
  reputation_score numeric,
  verification_level text,
  review_created_at timestamptz,
  verified_visit boolean,
  freshness_rank integer,
  dispute_status text,
  dispute_reason text,
  helpful_votes integer,
  not_helpful_votes integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_manages_location(p_business_id,p_location_id) then
    raise exception 'Business management access required for location';
  end if;

  return query
  select
    rp.id,
    r.id,
    r.location_id,
    rp.storage_path,
    rp.mime_type,
    r.user_id,
    p.display_name,
    p.username,
    coalesce(cr.reputation_score,0),
    coalesce(cr.verification_level,'new'),
    r.created_at,
    r.check_in_id is not null,
    case
      when date_part('day',now()-r.created_at)<=30 then 0
      when date_part('day',now()-r.created_at)<=90 then 1
      when date_part('day',now()-r.created_at)<=180 then 2
      else 3
    end,
    d.status,
    d.reason,
    (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rp.id and v.vote='helpful'),
    (select count(*)::integer from public.review_photo_votes v where v.review_photo_id=rp.id and v.vote='not_helpful')
  from public.reviews r
  join public.review_photos rp on rp.review_id=r.id
  join public.profiles p on p.id=r.user_id
  left join public.contributor_reputation cr on cr.user_id=r.user_id
  left join lateral (
    select bd.status,bd.reason
    from public.business_photo_disputes bd
    where bd.business_id=p_business_id
      and bd.review_photo_id=rp.id
    order by bd.created_at desc
    limit 1
  ) d on true
  where r.location_id=p_location_id
    and r.status='published'
    and rp.moderation_status='visible'
    and coalesce(p.is_demo_test,false)=false
  order by 13,9 desc,11 desc,rp.sort_order,rp.id;
end;
$$;

revoke all on function public.business_list_location_community_photos(uuid,uuid)
  from public,anon;
grant execute on function public.business_list_location_community_photos(uuid,uuid)
  to authenticated,service_role;

create or replace function public.mobile_location_presentation_v1(p_location_ids uuid[])
returns table(
  location_id uuid,
  consumer_photo_id uuid,
  consumer_photo_storage_path text,
  consumer_photo_caption text,
  consumer_photo_bucket text,
  consumer_photo_source text,
  consumer_photo_is_featured boolean,
  consumer_photo_created_at timestamptz,
  consumer_photo_trust_score numeric,
  consumer_photo_freshness_rank integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if cardinality(coalesce(p_location_ids,'{}'::uuid[]))>200 then
    raise exception 'Too many locations requested';
  end if;

  return query
  select
    l.id,
    ph.review_photo_id,
    ph.storage_path,
    null::text,
    'review-photos'::text,
    'community'::text,
    false,
    ph.review_created_at,
    ph.reputation_score,
    ph.freshness_rank
  from public.locations l
  left join lateral (
    select
      rp.id review_photo_id,
      rp.storage_path,
      coalesce(cr.reputation_score,0) reputation_score,
      r.created_at review_created_at,
      case
        when date_part('day',now()-r.created_at)<=30 then 0
        when date_part('day',now()-r.created_at)<=90 then 1
        when date_part('day',now()-r.created_at)<=180 then 2
        else 3
      end freshness_rank
    from public.reviews r
    join public.review_photos rp on rp.review_id=r.id
    join public.profiles p on p.id=r.user_id
    left join public.contributor_reputation cr on cr.user_id=r.user_id
    where r.location_id=l.id
      and r.status='published'
      and rp.moderation_status='visible'
      and coalesce(p.is_demo_test,false)=false
    order by freshness_rank,reputation_score desc,review_created_at desc,rp.sort_order,rp.id
    limit 1
  ) ph on true
  where l.id=any(coalesce(p_location_ids,'{}'::uuid[]))
    and l.is_active=true;
end;
$$;

revoke all on function public.mobile_location_presentation_v1(uuid[]) from public;
grant execute on function public.mobile_location_presentation_v1(uuid[])
  to anon,authenticated,service_role;

create or replace function public.fleet_actor_is_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','auth','extensions','pg_catalog'
as $$
  select public.business_admin_guard(p_business_id)
    or exists (
      select 1
      from public.business_members bm
      where bm.business_id=p_business_id
        and bm.user_id=auth.uid()
        and lower(bm.role::text) in (
          'manager','dispatcher',
          'fleet_owner','fleet_manager','fleet_dispatcher',
          'enterprise_owner','enterprise_admin','enterprise_manager'
        )
    );
$$;

revoke all on function public.fleet_actor_is_manager(uuid)
  from public,anon;
grant execute on function public.fleet_actor_is_manager(uuid)
  to authenticated,service_role;

comment on function public.report_review_photo(uuid,text,text,uuid) is
  'Authenticated user/business review-photo flag endpoint. Privacy, explicit, relevance and other reports are queued immediately to KleenestOS platform-owner moderation.';
comment on function public.vote_review_photo(uuid,text,uuid) is
  'Authenticated user/business trust vote for community review photos.';
comment on function public.admin_list_review_photo_reports(text) is
  'KleenestOS owner/admin photo moderation queue ordered for immediate trust-and-safety review.';
comment on function public.fleet_actor_is_manager(uuid) is
  'Canonical Fleet operator authority: Business owner/admin authority plus explicit manager/dispatcher roles on a Fleet-enabled Business.';
