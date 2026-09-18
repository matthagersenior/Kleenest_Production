create or replace function public.reporting_schedule_init()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $$
begin
  if new.owner_id is null then
    new.owner_id := auth.uid();
  end if;
  if new.owner_id is null then
    raise exception 'Authenticated owner is required';
  end if;
  if new.next_run_at is null then
    new.next_run_at := public.reporting_next_run(new.cadence,new.hour_local,new.timezone,new.day_of_week,new.day_of_month,now());
  end if;
  return new;
end;
$$;

create or replace function public.get_business_engagement_funnel(p_business_id uuid, p_start timestamptz default (now()-interval '30 days'), p_end timestamptz default now())
returns table(activity_type text, source text, events bigint, unique_users bigint)
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  return query
  select bea.activity_type, bea.source, count(*)::bigint, count(distinct bea.user_id)::bigint
  from public.business_engagement_attributions bea
  where bea.business_id=p_business_id and bea.created_at between p_start and p_end
  group by bea.activity_type, bea.source
  order by count(*) desc;
end;
$$;

create or replace function public.business_engagement_analytics(p_business_id uuid, p_start timestamptz default (now()-interval '30 days'), p_end timestamptz default now())
returns jsonb
language sql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select jsonb_build_object(
    'attributions',count(*),
    'unique_users',count(distinct bea.user_id),
    'by_activity',coalesce((
      select jsonb_agg(jsonb_build_object('activity_type',f.activity_type,'source',f.source,'events',f.events,'unique_users',f.unique_users) order by f.events desc)
      from public.get_business_engagement_funnel(p_business_id,p_start,p_end) f
    ),'[]'::jsonb)
  )
  from public.business_engagement_attributions bea
  where bea.business_id=p_business_id and bea.created_at between p_start and p_end;
$$;
