create or replace function public.admin_crud_schema(p_resource text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_table text := lower(trim(p_resource));
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (is_admin = true or lower(coalesce(role::text,'')) in ('admin','owner','platform_admin'))
  ) then raise exception 'admin authorization required'; end if;
  if v_table not in ('profiles','families','family_members','businesses','fleets','locations','location_hours','amenities','location_amenities','location_fixtures','location_photos','qr_codes','check_ins','reviews','favorites','follows','social_posts','reports','badges','user_badges','point_transactions','level_definitions','user_streaks','progression_actions','progression_games','progression_challenges','social_challenge_entries','progression_metric_events','business_campaigns','business_events','contests','contest_entries','promotions','promotion_redemptions','partner_programs','partner_agreements','partner_program_locations','partner_program_memberships','membership_clubs','club_memberships','single_use_access_offers','single_use_access_purchases','business_certifications','certification_tiers','enterprise_partner_networks','enterprise_partner_network_members','enterprise_partner_network_metrics','enterprise_partner_campaigns','enterprise_partner_outcomes','enterprise_partner_allocations','business_engagement_attributions','business_metric_leaderboards','analytics_events','preferred_location_activations','preferred_usage_events','location_visits','location_bathroom_verifications','location_verification_points','support_requests','user_feedback','account_deletion_requests','admin_capability_audit','demo_identity_registry','subscription_plans','subscriptions','pricing_catalog','app_business_memberships','notifications','messages','route_events','route_plans','route_stops','family_groups') then raise exception 'admin resource not allowed: %',p_resource; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',c.column_name,'type',c.data_type,'udt',c.udt_name,'nullable',c.is_nullable='YES','has_default',c.column_default is not null,'default',c.column_default) order by c.ordinal_position),'[]'::jsonb)
  into v_result
  from information_schema.columns c
  where c.table_schema='public' and c.table_name=v_table;
  return v_result;
end; $$;
revoke all on function public.admin_crud_schema(text) from public;
revoke all on function public.admin_crud_schema(text) from anon;
grant execute on function public.admin_crud_schema(text) to authenticated;
