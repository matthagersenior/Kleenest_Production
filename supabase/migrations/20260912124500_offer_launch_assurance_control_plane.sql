-- Offer launch assurance and Family pilot coverage.
-- Extends the canonical capability/offer control plane with auditable launch checks.

insert into public.capability_domain_contracts(
  domain,canonical_capability,canonical_rpc,owner_surface,active,notes,
  owner_workspace,owner_route,exposure_state,release_state,requires_surface,source_repos,
  sample_enabled,pilot_enabled,pilot_mode,promise_state
) values
('consumer_family','Consumer Family (5 seats)','family_has_premium_access','consumer',true,
 'Five-seat Family Premium lifecycle: one owner plus up to four additional members with canonical Premium entitlement authority.',
 'consumer-mobile','/family','surface','enabled',true,array['Kleenest_Production'],true,true,'sandbox','pilot')
on conflict(domain) do update set
  canonical_capability=excluded.canonical_capability,
  canonical_rpc=excluded.canonical_rpc,
  owner_surface=excluded.owner_surface,
  owner_workspace=excluded.owner_workspace,
  owner_route=excluded.owner_route,
  exposure_state=excluded.exposure_state,
  release_state=excluded.release_state,
  requires_surface=excluded.requires_surface,
  active=excluded.active,
  notes=excluded.notes,
  sample_enabled=excluded.sample_enabled,
  pilot_enabled=excluded.pilot_enabled,
  pilot_mode=excluded.pilot_mode,
  promise_state=excluded.promise_state,
  updated_at=now();

insert into public.capability_offer_promises(
  offer_key,label,audience,description,required_domains,active,sample_enabled,pilot_enabled,pilot_mode,commercial_state,sample_profile,owner_notes
) values
('consumer_family','Consumer Family','consumer',
 'Family Premium for five total people: one owner plus up to four additional members, each retaining an independent Kleenest account and Premium entitlement.',
 array['consumer_family','preferred_locations','offline_maps','membership_billing'],
 true,true,true,'sandbox','pilot',
 '{"app":"consumer-mobile","entry_route":"/family","demo_route":"/family","seat_limit":5,"scenario":"Five-seat Family Premium lifecycle sample"}'::jsonb,
 'Family is five total users. Pilot/sample is available; production monetization remains gated by canonical Play Billing completion.')
on conflict(offer_key) do update set
  label=excluded.label,
  audience=excluded.audience,
  description=excluded.description,
  required_domains=excluded.required_domains,
  sample_enabled=excluded.sample_enabled,
  pilot_enabled=excluded.pilot_enabled,
  pilot_mode=excluded.pilot_mode,
  commercial_state=excluded.commercial_state,
  sample_profile=excluded.sample_profile,
  owner_notes=excluded.owner_notes,
  active=true,
  updated_at=now();

-- Enrich launch profiles with the real demo/control surfaces that already exist.
update public.capability_offer_promises
set sample_profile=sample_profile || case offer_key
  when 'consumer_network' then '{"app":"consumer-mobile","demo_route":"/explore","real_world_demo":{"scenario":"consumer_network","route":"/explore"}}'::jsonb
  when 'consumer_premium' then '{"app":"consumer-mobile","demo_route":"/membership","real_world_demo":{"scenario":"consumer_premium","route":"/membership"}}'::jsonb
  when 'consumer_family' then '{"app":"consumer-mobile","demo_route":"/family","seat_limit":5,"real_world_demo":{"scenario":"consumer_family","route":"/family"}}'::jsonb
  when 'business_operations' then '{"app":"business-mobile","demo_route":"/demo","real_world_demo":{"scenario":"growth","workspace":"Downtown Coffee & Market","route":"/demo"}}'::jsonb
  when 'business_growth' then '{"app":"business-mobile","demo_route":"/demo","real_world_demo":{"scenario":"growth","workspace":"Downtown Coffee & Market","route":"/demo"}}'::jsonb
  when 'sponsored_promotion' then '{"app":"business-mobile","demo_route":"/demo","real_world_demo":{"scenario":"growth","workspace":"Downtown Coffee & Market","route":"/demo"}}'::jsonb
  when 'qr_engagement' then '{"app":"business-mobile","demo_route":"/demo","real_world_demo":{"scenario":"growth","workspace":"Downtown Coffee & Market","route":"/demo"}}'::jsonb
  when 'fleet_operations' then '{"app":"fleet-mobile","demo_route":"/demo","real_world_demo":{"scenario":"fleet","workspace":"Kleenest Demo Fleet","route":"/demo"}}'::jsonb
  when 'fleet_employee_benefit' then '{"app":"fleet-mobile","demo_route":"/demo","employee_limit":75,"real_world_demo":{"scenario":"fleet","workspace":"Kleenest Demo Fleet","route":"/demo"}}'::jsonb
  when 'enterprise_partnerships' then '{"app":"business-mobile","demo_route":"/demo","real_world_demo":{"scenario":"enterprise","workspace":"Matt Test Business","route":"/demo"}}'::jsonb
  when 'developer_platform' then '{"app":"developer-portal","developer_portal":"https://matthagersenior.github.io/Kleenest_Production/developer/","demo_route":"https://matthagersenior.github.io/Kleenest_Production/developer/","partner_slug":"kleenest-internal-development"}'::jsonb
  else '{}'::jsonb
end,
updated_at=now()
where offer_key in (
  'consumer_network','consumer_premium','consumer_family','business_operations','business_growth',
  'sponsored_promotion','qr_engagement','fleet_operations','fleet_employee_benefit',
  'enterprise_partnerships','developer_platform'
);

create table if not exists public.capability_offer_launch_checks(
  id uuid primary key default gen_random_uuid(),
  offer_key text not null references public.capability_offer_promises(offer_key) on update cascade on delete restrict,
  pilot_session_id uuid references public.capability_pilot_sessions(id) on delete set null,
  check_type text not null,
  status text not null,
  canonical_audit_issue_count integer not null default 0,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  launch_manifest jsonb not null default '{}'::jsonb,
  executed_by uuid,
  created_at timestamptz not null default now(),
  constraint capability_offer_launch_checks_type_check check(check_type in ('sample','pilot','production')),
  constraint capability_offer_launch_checks_status_check check(status in ('passed','blocked'))
);

create index if not exists capability_offer_launch_checks_offer_created_idx
  on public.capability_offer_launch_checks(offer_key,created_at desc);
create index if not exists capability_offer_launch_checks_pilot_created_idx
  on public.capability_offer_launch_checks(pilot_session_id,created_at desc)
  where pilot_session_id is not null;

alter table public.capability_offer_launch_checks enable row level security;
revoke all on table public.capability_offer_launch_checks from public,anon,authenticated;
grant select,insert on table public.capability_offer_launch_checks to service_role;
drop policy if exists capability_offer_launch_checks_client_deny on public.capability_offer_launch_checks;
create policy capability_offer_launch_checks_client_deny on public.capability_offer_launch_checks
  for all to anon,authenticated using(false) with check(false);

create or replace function public.owner_offer_launch_manifest(
  p_offer_key text,
  p_pilot_session_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_offer public.capability_offer_promises%rowtype;
  v_readiness jsonb;
  v_item jsonb;
  v_domains jsonb;
  v_session jsonb;
  v_latest_audit integer:=0;
  v_demo jsonb:=null;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;

  select * into v_offer from public.capability_offer_promises where offer_key=p_offer_key and active;
  if not found then raise exception 'unknown or inactive offer'; end if;

  v_readiness:=public.owner_offer_capability_readiness();
  select value into v_item
  from jsonb_array_elements(v_readiness) value
  where value->>'offer_key'=p_offer_key
  limit 1;
  if v_item is null then raise exception 'offer readiness unavailable'; end if;

  select coalesce(issue_count,0) into v_latest_audit
  from public.capability_audit_runs
  order by created_at desc
  limit 1;
  v_latest_audit:=coalesce(v_latest_audit,0);

  select coalesce(jsonb_agg(jsonb_build_object(
    'domain',c.domain,
    'capability',c.canonical_capability,
    'canonical_rpc',c.canonical_rpc,
    'owner_workspace',c.owner_workspace,
    'owner_route',c.owner_route,
    'release_state',c.release_state,
    'promise_state',c.promise_state,
    'sample_enabled',c.sample_enabled,
    'pilot_enabled',c.pilot_enabled,
    'pilot_mode',c.pilot_mode,
    'rpc_exists',exists(
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=c.canonical_rpc
    )
  ) order by c.domain),'[]'::jsonb)
  into v_domains
  from unnest(v_offer.required_domains) d(domain)
  join public.capability_domain_contracts c on c.domain=d.domain;

  if p_pilot_session_id is not null then
    select jsonb_build_object(
      'id',s.id,'name',s.name,'status',s.status,'organization_name',s.organization_name,
      'contact_name',s.contact_name,'contact_email',s.contact_email,'starts_at',s.starts_at,'ends_at',s.ends_at,
      'sample_profile_snapshot',s.sample_profile_snapshot,'capability_overrides',s.capability_overrides
    ) into v_session
    from public.capability_pilot_sessions s
    where s.id=p_pilot_session_id and s.offer_key=p_offer_key;
    if v_session is null then raise exception 'pilot session not found for offer'; end if;
  end if;

  if p_offer_key in ('business_operations','business_growth','sponsored_promotion','qr_engagement') then
    select jsonb_build_object('scenario','growth','workspace',b.name,'business_id',b.id,'route','/demo')
    into v_demo from public.businesses b
    where b.is_demo_test=true and lower(b.business_tier::text)='growth'
    order by case when b.name='Downtown Coffee & Market' then 0 else 1 end,b.created_at
    limit 1;
  elsif p_offer_key in ('fleet_operations','fleet_employee_benefit') then
    select jsonb_build_object('scenario','fleet','workspace',b.name,'business_id',b.id,'route','/demo')
    into v_demo from public.businesses b
    where b.is_demo_test=true and lower(b.business_tier::text)='fleet'
    order by case when b.name='Kleenest Demo Fleet' then 0 else 1 end,b.created_at
    limit 1;
  elsif p_offer_key='enterprise_partnerships' then
    select jsonb_build_object('scenario','enterprise','workspace',b.name,'business_id',b.id,'route','/demo')
    into v_demo from public.businesses b
    where b.is_demo_test=true and lower(b.business_tier::text)='enterprise'
    order by case when b.name='Matt Test Business' then 0 else 1 end,b.created_at
    limit 1;
  elsif p_offer_key='developer_platform' then
    v_demo:=jsonb_build_object(
      'scenario','developer_platform',
      'developer_portal','https://matthagersenior.github.io/Kleenest_Production/developer/',
      'partner_slug','kleenest-internal-development'
    );
  else
    v_demo:=coalesce(v_offer.sample_profile->'real_world_demo',jsonb_build_object(
      'scenario',p_offer_key,
      'route',coalesce(v_offer.sample_profile->>'demo_route',v_offer.sample_profile->>'entry_route')
    ));
  end if;

  return jsonb_build_object(
    'offer_key',v_offer.offer_key,
    'label',v_offer.label,
    'audience',v_offer.audience,
    'description',v_offer.description,
    'sample_profile',v_offer.sample_profile,
    'pilot_session',v_session,
    'canonical_audit_issue_count',v_latest_audit,
    'readiness',jsonb_build_object(
      'sample_ready',coalesce((v_item->>'sample_ready')::boolean,false),
      'pilot_ready',coalesce((v_item->>'pilot_ready')::boolean,false),
      'production_ready',coalesce((v_item->>'production_ready')::boolean,false),
      'missing_domains',coalesce(v_item->'missing_domains','[]'::jsonb),
      'missing_rpcs',coalesce(v_item->'missing_rpcs','[]'::jsonb),
      'production_gates',coalesce(v_item->'production_gates','[]'::jsonb),
      'surface_gaps',coalesce(v_item->'surface_gaps','[]'::jsonb)
    ),
    'capabilities',v_domains,
    'real_world_demo',v_demo,
    'developer_portal',case when p_offer_key='developer_platform' then 'https://matthagersenior.github.io/Kleenest_Production/developer/' else null end,
    'launch_steps',jsonb_build_array(
      'Run canonical audit',
      'Confirm offer readiness',
      'Open the sample/demo surface',
      'Exercise the required capability list',
      'Capture the launch check as pilot evidence'
    ),
    'generated_at',now()
  );
end;
$function$;

create or replace function public.owner_run_offer_launch_check(
  p_offer_key text,
  p_pilot_session_id uuid default null,
  p_check_type text default 'pilot'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_audit public.capability_audit_runs;
  v_manifest jsonb;
  v_readiness jsonb;
  v_passed boolean:=false;
  v_status text;
  v_session_status text;
  v_id uuid;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  if p_check_type not in ('sample','pilot','production') then raise exception 'invalid launch check type'; end if;

  if p_pilot_session_id is not null then
    select status into v_session_status
    from public.capability_pilot_sessions
    where id=p_pilot_session_id and offer_key=p_offer_key;
    if v_session_status is null then raise exception 'pilot session not found for offer'; end if;
  end if;

  v_audit:=public.run_capability_audit('manual');
  v_manifest:=public.owner_offer_launch_manifest(p_offer_key,p_pilot_session_id);
  v_readiness:=v_manifest->'readiness';

  v_passed:=coalesce(v_audit.issue_count,0)=0 and case p_check_type
    when 'sample' then coalesce((v_readiness->>'sample_ready')::boolean,false)
    when 'pilot' then coalesce((v_readiness->>'pilot_ready')::boolean,false)
    when 'production' then coalesce((v_readiness->>'production_ready')::boolean,false)
    else false
  end;

  if p_check_type='pilot' and p_pilot_session_id is not null and v_session_status not in ('draft','active','paused') then
    v_passed:=false;
  end if;

  v_status:=case when v_passed then 'passed' else 'blocked' end;

  insert into public.capability_offer_launch_checks(
    offer_key,pilot_session_id,check_type,status,canonical_audit_issue_count,readiness_snapshot,launch_manifest,executed_by
  ) values(
    p_offer_key,p_pilot_session_id,p_check_type,v_status,coalesce(v_audit.issue_count,0),
    v_readiness,v_manifest,auth.uid()
  ) returning id into v_id;

  return jsonb_build_object(
    'id',v_id,
    'offer_key',p_offer_key,
    'pilot_session_id',p_pilot_session_id,
    'check_type',p_check_type,
    'status',v_status,
    'passed',v_passed,
    'canonical_audit_issue_count',coalesce(v_audit.issue_count,0),
    'readiness',v_readiness,
    'manifest',v_manifest,
    'created_at',now()
  );
end;
$function$;

create or replace function public.owner_offer_launch_history(
  p_offer_key text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if not public.is_platform_owner_session() then
    raise exception 'platform owner access required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'offer_key',x.offer_key,'offer_label',x.offer_label,'pilot_session_id',x.pilot_session_id,
    'pilot_name',x.pilot_name,'check_type',x.check_type,'status',x.status,
    'canonical_audit_issue_count',x.canonical_audit_issue_count,'readiness',x.readiness_snapshot,
    'launch_manifest',x.launch_manifest,'created_at',x.created_at
  ) order by x.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select c.*,o.label offer_label,s.name pilot_name
    from public.capability_offer_launch_checks c
    join public.capability_offer_promises o on o.offer_key=c.offer_key
    left join public.capability_pilot_sessions s on s.id=c.pilot_session_id
    where p_offer_key is null or c.offer_key=p_offer_key
    order by c.created_at desc
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) x;
  return v_result;
end;
$function$;

revoke all on function public.owner_offer_launch_manifest(text,uuid) from public,anon;
revoke all on function public.owner_run_offer_launch_check(text,uuid,text) from public,anon;
revoke all on function public.owner_offer_launch_history(text,integer) from public,anon;
grant execute on function public.owner_offer_launch_manifest(text,uuid) to authenticated,service_role;
grant execute on function public.owner_run_offer_launch_check(text,uuid,text) to authenticated,service_role;
grant execute on function public.owner_offer_launch_history(text,integer) to authenticated,service_role;

comment on table public.capability_offer_launch_checks is
  'Auditable owner-run proof that a Kleenest offer was sample-, pilot-, or production-ready at a specific point in time.';
comment on function public.owner_run_offer_launch_check(text,uuid,text) is
  'Runs a fresh canonical capability audit and records sample/pilot/production launch readiness evidence for an offer.';
