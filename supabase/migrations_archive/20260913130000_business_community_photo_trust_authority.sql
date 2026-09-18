create table if not exists public.business_photo_disputes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  review_photo_id uuid not null references public.review_photos(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint business_photo_disputes_reason_length check (char_length(reason) between 2 and 80),
  constraint business_photo_disputes_details_length check (details is null or char_length(details) <= 2000)
);

create index if not exists business_photo_disputes_location_created_idx
  on public.business_photo_disputes(location_id,created_at desc);
create index if not exists business_photo_disputes_status_created_idx
  on public.business_photo_disputes(status,created_at desc);
create unique index if not exists business_photo_disputes_open_unique
  on public.business_photo_disputes(business_id,review_photo_id)
  where status in ('open','reviewing');

alter table public.business_photo_disputes enable row level security;
revoke all on table public.business_photo_disputes from public,anon,authenticated;

create policy business_photo_disputes_client_deny
  on public.business_photo_disputes
  for all to anon,authenticated
  using (false)
  with check (false);

create or replace function public.business_list_location_community_photos(
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
  dispute_reason text
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
      when date_part('day', now()-r.created_at) <= 30 then 0
      when date_part('day', now()-r.created_at) <= 90 then 1
      when date_part('day', now()-r.created_at) <= 180 then 2
      else 3
    end as freshness_rank,
    d.status,
    d.reason
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
    and coalesce(p.is_demo_test,false)=false
  order by freshness_rank,reputation_score desc,review_created_at desc,rp.sort_order,rp.id;
end
$$;

revoke all on function public.business_list_location_community_photos(uuid,uuid) from public,anon;
grant execute on function public.business_list_location_community_photos(uuid,uuid) to authenticated,service_role;

create or replace function public.business_dispute_review_photo(
  p_business_id uuid,
  p_review_photo_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_location_id uuid;
  v_review_id uuid;
  v_reason text:=left(trim(coalesce(p_reason,'')),80);
  v_details text:=nullif(left(trim(coalesce(p_details,'')),2000),'');
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if char_length(v_reason)<2 then raise exception 'Choose a dispute reason'; end if;

  select r.location_id,r.id
  into v_location_id,v_review_id
  from public.review_photos rp
  join public.reviews r on r.id=rp.review_id
  where rp.id=p_review_photo_id
    and r.status='published';

  if v_location_id is null then raise exception 'Community photo not found'; end if;
  if not public.business_manages_location(p_business_id,v_location_id) then
    raise exception 'Business management access required for location';
  end if;

  select d.id into v_id
  from public.business_photo_disputes d
  where d.business_id=p_business_id
    and d.review_photo_id=p_review_photo_id
    and d.status in ('open','reviewing')
  order by d.created_at desc
  limit 1
  for update;

  if v_id is null then
    insert into public.business_photo_disputes(
      business_id,location_id,review_photo_id,review_id,reporter_user_id,reason,details,status
    )
    values(
      p_business_id,v_location_id,p_review_photo_id,v_review_id,v_uid,v_reason,v_details,'open'
    )
    returning id into v_id;
  else
    update public.business_photo_disputes
    set reason=v_reason,
        details=v_details,
        reporter_user_id=v_uid,
        updated_at=now()
    where id=v_id;
  end if;

  return jsonb_build_object(
    'dispute_id',v_id,
    'business_id',p_business_id,
    'location_id',v_location_id,
    'review_photo_id',p_review_photo_id,
    'review_id',v_review_id,
    'status','open',
    'reason',v_reason,
    'submitted_at',now()
  );
end
$$;

revoke all on function public.business_dispute_review_photo(uuid,uuid,text,text) from public,anon;
grant execute on function public.business_dispute_review_photo(uuid,uuid,text,text) to authenticated,service_role;

drop function if exists public.business_set_location_consumer_photo(uuid,uuid,uuid);

drop function if exists public.mobile_location_presentation_v1(uuid[]);

create function public.mobile_location_presentation_v1(p_location_ids uuid[])
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
      rp.id as review_photo_id,
      rp.storage_path,
      coalesce(cr.reputation_score,0) as reputation_score,
      r.created_at as review_created_at,
      case
        when date_part('day', now()-r.created_at) <= 30 then 0
        when date_part('day', now()-r.created_at) <= 90 then 1
        when date_part('day', now()-r.created_at) <= 180 then 2
        else 3
      end as freshness_rank
    from public.reviews r
    join public.review_photos rp on rp.review_id=r.id
    join public.profiles p on p.id=r.user_id
    left join public.contributor_reputation cr on cr.user_id=r.user_id
    where r.location_id=l.id
      and r.status='published'
      and coalesce(p.is_demo_test,false)=false
    order by freshness_rank,reputation_score desc,review_created_at desc,rp.sort_order,rp.id
    limit 1
  ) ph on true
  where l.id=any(coalesce(p_location_ids,'{}'::uuid[]))
    and l.is_active=true;
end
$$;

revoke all on function public.mobile_location_presentation_v1(uuid[]) from public;
grant execute on function public.mobile_location_presentation_v1(uuid[]) to anon,authenticated,service_role;
comment on function public.mobile_location_presentation_v1(uuid[]) is
  'KLEENEST_REVIEWED_PUBLIC_SECURITY_DEFINER: public trust-ranked community review-photo projection; Business disputes remain moderation metadata and do not suppress evidence automatically.';
