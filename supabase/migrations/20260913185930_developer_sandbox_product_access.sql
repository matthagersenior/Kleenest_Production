-- Give Kleenest-owned demo/pilot workspaces a low-quota bundle that can exercise
-- every currently supported read/test Developer Platform product without weakening
-- product enforcement for normal customer bundles.
insert into public.platform_product_bundles(
  bundle_key,
  label,
  description,
  plan,
  scopes,
  api_products,
  integration_surfaces,
  default_quota_per_minute,
  default_quota_per_month,
  sort_order,
  active,
  updated_at
) values (
  'developer_sandbox',
  'Developer Sandbox',
  'Low-quota Kleenest demo and pilot bundle with all current read/test Developer Platform products enabled for live evaluation.',
  'developer',
  array['recommendations:read','platform:read']::text[],
  array['nearby','route','place_details','place_match']::text[],
  array['rest','sdk','widget','map','route_sdk','webhooks','mcp']::text[],
  30,
  5000,
  5,
  true,
  now()
)
on conflict(bundle_key) do update set
  label=excluded.label,
  description=excluded.description,
  plan=excluded.plan,
  scopes=excluded.scopes,
  api_products=excluded.api_products,
  integration_surfaces=excluded.integration_surfaces,
  default_quota_per_minute=excluded.default_quota_per_minute,
  default_quota_per_month=excluded.default_quota_per_month,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

-- Deliberately do not modify Starter API or any existing customer product access.
-- Existing workspaces keep their commercial entitlements unless explicitly moved
-- to Developer Sandbox by the Kleenest owner control plane.
