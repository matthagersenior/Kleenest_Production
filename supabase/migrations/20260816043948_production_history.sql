create or replace function public.business_list_locations(p_business_id uuid)
returns setof public.locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.business_can_manage(p_business_id) then
    raise exception 'Business management access required';
  end if;
  return query
    select l.* from public.locations l
    where l.business_id = p_business_id
    order by l.created_at asc;
end;
$$;

revoke all on function public.business_list_locations(uuid) from public;
grant execute on function public.business_list_locations(uuid) to authenticated;

create or replace function public.business_dashboard_secure_summary(
  p_business_id uuid,
  p_start timestamptz default now() - interval '30 days',
  p_end timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id and bm.user_id = auth.uid()
  ) and not exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid() and pr.is_admin = true
  ) then
    raise exception 'Not authorized for this business';
  end if;

  select coalesce(jsonb_object_agg(a.event_type, a.event_count), '{}'::jsonb)
  into v_summary
  from (
    select ae.event_type::text as event_type, count(*)::bigint as event_count
    from public.analytics_events ae
    where ae.business_id = p_business_id
      and ae.created_at >= p_start
      and ae.created_at < p_end
    group by ae.event_type
  ) a;

  select jsonb_build_object(
    'business', (select to_jsonb(b) from public.businesses b where b.id = p_business_id),
    'locations', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.locations l where l.business_id = p_business_id), '[]'::jsonb),
    'summary', v_summary,
    'reviews', (select count(*) from public.reviews r join public.locations l on l.id = r.location_id where l.business_id = p_business_id and r.created_at >= p_start and r.created_at < p_end),
    'check_ins', (select count(*) from public.check_ins c join public.locations l on l.id = c.location_id where l.business_id = p_business_id and c.checked_in_at >= p_start and c.checked_in_at < p_end),
    'redemptions', (select count(*) from public.promotion_redemptions pr join public.locations l on l.id = pr.location_id where l.business_id = p_business_id and pr.redeemed_at >= p_start and pr.redeemed_at < p_end)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.business_dashboard_secure_summary(uuid,timestamptz,timestamptz) from public;
grant execute on function public.business_dashboard_secure_summary(uuid,timestamptz,timestamptz) to authenticated;
