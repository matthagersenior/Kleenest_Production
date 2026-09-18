revoke all on function public.get_business_leaderboard(text,integer) from public;
revoke all on function public.get_business_leaderboard(text,integer) from anon;
grant execute on function public.get_business_leaderboard(text,integer) to authenticated;
create or replace function public.get_business_leaderboard(p_metric text default 'check_ins',p_limit integer default 10)
returns table(rank bigint,business_id uuid,business_name text,metric text,value numeric,location_count bigint)
language sql
security definer
set search_path to public,auth,extensions,pg_temp
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
