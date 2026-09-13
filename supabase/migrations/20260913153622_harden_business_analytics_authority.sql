
create or replace function public.business_engagement_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.business_can_manage(p_business_id)
     and public.business_advanced_allowed(p_business_id);
$$;

create or replace function public.business_amenity_feedback_analytics(
  p_business_id uuid,
  p_location_id uuid default null,
  p_start timestamptz default now()-interval '30 days',
  p_end timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.business_analytics_authorized(p_business_id) then
    raise exception 'Business analytics access required' using errcode='42501';
  end if;

  return (
    select coalesce(jsonb_agg(x order by x.category,x.amenity),'[]'::jsonb)
    from (
      select
        a.id amenity_id,
        a.name amenity,
        a.category,
        coalesce(sum((f.sentiment='good')::int),0) good_count,
        coalesce(sum((f.sentiment='needs_attention')::int),0) needs_attention_count,
        count(f.id) total_feedback
      from public.amenities a
      left join public.review_amenity_feedback f
        on f.amenity_id=a.id
       and f.created_at between p_start and p_end
      left join public.locations l
        on l.id=f.location_id
       and l.business_id=p_business_id
       and (p_location_id is null or l.id=p_location_id)
      where exists(
        select 1
        from public.location_amenities la
        join public.locations l2 on l2.id=la.location_id
        where la.amenity_id=a.id
          and l2.business_id=p_business_id
          and (p_location_id is null or l2.id=p_location_id)
          and (f.location_id is null or f.location_id=l2.id)
      )
      group by a.id,a.name,a.category
    ) x
  );
end;
$$;

create or replace function public.get_business_engagement_funnel(
  p_business_id uuid,
  p_start timestamptz default now()-interval '30 days',
  p_end timestamptz default now()
)
returns table(activity_type text, source text, events bigint, unique_users bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.business_engagement_authorized(p_business_id) then
    raise exception 'Business Growth, Fleet, or Enterprise engagement access required' using errcode='42501';
  end if;

  return query
  select bea.activity_type, bea.source, count(*)::bigint, count(distinct bea.user_id)::bigint
  from public.business_engagement_attributions bea
  where bea.business_id=p_business_id
    and bea.created_at between p_start and p_end
  group by bea.activity_type, bea.source
  order by count(*) desc;
end;
$$;

create or replace function public.business_engagement_analytics(
  p_business_id uuid,
  p_start timestamptz default now()-interval '30 days',
  p_end timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.business_engagement_authorized(p_business_id) then
    raise exception 'Business Growth, Fleet, or Enterprise engagement access required' using errcode='42501';
  end if;

  return (
    select jsonb_build_object(
      'attributions',count(*),
      'unique_users',count(distinct bea.user_id),
      'by_activity',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'activity_type',f.activity_type,
            'source',f.source,
            'events',f.events,
            'unique_users',f.unique_users
          )
          order by f.events desc
        )
        from public.get_business_engagement_funnel(p_business_id,p_start,p_end) f
      ),'[]'::jsonb)
    )
    from public.business_engagement_attributions bea
    where bea.business_id=p_business_id
      and bea.created_at between p_start and p_end
  );
end;
$$;

revoke all on function public.business_engagement_authorized(uuid) from public, anon;
grant execute on function public.business_engagement_authorized(uuid) to authenticated, service_role;

revoke all on function public.business_amenity_feedback_analytics(uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.business_amenity_feedback_analytics(uuid,uuid,timestamptz,timestamptz) to authenticated, service_role;

revoke all on function public.get_business_engagement_funnel(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_business_engagement_funnel(uuid,timestamptz,timestamptz) to authenticated, service_role;

revoke all on function public.business_engagement_analytics(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.business_engagement_analytics(uuid,timestamptz,timestamptz) to authenticated, service_role;
