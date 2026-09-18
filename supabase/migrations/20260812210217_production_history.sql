-- Nearby/search are public discovery APIs; keep them read-only and cap inputs.
revoke execute on function public.current_user_id() from anon;
grant execute on function public.current_user_id() to authenticated;

-- Dashboard summaries must verify business membership inside the function before returning business analytics.
create or replace function public.business_dashboard_summary(
  p_business_id uuid,
  p_start timestamptz default now() - interval '30 days',
  p_end timestamptz default now()
)
returns table(event_type public.analytics_event_type, event_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select ae.event_type, count(*)
  from public.analytics_events ae
  where ae.business_id = p_business_id
    and ae.created_at >= p_start
    and ae.created_at < p_end
    and exists (
      select 1 from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = (select auth.uid())
        and bm.role = any (array['owner'::public.business_member_role,'admin'::public.business_member_role,'manager'::public.business_member_role])
    )
  group by ae.event_type
  order by ae.event_type;
$$;

-- Explicitly expose only intended read-only discovery RPCs.
grant execute on function public.nearby_locations(double precision,double precision,integer,integer) to anon, authenticated;
grant execute on function public.search_locations(text,integer) to anon, authenticated;
grant execute on function public.verify_checkin(text,double precision,double precision) to authenticated;
revoke execute on function public.verify_checkin(text,double precision,double precision) from anon;

-- Ensure the dashboard RPC is not available anonymously.
revoke execute on function public.business_dashboard_summary(uuid,timestamptz,timestamptz) from anon;
grant execute on function public.business_dashboard_summary(uuid,timestamptz,timestamptz) to authenticated;
