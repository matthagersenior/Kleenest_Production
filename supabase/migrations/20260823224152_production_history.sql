create or replace view public.capability_coverage_rollup as
select
  fc.feature_code,
  fc.name,
  fc.category,
  fc.minimum_tier,
  fc.enabled as feature_enabled,
  (select count(*) from public.user_feature_entitlements ufe where ufe.feature_code=fc.feature_code and ufe.enabled) as enabled_user_grants,
  (select count(*) from public.feature_access_events fae where fae.feature_code=fc.feature_code) as access_events,
  (select count(*) from public.feature_access_events fae where fae.feature_code=fc.feature_code and fae.outcome='allowed') as allowed_events,
  (select count(*) from public.feature_access_events fae where fae.feature_code=fc.feature_code and fae.outcome in ('locked','denied')) as blocked_events
from public.feature_catalog fc;

grant select on public.capability_coverage_rollup to authenticated;
