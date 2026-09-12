-- Kleenest Platform product control plane.
-- Canonical owner authority for partner-facing products, REST endpoint definitions,
-- pilot entitlements, product samples, and release/runtime configuration.

create table if not exists public.platform_integration_products(
  id uuid primary key default gen_random_uuid(),
  code text not null unique check(code ~ '^[a-z][a-z0-9_]{2,63}$'),
  name text not null check(length(trim(name)) between 1 and 160),
  kind text not null check(kind in ('api','sdk','component','link','event','ai')),
  description text not null default '',
  status text not null default 'active' check(status in ('draft','active','paused','retired')),
  release_channel text not null default 'beta' check(release_channel in ('stable','beta','pilot','internal')),
  version text not null default '0.1.0' check(length(trim(version)) between 1 and 40),
  docs_url text,
  distribution_url text,
  package_name text,
  dependencies text[] not null default '{}'::text[],
  scopes text[] not null default '{}'::text[],
  capabilities text[] not null default '{}'::text[],
  runtime_config jsonb not null default '{}'::jsonb check(jsonb_typeof(runtime_config)='object'),
  sample_config jsonb not null default '{}'::jsonb check(jsonb_typeof(sample_config)='object'),
  customizable boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_api_endpoints(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.platform_integration_products(id) on delete cascade,
  method text not null check(method in ('GET','POST')),
  path text not null check(path ~ '^/v[0-9]+/'),
  version text not null default 'v1',
  handler_key text not null check(handler_key in ('recommend_nearby','recommend_route')),
  status text not null default 'active' check(status in ('draft','active','paused','retired')),
  description text not null default '',
  required_scopes text[] not null default array['recommendations:read']::text[],
  runtime_config jsonb not null default '{}'::jsonb check(jsonb_typeof(runtime_config)='object'),
  sample_request jsonb not null default '{}'::jsonb,
  sample_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(method,path)
);

create table if not exists public.platform_partner_product_access(
  partner_id uuid not null references public.platform_partners(id) on delete cascade,
  product_id uuid not null references public.platform_integration_products(id) on delete cascade,
  environment text not null default 'pilot' check(environment in ('sample','pilot','production')),
  status text not null default 'enabled' check(status in ('enabled','disabled')),
  quota_per_minute integer check(quota_per_minute is null or quota_per_minute between 1 and 100000),
  quota_per_month bigint check(quota_per_month is null or quota_per_month between 1 and 1000000000),
  expires_at timestamptz,
  config jsonb not null default '{}'::jsonb check(jsonb_typeof(config)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(partner_id,product_id)
);

create table if not exists public.platform_product_control_audit(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  resource_code text,
  reason text,
  previous_state jsonb,
  next_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_api_endpoints_product_status_idx
  on public.platform_api_endpoints(product_id,status,path);
create index if not exists platform_partner_product_access_status_idx
  on public.platform_partner_product_access(partner_id,status,expires_at);
create index if not exists platform_product_control_audit_created_idx
  on public.platform_product_control_audit(created_at desc);

alter table public.platform_integration_products enable row level security;
alter table public.platform_api_endpoints enable row level security;
alter table public.platform_partner_product_access enable row level security;
alter table public.platform_product_control_audit enable row level security;

revoke all on table public.platform_integration_products from public,anon,authenticated;
revoke all on table public.platform_api_endpoints from public,anon,authenticated;
revoke all on table public.platform_partner_product_access from public,anon,authenticated;
revoke all on table public.platform_product_control_audit from public,anon,authenticated;

grant select,insert,update,delete on table public.platform_integration_products to service_role;
grant select,insert,update,delete on table public.platform_api_endpoints to service_role;
grant select,insert,update,delete on table public.platform_partner_product_access to service_role;
grant select,insert on table public.platform_product_control_audit to service_role;

drop policy if exists platform_integration_products_client_deny on public.platform_integration_products;
create policy platform_integration_products_client_deny on public.platform_integration_products
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_api_endpoints_client_deny on public.platform_api_endpoints;
create policy platform_api_endpoints_client_deny on public.platform_api_endpoints
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_partner_product_access_client_deny on public.platform_partner_product_access;
create policy platform_partner_product_access_client_deny on public.platform_partner_product_access
  for all to anon,authenticated using(false) with check(false);
drop policy if exists platform_product_control_audit_client_deny on public.platform_product_control_audit;
create policy platform_product_control_audit_client_deny on public.platform_product_control_audit
  for all to anon,authenticated using(false) with check(false);

insert into public.platform_integration_products(
  code,name,kind,description,status,release_channel,version,docs_url,distribution_url,package_name,
  dependencies,scopes,capabilities,runtime_config,sample_config,sort_order
)
values
('rest_api','Kleenest REST API','api','Backend REST recommendation API for partner servers and approved clients.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api',null,
 '{}',array['recommendations:read'],array['nearby_recommendations','route_recommendations','trust_metadata','amenity_requirements'],
 '{"defaultNearbyRadiusMeters":16093,"defaultRouteCorridorMeters":8047}'::jsonb,
 '{"nearby":{"location":{"latitude":38.627,"longitude":-90.1994},"radiusMeters":16093,"limit":3}}'::jsonb,10),
('js_sdk','Kleenest JavaScript SDK','sdk','Typed JavaScript transport for Kleenest REST recommendations.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/sdk.js','@kleenest/sdk-js',
 array['rest_api'],array['recommendations:read'],array['nearby_recommendations','route_recommendations','browser_token_support'],
 '{}'::jsonb,'{"quickstart":"KleenestClient.recommendNearby"}'::jsonb,20),
('mobile_sdk','Kleenest Mobile SDK','sdk','React Native/mobile-friendly typed Kleenest recommendation client and deep-link helper.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 null,'@kleenest/mobile-sdk',
 array['rest_api','deep_links'],array['recommendations:read'],array['nearby_recommendations','route_recommendations','open_place_deep_link'],
 '{}'::jsonb,'{"quickstart":"KleenestMobileClient.recommendNearby"}'::jsonb,30),
('widget','Kleenest Widget','component','Embeddable Find a restroom web component powered by Kleenest recommendations.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/widget.js','@kleenest/widget',
 array['js_sdk','rest_api'],array['recommendations:read'],array['find_restroom_widget','deep_link_results'],
 '{"defaultTitle":"Find a restroom"}'::jsonb,'{"title":"Find a restroom","radiusMeters":16093,"limit":5}'::jsonb,40),
('map_layer','Kleenest Map Layer','component','GeoJSON conversion layer for displaying Kleenest recommendations on partner maps.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/map.js','@kleenest/map-layer',
 array['rest_api','deep_links'],array['recommendations:read'],array['geojson_features','trust_properties','deep_link_properties'],
 '{}'::jsonb,'{"format":"FeatureCollection"}'::jsonb,50),
('route_sdk','Kleenest Route SDK','sdk','Route-stop recommendation helper for navigation, dispatch, travel and fleet products.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-distribution/v1/route.js','@kleenest/route-sdk',
 array['rest_api'],array['recommendations:read'],array['route_stops','next_stop','detour_aware_recommendations'],
 '{"defaultCorridorMeters":8047}'::jsonb,'{"corridorMeters":8047,"limit":10}'::jsonb,60),
('deep_links','Kleenest Deep Links','link','Stable links into Kleenest place/location experiences from partner products.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 'https://kleenest.app/place/{kleenestPlaceId}',null,
 '{}','{}',array['place_deep_links'],'{}'::jsonb,'{"template":"https://kleenest.app/place/{kleenestPlaceId}"}'::jsonb,70),
('webhooks','Kleenest Webhooks','event','Signed at-least-once partner event delivery for location and recommendation intelligence changes.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 null,null,
 '{}','{}',array['place.updated','place.verification_changed','place.access_changed','place.amenities_changed','place.confidence_changed','recommendation.coverage_changed'],
 '{"maxAttempts":8}'::jsonb,'{"signature":"HMAC-SHA256","delivery":"at-least-once"}'::jsonb,80),
('ai_mcp','Kleenest AI / MCP','ai','AI-agent tools delegating Kleenest nearby and along-route restroom intelligence to REST v1.','active','beta','0.1.0',
 'https://matthagersenior.github.io/Kleenest_Production/developer/',
 null,null,
 array['rest_api'],array['recommendations:read'],array['find_nearby_restrooms','find_restrooms_along_route'],
 '{}'::jsonb,'{"tools":["find_nearby_restrooms","find_restrooms_along_route"]}'::jsonb,90)
on conflict(code) do nothing;

insert into public.platform_api_endpoints(
  product_id,method,path,version,handler_key,status,description,required_scopes,runtime_config,sample_request,sample_response
)
select p.id,'POST','/v1/recommendations/nearby','v1','recommend_nearby','active',
       'Return ranked Kleenest restroom recommendations around a coordinate.',
       array['recommendations:read'],'{}'::jsonb,
       '{"location":{"latitude":38.627,"longitude":-90.1994},"radiusMeters":16093,"limit":3}'::jsonb,
       '{"recommendations":[],"metadata":{"resultCount":0}}'::jsonb
from public.platform_integration_products p where p.code='rest_api'
on conflict(method,path) do nothing;

insert into public.platform_api_endpoints(
  product_id,method,path,version,handler_key,status,description,required_scopes,runtime_config,sample_request,sample_response
)
select p.id,'POST','/v1/recommendations/route','v1','recommend_route','active',
       'Return ranked Kleenest restroom recommendations along a route corridor.',
       array['recommendations:read'],'{}'::jsonb,
       '{"route":{"type":"LineString","coordinates":[[-90.1994,38.627],[-89.6501,39.7817]]},"corridorMeters":8047,"limit":3}'::jsonb,
       '{"recommendations":[],"metadata":{"resultCount":0}}'::jsonb
from public.platform_integration_products p where p.code='rest_api'
on conflict(method,path) do nothing;

-- Internal sandbox always has access to every current product.
insert into public.platform_partner_product_access(
  partner_id,product_id,environment,status,expires_at,config
)
select partner.id,product.id,'sample','enabled',null,'{"sample_mode":true}'::jsonb
from public.platform_partners partner
cross join public.platform_integration_products product
where partner.slug='kleenest-internal-development'
on conflict(partner_id,product_id) do update
set status='enabled',environment='sample',updated_at=now();

-- Existing developer workspaces keep their current REST/SDK behavior after entitlement enforcement.
insert into public.platform_partner_product_access(partner_id,product_id,environment,status)
select partner.id,product.id,'pilot','enabled'
from public.platform_partners partner
join public.platform_integration_products product on product.code in ('rest_api','js_sdk','deep_links')
where partner.status='active' and partner.plan='developer'
on conflict(partner_id,product_id) do nothing;

create or replace function public.create_platform_partner(
  p_slug text,
  p_name text,
  p_plan text default 'developer',
  p_quota_per_minute integer default 60,
  p_quota_per_month bigint default 10000
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  insert into public.platform_partners(slug,name,plan,quota_per_minute,quota_per_month)
  values(lower(trim(p_slug)),trim(p_name),lower(trim(p_plan)),p_quota_per_minute,p_quota_per_month)
  returning id into v_id;

  insert into public.platform_partner_product_access(partner_id,product_id,environment,status)
  select v_id,p.id,'pilot','enabled'
  from public.platform_integration_products p
  where p.code in ('rest_api','js_sdk','deep_links') and p.status='active'
  on conflict(partner_id,product_id) do nothing;

  return v_id;
end;
$$;
revoke all on function public.create_platform_partner(text,text,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.create_platform_partner(text,text,text,integer,bigint) to service_role;

create or replace function public.platform_route_access_decision(
  p_partner_id uuid,
  p_method text,
  p_route text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_endpoint public.platform_api_endpoints;
  v_product public.platform_integration_products;
  v_access public.platform_partner_product_access;
begin
  select * into v_endpoint
  from public.platform_api_endpoints
  where method=upper(trim(coalesce(p_method,'')))
    and path=trim(coalesce(p_route,''))
  limit 1;

  if v_endpoint.id is null then
    return jsonb_build_object('allowed',false,'reason','endpoint_not_found');
  end if;

  select * into v_product from public.platform_integration_products where id=v_endpoint.product_id;
  if v_product.id is null or v_product.status<>'active' then
    return jsonb_build_object('allowed',false,'reason','product_disabled','product_code',v_product.code);
  end if;
  if v_endpoint.status<>'active' then
    return jsonb_build_object('allowed',false,'reason','endpoint_disabled','product_code',v_product.code,'endpoint_id',v_endpoint.id);
  end if;

  select * into v_access
  from public.platform_partner_product_access
  where partner_id=p_partner_id and product_id=v_product.id
  limit 1;

  if v_access.partner_id is null then
    return jsonb_build_object('allowed',false,'reason','product_not_entitled','product_code',v_product.code);
  end if;
  if v_access.status<>'enabled' or (v_access.expires_at is not null and v_access.expires_at<=now()) then
    return jsonb_build_object('allowed',false,'reason','product_access_disabled','product_code',v_product.code);
  end if;

  return jsonb_build_object(
    'allowed',true,
    'product_code',v_product.code,
    'product_version',v_product.version,
    'handler_key',v_endpoint.handler_key,
    'endpoint_id',v_endpoint.id,
    'environment',v_access.environment,
    'required_scopes',to_jsonb(v_endpoint.required_scopes),
    'runtime_config',v_product.runtime_config || v_endpoint.runtime_config || v_access.config
  );
end;
$$;
revoke all on function public.platform_route_access_decision(uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_route_access_decision(uuid,text,text) to service_role;

create or replace function public.platform_public_distribution_manifest()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'generatedAt',now(),
    'products',coalesce(jsonb_agg(jsonb_build_object(
      'code',p.code,
      'name',p.name,
      'kind',p.kind,
      'description',p.description,
      'status',p.status,
      'releaseChannel',p.release_channel,
      'version',p.version,
      'docsUrl',p.docs_url,
      'distributionUrl',p.distribution_url,
      'packageName',p.package_name,
      'dependencies',to_jsonb(p.dependencies),
      'capabilities',to_jsonb(p.capabilities),
      'runtimeConfig',p.runtime_config,
      'sampleConfig',p.sample_config,
      'customizable',p.customizable
    ) order by p.sort_order,p.code) filter(where p.release_channel<>'internal'),'[]'::jsonb)
  )
  from public.platform_integration_products p
  where p.status<>'retired'
$$;
revoke all on function public.platform_public_distribution_manifest() from public,anon,authenticated;
grant execute on function public.platform_public_distribution_manifest() to service_role;

create or replace function public.owner_platform_product_control_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'products',coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort_order,p.code)
      from public.platform_integration_products p
    ),'[]'::jsonb),
    'endpoints',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.path)
      from (
        select e.*,p.code product_code,p.name product_name
        from public.platform_api_endpoints e
        join public.platform_integration_products p on p.id=e.product_id
      ) x
    ),'[]'::jsonb),
    'partners',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'slug',p.slug,'name',p.name,'status',p.status,'plan',p.plan,
        'quota_per_minute',p.quota_per_minute,'quota_per_month',p.quota_per_month,
        'kind',coalesce(p.metadata->>'kind','partner'),
        'expires_at',p.metadata->>'expires_at',
        'created_at',p.created_at
      ) order by p.created_at desc)
      from public.platform_partners p
    ),'[]'::jsonb),
    'access',coalesce((
      select jsonb_agg(jsonb_build_object(
        'partner_id',a.partner_id,'product_id',a.product_id,'product_code',p.code,'product_name',p.name,
        'environment',a.environment,'status',a.status,'quota_per_minute',a.quota_per_minute,
        'quota_per_month',a.quota_per_month,'expires_at',a.expires_at,'config',a.config,'updated_at',a.updated_at
      ) order by a.partner_id,p.sort_order)
      from public.platform_partner_product_access a
      join public.platform_integration_products p on p.id=a.product_id
    ),'[]'::jsonb),
    'audit',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select * from public.platform_product_control_audit order by created_at desc limit 100
      ) x
    ),'[]'::jsonb),
    'generated_at',now()
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.owner_platform_product_control_snapshot() from public,anon;
grant execute on function public.owner_platform_product_control_snapshot() to authenticated,service_role;

create or replace function public.owner_upsert_platform_integration_product(
  p_product jsonb,
  p_reason text default 'KleenestOS integration product update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_code text:=lower(trim(coalesce(p_product->>'code','')));
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if v_code !~ '^[a-z][a-z0-9_]{2,63}$' then raise exception 'valid product code required'; end if;
  if p_product ? 'id' and nullif(p_product->>'id','') is not null then v_id:=(p_product->>'id')::uuid; end if;
  if v_id is null then select id into v_id from public.platform_integration_products where code=v_code; end if;
  if v_id is not null then select to_jsonb(p) into v_before from public.platform_integration_products p where p.id=v_id; end if;

  if v_id is null then
    insert into public.platform_integration_products(
      code,name,kind,description,status,release_channel,version,docs_url,distribution_url,package_name,
      dependencies,scopes,capabilities,runtime_config,sample_config,customizable,sort_order
    ) values(
      v_code,
      trim(coalesce(p_product->>'name',v_code)),
      coalesce(nullif(p_product->>'kind',''),'component'),
      coalesce(p_product->>'description',''),
      coalesce(nullif(p_product->>'status',''),'draft'),
      coalesce(nullif(p_product->>'release_channel',''),'pilot'),
      coalesce(nullif(p_product->>'version',''),'0.1.0'),
      nullif(trim(p_product->>'docs_url'),''),
      nullif(trim(p_product->>'distribution_url'),''),
      nullif(trim(p_product->>'package_name'),''),
      coalesce(array(select jsonb_array_elements_text(p_product->'dependencies')),'{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(p_product->'scopes')),'{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(p_product->'capabilities')),'{}'::text[]),
      coalesce(p_product->'runtime_config','{}'::jsonb),
      coalesce(p_product->'sample_config','{}'::jsonb),
      coalesce((p_product->>'customizable')::boolean,true),
      coalesce((p_product->>'sort_order')::integer,100)
    ) returning id into v_id;
  else
    update public.platform_integration_products p set
      code=v_code,
      name=case when p_product ? 'name' then trim(p_product->>'name') else p.name end,
      kind=case when p_product ? 'kind' then p_product->>'kind' else p.kind end,
      description=case when p_product ? 'description' then coalesce(p_product->>'description','') else p.description end,
      status=case when p_product ? 'status' then p_product->>'status' else p.status end,
      release_channel=case when p_product ? 'release_channel' then p_product->>'release_channel' else p.release_channel end,
      version=case when p_product ? 'version' then p_product->>'version' else p.version end,
      docs_url=case when p_product ? 'docs_url' then nullif(trim(p_product->>'docs_url'),'') else p.docs_url end,
      distribution_url=case when p_product ? 'distribution_url' then nullif(trim(p_product->>'distribution_url'),'') else p.distribution_url end,
      package_name=case when p_product ? 'package_name' then nullif(trim(p_product->>'package_name'),'') else p.package_name end,
      dependencies=case when p_product ? 'dependencies' then array(select jsonb_array_elements_text(p_product->'dependencies')) else p.dependencies end,
      scopes=case when p_product ? 'scopes' then array(select jsonb_array_elements_text(p_product->'scopes')) else p.scopes end,
      capabilities=case when p_product ? 'capabilities' then array(select jsonb_array_elements_text(p_product->'capabilities')) else p.capabilities end,
      runtime_config=case when p_product ? 'runtime_config' then coalesce(p_product->'runtime_config','{}'::jsonb) else p.runtime_config end,
      sample_config=case when p_product ? 'sample_config' then coalesce(p_product->'sample_config','{}'::jsonb) else p.sample_config end,
      customizable=case when p_product ? 'customizable' then (p_product->>'customizable')::boolean else p.customizable end,
      sort_order=case when p_product ? 'sort_order' then (p_product->>'sort_order')::integer else p.sort_order end,
      updated_at=now()
    where p.id=v_id;
  end if;

  select to_jsonb(p) into v_after from public.platform_integration_products p where p.id=v_id;
  insert into public.platform_product_control_audit(actor_user_id,action,resource_type,resource_id,resource_code,reason,previous_state,next_state)
  values(auth.uid(),case when v_before is null then 'create' else 'update' end,'product',v_id,v_code,p_reason,v_before,v_after);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_platform_integration_product(jsonb,text) from public,anon;
grant execute on function public.owner_upsert_platform_integration_product(jsonb,text) to authenticated,service_role;

create or replace function public.owner_delete_platform_integration_product(
  p_product_id uuid,
  p_reason text default 'KleenestOS integration product delete'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_before jsonb; v_code text; v_mode text;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select to_jsonb(p),p.code into v_before,v_code from public.platform_integration_products p where p.id=p_product_id for update;
  if v_before is null then raise exception 'integration product not found'; end if;
  if exists(select 1 from public.platform_api_endpoints where product_id=p_product_id)
     or exists(select 1 from public.platform_partner_product_access where product_id=p_product_id) then
    update public.platform_integration_products set status='retired',updated_at=now() where id=p_product_id;
    v_mode:='retired';
  else
    delete from public.platform_integration_products where id=p_product_id;
    v_mode:='deleted';
  end if;
  insert into public.platform_product_control_audit(actor_user_id,action,resource_type,resource_id,resource_code,reason,previous_state,next_state)
  values(auth.uid(),v_mode,'product',p_product_id,v_code,p_reason,v_before,
    case when v_mode='retired' then jsonb_set(v_before,'{status}','"retired"'::jsonb) else null end);
  return jsonb_build_object('id',p_product_id,'code',v_code,'mode',v_mode);
end;
$$;
revoke all on function public.owner_delete_platform_integration_product(uuid,text) from public,anon;
grant execute on function public.owner_delete_platform_integration_product(uuid,text) to authenticated,service_role;

create or replace function public.owner_upsert_platform_api_endpoint(
  p_endpoint jsonb,
  p_reason text default 'KleenestOS API endpoint update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_product_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_method text:=upper(trim(coalesce(p_endpoint->>'method','POST')));
  v_path text:=trim(coalesce(p_endpoint->>'path',''));
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  if v_path !~ '^/v[0-9]+/' then raise exception 'versioned endpoint path required'; end if;
  if p_endpoint ? 'id' and nullif(p_endpoint->>'id','') is not null then v_id:=(p_endpoint->>'id')::uuid; end if;
  if p_endpoint ? 'product_id' then v_product_id:=(p_endpoint->>'product_id')::uuid; end if;
  if v_product_id is null and p_endpoint ? 'product_code' then
    select id into v_product_id from public.platform_integration_products where code=p_endpoint->>'product_code';
  end if;
  if v_id is null then select id,product_id into v_id,v_product_id from public.platform_api_endpoints where method=v_method and path=v_path; end if;
  if v_product_id is null then raise exception 'endpoint product required'; end if;
  if v_id is not null then select to_jsonb(e) into v_before from public.platform_api_endpoints e where e.id=v_id; end if;

  if v_id is null then
    insert into public.platform_api_endpoints(
      product_id,method,path,version,handler_key,status,description,required_scopes,runtime_config,sample_request,sample_response
    ) values(
      v_product_id,v_method,v_path,
      coalesce(nullif(p_endpoint->>'version',''),'v1'),
      p_endpoint->>'handler_key',
      coalesce(nullif(p_endpoint->>'status',''),'draft'),
      coalesce(p_endpoint->>'description',''),
      coalesce(array(select jsonb_array_elements_text(p_endpoint->'required_scopes')),array['recommendations:read']::text[]),
      coalesce(p_endpoint->'runtime_config','{}'::jsonb),
      coalesce(p_endpoint->'sample_request','{}'::jsonb),
      coalesce(p_endpoint->'sample_response','{}'::jsonb)
    ) returning id into v_id;
  else
    update public.platform_api_endpoints e set
      product_id=v_product_id,
      method=v_method,
      path=v_path,
      version=case when p_endpoint ? 'version' then p_endpoint->>'version' else e.version end,
      handler_key=case when p_endpoint ? 'handler_key' then p_endpoint->>'handler_key' else e.handler_key end,
      status=case when p_endpoint ? 'status' then p_endpoint->>'status' else e.status end,
      description=case when p_endpoint ? 'description' then coalesce(p_endpoint->>'description','') else e.description end,
      required_scopes=case when p_endpoint ? 'required_scopes' then array(select jsonb_array_elements_text(p_endpoint->'required_scopes')) else e.required_scopes end,
      runtime_config=case when p_endpoint ? 'runtime_config' then coalesce(p_endpoint->'runtime_config','{}'::jsonb) else e.runtime_config end,
      sample_request=case when p_endpoint ? 'sample_request' then coalesce(p_endpoint->'sample_request','{}'::jsonb) else e.sample_request end,
      sample_response=case when p_endpoint ? 'sample_response' then coalesce(p_endpoint->'sample_response','{}'::jsonb) else e.sample_response end,
      updated_at=now()
    where e.id=v_id;
  end if;

  select to_jsonb(e) into v_after from public.platform_api_endpoints e where e.id=v_id;
  insert into public.platform_product_control_audit(actor_user_id,action,resource_type,resource_id,resource_code,reason,previous_state,next_state)
  values(auth.uid(),case when v_before is null then 'create' else 'update' end,'endpoint',v_id,v_method||' '||v_path,p_reason,v_before,v_after);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_platform_api_endpoint(jsonb,text) from public,anon;
grant execute on function public.owner_upsert_platform_api_endpoint(jsonb,text) to authenticated,service_role;

create or replace function public.owner_delete_platform_api_endpoint(
  p_endpoint_id uuid,
  p_reason text default 'KleenestOS API endpoint delete'
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_before jsonb; v_code text;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select to_jsonb(e),e.method||' '||e.path into v_before,v_code from public.platform_api_endpoints e where e.id=p_endpoint_id for update;
  if v_before is null then raise exception 'API endpoint not found'; end if;
  delete from public.platform_api_endpoints where id=p_endpoint_id;
  insert into public.platform_product_control_audit(actor_user_id,action,resource_type,resource_id,resource_code,reason,previous_state,next_state)
  values(auth.uid(),'delete','endpoint',p_endpoint_id,v_code,p_reason,v_before,null);
  return true;
end;
$$;
revoke all on function public.owner_delete_platform_api_endpoint(uuid,text) from public,anon;
grant execute on function public.owner_delete_platform_api_endpoint(uuid,text) to authenticated,service_role;

create or replace function public.owner_upsert_platform_partner_product_access(
  p_partner_id uuid,
  p_product_code text,
  p_patch jsonb default '{}'::jsonb,
  p_reason text default 'KleenestOS partner product access update'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_product_id uuid; v_before jsonb; v_after jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select id into v_product_id from public.platform_integration_products where code=lower(trim(p_product_code));
  if v_product_id is null then raise exception 'integration product not found'; end if;
  select to_jsonb(a) into v_before from public.platform_partner_product_access a where a.partner_id=p_partner_id and a.product_id=v_product_id;
  insert into public.platform_partner_product_access(
    partner_id,product_id,environment,status,quota_per_minute,quota_per_month,expires_at,config
  ) values(
    p_partner_id,v_product_id,
    coalesce(nullif(p_patch->>'environment',''),'pilot'),
    coalesce(nullif(p_patch->>'status',''),'enabled'),
    nullif(p_patch->>'quota_per_minute','')::integer,
    nullif(p_patch->>'quota_per_month','')::bigint,
    nullif(p_patch->>'expires_at','')::timestamptz,
    coalesce(p_patch->'config','{}'::jsonb)
  )
  on conflict(partner_id,product_id) do update set
    environment=case when p_patch ? 'environment' then p_patch->>'environment' else public.platform_partner_product_access.environment end,
    status=case when p_patch ? 'status' then p_patch->>'status' else public.platform_partner_product_access.status end,
    quota_per_minute=case when p_patch ? 'quota_per_minute' then nullif(p_patch->>'quota_per_minute','')::integer else public.platform_partner_product_access.quota_per_minute end,
    quota_per_month=case when p_patch ? 'quota_per_month' then nullif(p_patch->>'quota_per_month','')::bigint else public.platform_partner_product_access.quota_per_month end,
    expires_at=case when p_patch ? 'expires_at' then nullif(p_patch->>'expires_at','')::timestamptz else public.platform_partner_product_access.expires_at end,
    config=case when p_patch ? 'config' then coalesce(p_patch->'config','{}'::jsonb) else public.platform_partner_product_access.config end,
    updated_at=now();

  select to_jsonb(a) into v_after from public.platform_partner_product_access a where a.partner_id=p_partner_id and a.product_id=v_product_id;
  insert into public.platform_product_control_audit(actor_user_id,action,resource_type,resource_id,resource_code,reason,previous_state,next_state)
  values(auth.uid(),case when v_before is null then 'create' else 'update' end,'partner_product_access',v_product_id,p_product_code,p_reason,v_before,v_after);
  return v_after;
end;
$$;
revoke all on function public.owner_upsert_platform_partner_product_access(uuid,text,jsonb,text) from public,anon;
grant execute on function public.owner_upsert_platform_partner_product_access(uuid,text,jsonb,text) to authenticated,service_role;

create or replace function public.owner_delete_platform_partner_product_access(
  p_partner_id uuid,
  p_product_code text,
  p_reason text default 'KleenestOS partner product access delete'
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_product_id uuid; v_before jsonb;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  select id into v_product_id from public.platform_integration_products where code=lower(trim(p_product_code));
  if v_product_id is null then raise exception 'integration product not found'; end if;
  select to_jsonb(a) into v_before from public.platform_partner_product_access a where a.partner_id=p_partner_id and a.product_id=v_product_id;
  delete from public.platform_partner_product_access where partner_id=p_partner_id and product_id=v_product_id;
  insert into public.platform_product_control_audit(actor_user_id,action,resource_type,resource_id,resource_code,reason,previous_state,next_state)
  values(auth.uid(),'delete','partner_product_access',v_product_id,p_product_code,p_reason,v_before,null);
  return true;
end;
$$;
revoke all on function public.owner_delete_platform_partner_product_access(uuid,text,text) from public,anon;
grant execute on function public.owner_delete_platform_partner_product_access(uuid,text,text) to authenticated,service_role;

create or replace function public.owner_create_platform_pilot(
  p_slug text,
  p_name text,
  p_product_codes text[] default array['rest_api','js_sdk','mobile_sdk','widget','map_layer','route_sdk','deep_links','webhooks','ai_mcp']::text[],
  p_expires_at timestamptz default now()+interval '30 days',
  p_quota_per_minute integer default 60,
  p_quota_per_month bigint default 10000,
  p_reason text default 'KleenestOS pilot workspace creation'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_partner_id uuid;
begin
  if not public.is_platform_owner_session() then raise exception 'platform owner access required' using errcode='42501'; end if;
  v_partner_id:=public.create_platform_partner(p_slug,p_name,'developer',p_quota_per_minute,p_quota_per_month);
  update public.platform_partners
  set metadata=metadata || jsonb_build_object('kind','pilot','expires_at',p_expires_at,'created_by',auth.uid()),updated_at=now()
  where id=v_partner_id;

  insert into public.platform_partner_product_access(partner_id,product_id,environment,status,expires_at,config)
  select distinct v_partner_id,p.id,'pilot','enabled',p_expires_at,'{"sample_mode":true}'::jsonb
  from public.platform_integration_products p
  where p.status='active'
    and (
      p.code=any(coalesce(p_product_codes,'{}'::text[]))
      or exists(
        select 1 from public.platform_integration_products selected
        where selected.code=any(coalesce(p_product_codes,'{}'::text[]))
          and p.code=any(selected.dependencies)
      )
    )
  on conflict(partner_id,product_id) do update set
    environment='pilot',status='enabled',expires_at=excluded.expires_at,config=excluded.config,updated_at=now();

  insert into public.platform_product_control_audit(actor_user_id,action,resource_type,resource_id,resource_code,reason,next_state)
  values(auth.uid(),'create','pilot',v_partner_id,lower(trim(p_slug)),p_reason,
    jsonb_build_object('partner_id',v_partner_id,'products',to_jsonb(p_product_codes),'expires_at',p_expires_at));

  return jsonb_build_object(
    'partner_id',v_partner_id,
    'slug',lower(trim(p_slug)),
    'name',trim(p_name),
    'expires_at',p_expires_at,
    'product_access',coalesce((
      select jsonb_agg(jsonb_build_object('code',p.code,'name',p.name,'environment',a.environment,'status',a.status) order by p.sort_order)
      from public.platform_partner_product_access a
      join public.platform_integration_products p on p.id=a.product_id
      where a.partner_id=v_partner_id
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.owner_create_platform_pilot(text,text,text[],timestamptz,integer,bigint,text) from public,anon;
grant execute on function public.owner_create_platform_pilot(text,text,text[],timestamptz,integer,bigint,text) to authenticated,service_role;

-- Make this owner control plane visible in the canonical capability registry.
insert into public.feature_catalog(feature_code,name,category,minimum_tier,enabled,configuration)
values('platform_integrations_control','Platform Integration Control','platform',null,true,'{"ownerOnly":true}'::jsonb)
on conflict(feature_code) do update set name=excluded.name,category=excluded.category,enabled=true,configuration=excluded.configuration,updated_at=now();

insert into public.capability_domain_contracts(
  domain,canonical_capability,canonical_rpc,owner_surface,active,notes,owner_workspace,owner_route,
  exposure_state,release_state,requires_surface,source_repos
)
values(
  'platform_integrations','Platform Integration Control','owner_platform_product_control_snapshot','platform',true,
  'KleenestOS owns CRUD, release configuration, pilot entitlements, endpoint exposure and partner product packaging.',
  'platform-mobile','/integrations','surface','internal-only',true,array['matthagersenior/Kleenest_Production']
)
on conflict(domain) do update set
  canonical_capability=excluded.canonical_capability,
  canonical_rpc=excluded.canonical_rpc,
  owner_surface=excluded.owner_surface,
  active=true,
  notes=excluded.notes,
  owner_workspace=excluded.owner_workspace,
  owner_route=excluded.owner_route,
  exposure_state=excluded.exposure_state,
  release_state=excluded.release_state,
  requires_surface=true,
  source_repos=excluded.source_repos,
  updated_at=now();

insert into public.capability_feature_contracts(feature_code,canonical_capability,mapping_type,evidence_status,notes)
values('platform_integrations_control','Platform Integration Control','primary','wired','KleenestOS integration product CRUD and pilot control plane.')
on conflict do nothing;

comment on table public.platform_integration_products is 'Canonical Kleenest partner-facing product registry controlled by platform owners.';
comment on table public.platform_api_endpoints is 'Runtime REST endpoint definitions mapped to reviewed implementation handler keys.';
comment on table public.platform_partner_product_access is 'Partner/pilot product entitlements and per-product runtime overrides.';
comment on function public.owner_platform_product_control_snapshot() is 'KleenestOS owner-only integration product, API endpoint, partner entitlement and audit snapshot.';
