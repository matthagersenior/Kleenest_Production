create or replace function public.admin_get_overview()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare v jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and (is_platform_owner=true or is_admin=true or lower(coalesce(role::text,'')) in ('admin','owner','platform_admin'))) then
    raise exception 'admin access required';
  end if;
  select jsonb_build_object(
    'users',(select count(*) from profiles),
    'businesses',(select count(*) from businesses),
    'locations',(select count(*) from locations),
    'active_locations',(select count(*) from locations where is_active),
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
    'points_awarded',(select coalesce(sum(points_awarded),0) from point_transactions),
    'bathroom_verifications',(select count(*) from location_bathroom_verifications),
    'pending_businesses',(select count(*) from businesses where verification_status='pending'),
    'pending_certifications',(select count(*) from business_certifications where status='pending'),
    'support_open',(select count(*) from support_requests where status not in ('resolved','closed')),
    'feedback_open',(select count(*) from user_feedback where status not in ('resolved','closed')),
    'deletion_requests',(select count(*) from account_deletion_requests where status in ('requested','processing')),
    'partner_networks',(select count(*) from enterprise_partner_networks),
    'partner_agreements',(select count(*) from partner_agreements),
    'subscriptions',(select count(*) from subscriptions),
    'health','Protected'
  ) into v;
  return v;
end;
$$;

create or replace function public.admin_set_business_tier(p_business_id uuid, p_tier public.business_tier)
returns public.businesses
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare x public.businesses;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and (is_platform_owner=true or is_admin=true or lower(coalesce(role::text,'')) in ('admin','owner','platform_admin'))) then
    raise exception 'admin access required';
  end if;
  update public.businesses
    set business_tier=p_tier, updated_at=now()
    where id=p_business_id
    returning * into x;
  if x.id is null then raise exception 'business not found'; end if;
  return x;
end;
$$;

revoke all on function public.admin_get_overview() from public, anon;
grant execute on function public.admin_get_overview() to authenticated;
revoke all on function public.admin_set_business_tier(uuid,public.business_tier) from public, anon;
grant execute on function public.admin_set_business_tier(uuid,public.business_tier) to authenticated;
