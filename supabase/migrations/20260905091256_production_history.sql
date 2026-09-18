alter table public.capability_domain_contracts
  add column if not exists owner_workspace text,
  add column if not exists owner_route text,
  add column if not exists exposure_state text not null default 'surface',
  add column if not exists release_state text not null default 'enabled',
  add column if not exists requires_surface boolean not null default true,
  add column if not exists source_repos text[] not null default '{}'::text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname='capability_domain_contracts_exposure_state_check') then
    alter table public.capability_domain_contracts add constraint capability_domain_contracts_exposure_state_check
      check (exposure_state in ('surface','shared-service','server-support','release-gated'));
  end if;
  if not exists (select 1 from pg_constraint where conname='capability_domain_contracts_release_state_check') then
    alter table public.capability_domain_contracts add constraint capability_domain_contracts_release_state_check
      check (release_state in ('enabled','play-gated','internal-only','mixed'));
  end if;
end $$;

with canonical_domains as (
  select domain,
         initcap(replace(domain,'_',' ')) as capability_name,
         split_part(min(function_signature),'(',1) as representative_rpc
  from public.capability_function_classifications
  where classification='canonical'
  group by domain
)
insert into public.capability_domain_contracts(domain,canonical_capability,canonical_rpc,owner_surface,active,notes)
select domain,capability_name,representative_rpc,'platform',true,'Canonical domain ownership established during Production monorepo convergence.'
from canonical_domains
on conflict(domain) do nothing;

update public.capability_domain_contracts c set
 owner_surface=case
   when c.domain like 'business%' or c.domain='enterprise_partnerships' then 'business'
   when c.domain like 'fleet%' then 'fleet'
   when c.domain like 'owner%' or c.domain in ('architecture_governance','location_identity','platform_operations') then 'platform'
   when c.domain in ('bathroom_intelligence','intelligence_actions','network_intelligence','notifications','platform_support','qr_access','reviews') then 'shared'
   else 'consumer' end,
 owner_workspace=case
   when c.domain like 'business%' or c.domain='enterprise_partnerships' then 'business-mobile'
   when c.domain like 'fleet%' then 'fleet-mobile'
   when c.domain like 'owner%' or c.domain in ('architecture_governance','location_identity','platform_operations') then 'platform-mobile'
   when c.domain in ('bathroom_intelligence','intelligence_actions','network_intelligence','notifications','platform_support','qr_access','reviews') then 'mobile-core'
   else 'consumer-mobile' end,
 owner_route=case c.domain
   when 'account_lifecycle' then '/account-deletion'
   when 'account_profile' then '/profile'
   when 'ai_safety' then '/assistant'
   when 'amenities' then '/explore'
   when 'architecture_governance' then '/capabilities'
   when 'bathroom_intelligence' then null
   when 'business' then '/'
   when 'business_amenities' then '/locations'
   when 'business_analytics' then '/analytics'
   when 'business_campaigns' then '/growth'
   when 'business_contests' then '/growth'
   when 'business_crud' then '/growth'
   when 'business_management' then '/locations'
   when 'business_marketing' then '/qr-studio'
   when 'business_membership' then '/team'
   when 'business_partnerships' then '/partners'
   when 'business_promotions' then '/growth'
   when 'business_qr' then '/qr-studio'
   when 'business_reviews' then '/reviews'
   when 'community' then '/social'
   when 'consumer' then '/explore'
   when 'consumer_checkins' then '/location/[id]'
   when 'consumer_evidence' then '/location/[id]'
   when 'consumer_feedback' then '/support'
   when 'consumer_observations' then '/location/[id]'
   when 'consumer_reputation' then '/contributor/[id]'
   when 'consumer_reviews' then '/location/[id]'
   when 'consumer_safety' then '/safety'
   when 'consumer_saved_locations' then '/saved'
   when 'enterprise_partnerships' then '/enterprise'
   when 'fleet' then '/dispatch'
   when 'fleet_analytics' then '/insights'
   when 'fleet_crud' then '/assets'
   when 'fleet_leaderboards' then '/metrics'
   when 'fleet_maintenance' then '/maintenance'
   when 'fleet_management' then '/'
   when 'fleet_metrics' then '/metrics'
   when 'fleet_operations' then '/signals'
   when 'fleet_routes' then '/dispatch'
   when 'intelligence_actions' then '/intelligence'
   when 'location_discovery' then '/explore'
   when 'location_identity' then '/data'
   when 'membership_billing' then '/membership'
   when 'network_intelligence' then '/intelligence'
   when 'notifications' then '/notifications'
   when 'offline_maps' then '/offline'
   when 'owner_admin' then '/'
   when 'owner_admin_crud' then '/data'
   when 'owner_moderation' then '/reports'
   when 'owner_progression' then '/progression'
   when 'platform_operations' then '/operations'
   when 'platform_support' then null
   when 'preferred_locations' then '/saved'
   when 'progression' then '/play'
   when 'qr_access' then '/qr'
   when 'reviews' then '/location/[id]'
   when 'rewards_play' then '/games'
   when 'rewards_quests' then '/play'
   when 'route_planning' then '/route'
   when 'trust_discovery' then '/location/[id]'
   else c.owner_route end,
 exposure_state=case
   when c.domain='membership_billing' then 'release-gated'
   when c.domain in ('bathroom_intelligence','platform_support') then 'server-support'
   when c.domain in ('amenities','consumer_reputation','fleet_management','intelligence_actions','network_intelligence','notifications','reviews') then 'shared-service'
   else 'surface' end,
 release_state=case
   when c.domain='membership_billing' then 'play-gated'
   when c.domain='qr_access' then 'mixed'
   when c.domain like 'owner%' or c.domain in ('architecture_governance','location_identity','platform_operations') then 'internal-only'
   else 'enabled' end,
 requires_surface=case
   when c.domain in ('amenities','bathroom_intelligence','consumer_reputation','fleet_management','intelligence_actions','network_intelligence','notifications','platform_support','reviews') then false
   else true end,
 source_repos=case
   when c.domain like 'business%' or c.domain='enterprise_partnerships' then array['Kleenest_Business','Kleenest_Architecture','Kleenest_Production']::text[]
   when c.domain like 'fleet%' then array['Kleenest_Fleet','Kleenest_Architecture','Kleenest_Production']::text[]
   when c.domain like 'owner%' or c.domain='platform_operations' then array['Kleenest_Owner','Kleenest_Architecture','Kleenest_Production']::text[]
   when c.domain in ('architecture_governance','location_identity','bathroom_intelligence','intelligence_actions','network_intelligence','platform_support') then array['Kleenest_Architecture','Kleenest_Production']::text[]
   else array['Kleenest','KleenestApp','Kleenest_App','Kleenest_Architecture','Kleenest_Production']::text[] end,
 active=true,
 notes=case c.domain
   when 'membership_billing' then 'Membership state is retained; Android paid upgrade remains disabled until Google Play Billing purchase and restore verification is complete.'
   when 'qr_access' then 'Standard QR access is enabled. Single-use paid purchase and checkout paths are preserved but release-gated pending Play/legal review.'
   when 'business_membership' then 'Invite, role change, removal and ownership transfer must converge into the Business team workflow.'
   when 'business_partnerships' then 'Partner programs, agreements and partnership CRUD must converge before the standalone Business repo is archived.'
   when 'business_qr' then 'QR Studio includes assets, templates, versions, visual customization and reverification QR.'
   when 'enterprise_partnerships' then 'Enterprise network, partners, campaigns, allocations and outcome/ROI workflows remain canonical.'
   when 'fleet_metrics' then 'Fleet goals use capability-driven metric configuration; progression is opt-in and not automatic.'
   when 'intelligence_actions' then 'Intelligence is incomplete unless a recommendation terminates in an authorized action or explicit non-action state and refreshes canonical outcome state.'
   when 'owner_progression' then 'KleenestOS owns XP catalog, objective lifecycle and progression supply maintenance.'
   when 'platform_operations' then 'KleenestOS owns ingestion storage/status/resume/repair workflows.'
   when 'ai_safety' then 'Every AI surface must provide authenticated report_ai_response safety reporting.'
   else coalesce(c.notes,'Canonical domain ownership established during Production monorepo convergence.') end,
 updated_at=now();
