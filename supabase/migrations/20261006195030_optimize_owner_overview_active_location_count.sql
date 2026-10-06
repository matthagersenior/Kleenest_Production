create or replace function public.admin_get_overview()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions', 'pg_catalog'
as $function$
declare
  v jsonb;
  v_locations bigint;
  v_active_locations bigint;
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid()
      and (
        is_platform_owner=true
        or is_admin=true
        or lower(coalesce(role::text,'')) in ('admin','platform_admin')
      )
  ) then
    raise exception 'admin access required';
  end if;

  select greatest(0,coalesce(n_live_tup,0))::bigint
    into v_locations
  from pg_stat_user_tables
  where schemaname='public' and relname='locations';

  -- Exact COUNT(*) over the large locations table was timing out during
  -- KleenestOS startup. The partial index contains only active rows, so its
  -- planner statistics give a constant-time estimate suitable for dashboard
  -- telemetry without scanning the canonical locations relation.
  select greatest(0,coalesce(c.reltuples,0))::bigint
    into v_active_locations
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname='locations_verification_priority_idx';

  if v_active_locations is null then
    v_active_locations := coalesce(v_locations,0);
  end if;

  select jsonb_build_object(
    'users',(select count(*) from profiles),
    'businesses',(select count(*) from businesses),
    'locations',coalesce(v_locations,0),
    'active_locations',coalesce(v_active_locations,0),
    'checkins',(select count(*) from check_ins),
    'reviews',(select count(*) from reviews),
    'favorites',(select count(*) from favorites),
    'reports',(select count(*) from reports),
    'pending_reports',(select count(*) from reports where status::text in ('pending','reviewing')),
    'events',(select count(*) from business_events),
    'campaigns',(select count(*) from business_campaigns)+(select count(*) from enterprise_partner_campaigns),
    'promotions',(select count(*) from promotions),
    'contests',(select count(*) from contests),
    'contest_entries',(select count(*) from contest_entries),
    'qr_codes',(select count(*) from qr_codes),
    'qr_scans',(select count(*) from analytics_events where event_type='qr_scan'),
    'social_posts',(select count(*) from social_posts),
    'social_reports',(select count(*) from social_post_reports where status in ('pending','reviewing')),
    'points_awarded',(select coalesce(sum(points_awarded),0) from check_ins),
    'bathroom_verifications',(select count(*) from location_bathroom_verifications),
    'pending_businesses',(select count(*) from businesses where verification_status='pending'),
    'pending_certifications',(select count(*) from business_certifications where status='pending'),
    'support_open',(select count(*) from support_requests where status not in ('resolved','closed')),
    'feedback_open',(select count(*) from user_feedback where status not in ('resolved','closed')),
    'deletion_requests',(select count(*) from account_deletion_requests where status in ('requested','processing')),
    'partner_networks',(select count(*) from enterprise_partner_networks),
    'partner_agreements',(select count(*) from partner_agreements),
    'subscriptions',(select count(*) from subscriptions),
    'health','Protected',
    'locations_count_mode','estimated_live_rows',
    'active_locations_count_mode','estimated_partial_index_rows'
  ) into v;

  return v;
end;
$function$;
