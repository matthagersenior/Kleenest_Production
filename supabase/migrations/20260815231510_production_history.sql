create table if not exists public.business_metric_leaderboards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  metric text not null,
  period_start date not null,
  period_end date not null,
  rank integer not null,
  value numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, metric, period_start, period_end)
);
create index if not exists idx_business_metric_leaderboards_metric_period on public.business_metric_leaderboards(metric, period_start, period_end, rank);

create or replace function public.get_user_leaderboard(p_limit integer default 20)
returns table(rank bigint, user_id uuid, display_name text, username text, points bigint, level integer, streak integer)
language sql security definer set search_path = public
as $$
  select row_number() over(order by p.points desc, p.level desc, p.streak desc, p.id), p.id, coalesce(p.display_name,p.username,'Kleenest user'), p.username, p.points::bigint, p.level, p.streak
  from public.profiles p
  where coalesce(p.is_demo_test,false)=false
  order by p.points desc, p.level desc, p.streak desc, p.id
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;

create or replace function public.get_business_leaderboard(p_metric text default 'check_ins', p_limit integer default 10)
returns table(rank bigint, business_id uuid, business_name text, metric text, value numeric, location_count bigint)
language sql security definer set search_path = public
as $$
  with base as (
    select b.id business_id,b.name business_name,count(distinct l.id) location_count,
      case when p_metric='check_ins' then count(distinct ci.id)::numeric
           when p_metric='reviews' then count(distinct r.id)::numeric
           when p_metric='qr_scans' then count(distinct case when ae.event_type='qr_scan' then ae.id end)::numeric
           when p_metric='favorites' then count(distinct f.user_id)::numeric
           when p_metric='rating' then coalesce(avg(r.stars),0)::numeric
           else count(distinct ci.id)::numeric end value
    from public.businesses b
    left join public.locations l on l.business_id=b.id and coalesce(l.is_active,true)
    left join public.check_ins ci on ci.location_id=l.id
    left join public.reviews r on r.location_id=l.id and r.status='published'
    left join public.analytics_events ae on ae.location_id=l.id
    left join public.favorites f on f.location_id=l.id
    where coalesce(b.is_demo_test,false)=false
    group by b.id,b.name
  )
  select row_number() over(order by value desc,business_name),business_id,business_name,p_metric,value,location_count
  from base order by value desc,business_name limit greatest(1,least(coalesce(p_limit,10),100));
$$;

grant execute on function public.get_user_leaderboard(integer) to authenticated, anon;
grant execute on function public.get_business_leaderboard(text,integer) to authenticated, anon;

create or replace function public.get_business_metric_detail(p_business_id uuid,p_location_id uuid,p_metric text)
returns jsonb
language sql security definer set search_path = public
as $$
  select jsonb_build_object(
    'metric',p_metric,
    'business_id',p_business_id,
    'location_id',p_location_id,
    'check_ins', (select count(*) from public.check_ins c join public.locations l on l.id=c.location_id where l.business_id=p_business_id and (p_location_id is null or l.id=p_location_id)),
    'reviews', (select count(*) from public.reviews r join public.locations l on l.id=r.location_id where l.business_id=p_business_id and r.status='published' and (p_location_id is null or l.id=p_location_id)),
    'qr_scans', (select count(*) from public.analytics_events a join public.locations l on l.id=a.location_id where l.business_id=p_business_id and a.event_type='qr_scan' and (p_location_id is null or l.id=p_location_id)),
    'favorites', (select count(*) from public.favorites f join public.locations l on l.id=f.location_id where l.business_id=p_business_id and (p_location_id is null or l.id=p_location_id)),
    'rating', (select coalesce(round(avg(r.stars)::numeric,2),0) from public.reviews r join public.locations l on l.id=r.location_id where l.business_id=p_business_id and r.status='published' and (p_location_id is null or l.id=p_location_id))
  );
$$;
grant execute on function public.get_business_metric_detail(uuid,uuid,text) to authenticated, anon;
