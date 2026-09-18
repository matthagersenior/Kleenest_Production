create or replace function public.business_tier_qualification_snapshot(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current text;
  v_locations integer;
  v_members integer;
  v_threshold text;
  v_effective text;
  v_fleet boolean;
  v_limit integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_platform_owner_session() and not exists(
    select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()
  ) then raise exception 'Business membership required'; end if;

  select lower(coalesce(b.business_tier::text,'standard')) into v_current from public.businesses b where b.id=p_business_id;
  if v_current is null then raise exception 'Business not found'; end if;
  select count(*)::integer into v_locations from public.locations l where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true);
  select count(*)::integer into v_members from public.business_members bm where bm.business_id=p_business_id;

  v_threshold := case when v_locations>5 then 'enterprise' when v_locations<=5 and v_members>5 then 'growth' else 'standard' end;
  v_effective := case when v_current='enterprise' then 'enterprise' when v_current in ('growth','fleet') then 'growth' else 'standard' end;
  v_fleet := v_effective in ('growth','enterprise');
  v_limit := case when v_effective='standard' then 1 when v_effective='growth' then 5 else null end;

  return jsonb_build_object(
    'business_id',p_business_id,
    'current_tier',v_current,
    'effective_plan',v_effective,
    'threshold_plan',v_threshold,
    'location_count',v_locations,
    'member_count',v_members,
    'location_limit',v_limit,
    'fleet_included',v_fleet,
    'growth_qualifies',(v_members>5 and v_locations<=5),
    'enterprise_qualifies',(v_locations>5),
    'upgrade_required',case when v_threshold='enterprise' then v_effective<>'enterprise' when v_threshold='growth' then v_effective='standard' else false end,
    'qualification_reason',case when v_locations>5 then 'More than 5 active locations requires Enterprise + Fleet.' when v_members>5 then 'More than 5 business users qualifies for Business Growth + Fleet.' else 'Business Standard thresholds are currently satisfied.' end,
    'enterprise_location_user_limit',5
  );
end;
$$;
revoke all on function public.business_tier_qualification_snapshot(uuid) from public,anon;
grant execute on function public.business_tier_qualification_snapshot(uuid) to authenticated,service_role;

create or replace function public.business_tier_capability_matrix(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare s jsonb; p text;
begin
  s:=public.business_tier_qualification_snapshot(p_business_id);
  p:=s->>'effective_plan';
  return jsonb_build_object(
    'plan',p,
    'standard',jsonb_build_object(
      'profile',true,'locations_basic',true,'reviews_and_replies',true,'qr_basic',true,'notifications_basic',true,'analytics_basic',true,'operations_basic',true,'support',true,'privacy_account',true
    ),
    'growth',jsonb_build_object(
      'enabled',p in ('growth','enterprise'),'fleet',p in ('growth','enterprise'),'campaigns',p in ('growth','enterprise'),'contests',p in ('growth','enterprise'),'challenges',p in ('growth','enterprise'),'missions',p in ('growth','enterprise'),'journeys',p in ('growth','enterprise'),'games',p in ('growth','enterprise'),'photos_media',p in ('growth','enterprise'),'qr_studio',p in ('growth','enterprise'),'advanced_analytics',p in ('growth','enterprise'),'intelligence',p in ('growth','enterprise'),'live_network',p in ('growth','enterprise'),'partner_programs',p in ('growth','enterprise'),'progression',p in ('growth','enterprise'),'certifications',p in ('growth','enterprise'),'custom_notifications',p in ('growth','enterprise')
    ),
    'enterprise',jsonb_build_object(
      'enabled',p='enterprise','multi_location_command',p='enterprise','per_location_staff',p='enterprise','per_location_feature_config',p='enterprise','cross_location_comparison',p='enterprise','intracompany_cooperation',p='enterprise','enterprise_networks',p='enterprise','partner_campaigns',p='enterprise','allocations',p='enterprise','cross_location_intelligence',p='enterprise','portfolio_fleet',p='enterprise'
    ),
    'qualification',s
  );
end;
$$;
revoke all on function public.business_tier_capability_matrix(uuid) from public,anon;
grant execute on function public.business_tier_capability_matrix(uuid) to authenticated,service_role;

create table if not exists public.enterprise_location_staff_assignments(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check(role in ('employee','manager','admin','owner')),
  capability_overrides jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(location_id,user_id)
);
alter table public.enterprise_location_staff_assignments enable row level security;
revoke all on table public.enterprise_location_staff_assignments from public,anon,authenticated;
grant all on table public.enterprise_location_staff_assignments to service_role;

create table if not exists public.enterprise_location_feature_configs(
  location_id uuid primary key references public.locations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.enterprise_location_feature_configs enable row level security;
revoke all on table public.enterprise_location_feature_configs from public,anon,authenticated;
grant all on table public.enterprise_location_feature_configs to service_role;

create or replace function public.enterprise_location_feature_defaults()
returns jsonb
language sql
immutable
set search_path=''
as $$
select jsonb_build_object(
  'campaigns',true,'challenges',true,'contests',true,'missions',true,'journeys',true,'games',true,
  'notifications',true,'photos',true,'qr',true,'live_network',true,'fleet',true,'custom_metrics',true,
  'shared_learning',true,'intelligence',true,'local_promotions',true,'local_events',true
);
$$;

create or replace function public.enterprise_location_role_capabilities(p_role text)
returns jsonb
language sql
immutable
set search_path=''
as $$
select case lower(coalesce(p_role,''))
 when 'employee' then jsonb_build_object('view_location',true,'complete_tasks',true,'upload_photos',true,'receive_notifications',true,'record_service_evidence',true)
 when 'manager' then jsonb_build_object('view_location',true,'complete_tasks',true,'upload_photos',true,'receive_notifications',true,'record_service_evidence',true,'configure_location',true,'manage_engagement',true,'view_analytics',true,'manage_local_fleet',true,'assign_employee_work',true)
 when 'admin' then jsonb_build_object('view_location',true,'complete_tasks',true,'upload_photos',true,'receive_notifications',true,'record_service_evidence',true,'configure_location',true,'manage_engagement',true,'view_analytics',true,'manage_local_fleet',true,'assign_employee_work',true,'manage_location_staff',true,'manage_cross_location_programs',true,'view_enterprise_intelligence',true)
 when 'owner' then jsonb_build_object('view_location',true,'complete_tasks',true,'upload_photos',true,'receive_notifications',true,'record_service_evidence',true,'configure_location',true,'manage_engagement',true,'view_analytics',true,'manage_local_fleet',true,'assign_employee_work',true,'manage_location_staff',true,'manage_cross_location_programs',true,'view_enterprise_intelligence',true,'manage_enterprise_networks',true,'manage_ownership',true)
 else '{}'::jsonb end;
$$;

create or replace function public.enterprise_manage_location_staff(
  p_business_id uuid,p_location_id uuid,p_user_id uuid,p_role text,p_action text default 'upsert',p_capability_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v public.enterprise_location_staff_assignments; v_count integer; v_business_role text;
begin
  if not public.business_enterprise_authorized(p_business_id) then raise exception 'Enterprise management access required'; end if;
  if not exists(select 1 from public.locations l where l.id=p_location_id and coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true)) then raise exception 'Location does not belong to this Enterprise business'; end if;
  if p_action='remove' then
    update public.enterprise_location_staff_assignments set active=false,updated_at=now() where business_id=p_business_id and location_id=p_location_id and user_id=p_user_id returning * into v;
    if v.id is null then raise exception 'Location staff assignment not found'; end if;
    return to_jsonb(v);
  end if;
  if lower(coalesce(p_role,'')) not in ('employee','manager','admin','owner') then raise exception 'Enterprise location role must be employee, manager, admin, or owner'; end if;
  select bm.role::text into v_business_role from public.business_members bm where bm.business_id=p_business_id and bm.user_id=p_user_id;
  if v_business_role is null then raise exception 'User must first be a member of this business'; end if;
  if p_role='owner' and v_business_role<>'owner' then raise exception 'Only the business owner may hold the location owner role'; end if;
  if p_role='admin' and v_business_role not in ('owner','admin') then raise exception 'Location admin requires business owner/admin membership'; end if;
  if p_role='manager' and v_business_role not in ('owner','admin','manager') then raise exception 'Location manager requires business manager-or-higher membership'; end if;
  select count(*)::integer into v_count from public.enterprise_location_staff_assignments a where a.location_id=p_location_id and a.active and a.user_id<>p_user_id;
  if v_count>=5 then raise exception 'ENTERPRISE_LOCATION_USER_LIMIT_REACHED'; end if;
  insert into public.enterprise_location_staff_assignments(business_id,location_id,user_id,role,capability_overrides,active,created_by,updated_at)
  values(p_business_id,p_location_id,p_user_id,lower(p_role),coalesce(p_capability_overrides,'{}'::jsonb),true,auth.uid(),now())
  on conflict(location_id,user_id) do update set role=excluded.role,capability_overrides=excluded.capability_overrides,active=true,updated_at=now()
  returning * into v;
  return to_jsonb(v)||jsonb_build_object('effective_capabilities',public.enterprise_location_role_capabilities(v.role)||v.capability_overrides);
end;
$$;
revoke all on function public.enterprise_manage_location_staff(uuid,uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.enterprise_manage_location_staff(uuid,uuid,uuid,text,text,jsonb) to authenticated,service_role;

create or replace function public.enterprise_list_location_staff(p_business_id uuid,p_location_id uuid default null)
returns table(id uuid,location_id uuid,location_name text,user_id uuid,display_name text,username text,role text,effective_capabilities jsonb,active boolean,updated_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_enterprise_authorized(p_business_id) and not exists(
    select 1 from public.enterprise_location_staff_assignments a where a.business_id=p_business_id and a.user_id=auth.uid() and a.active and (p_location_id is null or a.location_id=p_location_id)
  ) then raise exception 'Enterprise location access required'; end if;
  return query
  select a.id,a.location_id,l.name,a.user_id,pr.display_name,pr.username,a.role,public.enterprise_location_role_capabilities(a.role)||a.capability_overrides,a.active,a.updated_at
  from public.enterprise_location_staff_assignments a
  join public.locations l on l.id=a.location_id
  left join public.profiles pr on pr.id=a.user_id
  where a.business_id=p_business_id and a.active and (p_location_id is null or a.location_id=p_location_id)
  order by l.name,case a.role when 'owner' then 0 when 'admin' then 1 when 'manager' then 2 else 3 end,coalesce(pr.display_name,pr.username,a.user_id::text);
end;
$$;
revoke all on function public.enterprise_list_location_staff(uuid,uuid) from public,anon;
grant execute on function public.enterprise_list_location_staff(uuid,uuid) to authenticated,service_role;

create or replace function public.enterprise_list_location_configs(p_business_id uuid)
returns table(location_id uuid,location_name text,city text,state text,config jsonb,staff_count bigint,updated_at timestamptz)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.business_enterprise_authorized(p_business_id) and not exists(select 1 from public.enterprise_location_staff_assignments a where a.business_id=p_business_id and a.user_id=auth.uid() and a.active) then raise exception 'Enterprise location access required'; end if;
  return query
  select l.id,l.name,l.city,l.state,public.enterprise_location_feature_defaults()||coalesce(c.config,'{}'::jsonb),
    (select count(*) from public.enterprise_location_staff_assignments a where a.location_id=l.id and a.active),c.updated_at
  from public.locations l
  left join public.enterprise_location_feature_configs c on c.location_id=l.id
  where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true)
  order by l.name;
end;
$$;
revoke all on function public.enterprise_list_location_configs(uuid) from public,anon;
grant execute on function public.enterprise_list_location_configs(uuid) to authenticated,service_role;

create or replace function public.enterprise_update_location_config(p_business_id uuid,p_location_id uuid,p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_allowed boolean; v_role text; v jsonb;
begin
  if public.business_enterprise_authorized(p_business_id) then v_allowed:=true;
  else
    select a.role into v_role from public.enterprise_location_staff_assignments a where a.business_id=p_business_id and a.location_id=p_location_id and a.user_id=auth.uid() and a.active limit 1;
    v_allowed:=v_role in ('manager','admin','owner');
  end if;
  if not coalesce(v_allowed,false) then raise exception 'Location manager-or-higher access required'; end if;
  if not exists(select 1 from public.locations l where l.id=p_location_id and coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true)) then raise exception 'Location does not belong to this Enterprise business'; end if;
  v:=public.enterprise_location_feature_defaults()||coalesce(p_config,'{}'::jsonb);
  insert into public.enterprise_location_feature_configs(location_id,business_id,config,updated_by,updated_at)
  values(p_location_id,p_business_id,v,auth.uid(),now())
  on conflict(location_id) do update set config=excluded.config,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  return jsonb_build_object('location_id',p_location_id,'config',v,'updated_at',now());
end;
$$;
revoke all on function public.enterprise_update_location_config(uuid,uuid,jsonb) from public,anon;
grant execute on function public.enterprise_update_location_config(uuid,uuid,jsonb) to authenticated,service_role;

create or replace function public.enterprise_location_comparison_snapshot(p_business_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_start timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_window_days,30),365))); v jsonb;
begin
  if not public.business_enterprise_authorized(p_business_id) then raise exception 'Enterprise access required'; end if;
  with rows as (
    select l.id,l.name,l.city,l.state,l.rating,l.review_count,
      (select count(*) from public.location_visits x where x.location_id=l.id and x.occurred_at>=v_start)::bigint visits,
      (select count(*) from public.check_ins x where x.location_id=l.id and x.checked_in_at>=v_start)::bigint check_ins,
      (select count(*) from public.reviews x where x.location_id=l.id and x.created_at>=v_start and x.status::text<>'hidden')::bigint reviews,
      coalesce((select avg(x.stars)::numeric from public.reviews x where x.location_id=l.id and x.created_at>=v_start and x.status::text<>'hidden'),0)::numeric avg_rating,
      (select count(*) from public.location_photos x where x.location_id=l.id and x.created_at>=v_start)::bigint photos,
      (select count(*) from public.business_events x where x.location_id=l.id and x.business_id=p_business_id and x.event_date>=v_start::date)::bigint events,
      (select count(*) from public.enterprise_location_staff_assignments a where a.location_id=l.id and a.active)::bigint staff_count
    from public.locations l where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true)
  )
  select jsonb_build_object(
    'business_id',p_business_id,'window_days',greatest(1,least(coalesce(p_window_days,30),365)),
    'locations',coalesce(jsonb_agg(jsonb_build_object('location_id',id,'name',name,'city',city,'state',state,'visits',visits,'check_ins',check_ins,'reviews',reviews,'average_rating',round(avg_rating,2),'photos',photos,'events',events,'staff_count',staff_count) order by check_ins desc,visits desc),'[]'::jsonb),
    'generated_at',now()) into v from rows;
  return v;
end;
$$;
revoke all on function public.enterprise_location_comparison_snapshot(uuid,integer) from public,anon;
grant execute on function public.enterprise_location_comparison_snapshot(uuid,integer) to authenticated,service_role;

create or replace function public.enterprise_intracompany_opportunities(p_business_id uuid,p_window_days integer default 30)
returns table(source_location_id uuid,source_name text,target_location_id uuid,target_name text,opportunity_type text,score numeric,reason text)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_start timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_window_days,30),365)));
begin
  if not public.business_enterprise_authorized(p_business_id) then raise exception 'Enterprise access required'; end if;
  return query
  with m as (
    select l.id,l.name,l.city,l.state,coalesce(l.rating,0)::numeric rating,
      (select count(*) from public.check_ins c where c.location_id=l.id and c.checked_in_at>=v_start)::numeric checkins,
      (select count(*) from public.location_photos p where p.location_id=l.id and p.created_at>=v_start)::numeric photos
    from public.locations l where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true)
  ), pairs as (
    select a.id aid,a.name aname,b.id bid,b.name bname,
      case when a.rating>=b.rating+1 then 'quality_coaching' when a.checkins>=greatest(10,b.checkins*2) then 'engagement_playbook' when a.photos>=greatest(5,b.photos*2) then 'media_cooperation' else 'shared_campaign' end typ,
      least(100::numeric,
        25 + case when a.state=b.state then 20 else 0 end + case when a.city=b.city then 20 else 0 end + least(20,abs(a.rating-b.rating)*10) + least(15,abs(a.checkins-b.checkins)/5))::numeric score,
      case when a.rating>=b.rating+1 then a.name||' can share quality practices with '||b.name
           when a.checkins>=greatest(10,b.checkins*2) then a.name||' has stronger engagement that can inform '||b.name
           when a.photos>=greatest(5,b.photos*2) then a.name||' has a stronger media cadence that can be reused by '||b.name
           else a.name||' and '||b.name||' are feasible candidates for a shared intracompany campaign' end reason
    from m a join m b on a.id<>b.id
  )
  select aid,aname,bid,bname,typ,round(score,1),reason from pairs order by score desc limit 25;
end;
$$;
revoke all on function public.enterprise_intracompany_opportunities(uuid,integer) from public,anon;
grant execute on function public.enterprise_intracompany_opportunities(uuid,integer) to authenticated,service_role;

create or replace function public.enterprise_network_opportunity_snapshot(p_business_id uuid,p_window_days integer default 30)
returns table(candidate_business_id uuid,candidate_name text,location_overlap bigint,engagement_events bigint,already_connected boolean,fit_score numeric,reason text)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_start timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_window_days,30),365)));
begin
  if not public.business_enterprise_authorized(p_business_id) then raise exception 'Enterprise access required'; end if;
  return query
  with owner_geo as (
    select distinct upper(coalesce(l.state,'')) state,lower(coalesce(l.city,'')) city from public.locations l where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true)
  ), candidates as (
    select b.id,b.name,
      count(*) filter(where exists(select 1 from owner_geo g where g.state=upper(coalesce(l.state,'')) and (g.city=lower(coalesce(l.city,'')) or g.city='')))::bigint overlap,
      (select count(*) from public.business_engagement_attributions e where e.business_id=b.id and e.created_at>=v_start)::bigint engagement,
      exists(select 1 from public.enterprise_partner_networks n join public.enterprise_partner_network_members m on m.network_id=n.id where n.owner_business_id=p_business_id and m.partner_business_id=b.id and m.status='active') connected
    from public.businesses b join public.locations l on coalesce(l.claimed_business_id,l.business_id)=b.id and coalesce(l.is_active,true)
    where b.id<>p_business_id and coalesce(b.is_demo_test,false)=false
    group by b.id,b.name
  )
  select c.id,c.name,c.overlap,c.engagement,c.connected,
    round(least(100::numeric,(c.overlap*20 + least(c.engagement,40) + case when c.connected then 20 else 0 end)::numeric),1),
    case when c.connected then 'Existing partner with current location/engagement evidence.' when c.overlap>0 and c.engagement>0 then 'Geographic overlap and active engagement indicate a feasible network relationship.' when c.overlap>0 then 'Location overlap indicates a feasible cooperation area.' when c.engagement>0 then 'Engagement activity suggests a potential intelligence-led partnership.' else 'Low-evidence candidate; inspect before inviting.' end
  from candidates c where c.overlap>0 or c.engagement>0 or c.connected order by (c.overlap*20 + least(c.engagement,40) + case when c.connected then 20 else 0 end) desc,c.name limit 25;
end;
$$;
revoke all on function public.enterprise_network_opportunity_snapshot(uuid,integer) from public,anon;
grant execute on function public.enterprise_network_opportunity_snapshot(uuid,integer) to authenticated,service_role;

create or replace function public.get_business_product_access(p_business_id uuid)
returns table(business_id uuid,plan text,location_count integer,location_limit integer,enterprise_enabled boolean,fleet_enabled boolean,is_admin boolean)
language sql
security definer
set search_path=''
as $$
with owner_access as (select public.is_platform_owner_session() allowed),
member_access as (select exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) allowed),
b as (select x.id,coalesce(x.business_tier::text,'standard') tier from public.businesses x where x.id=p_business_id),
account_entitlement as (
 select a.service_tier,a.location_limit,a.enterprise_fleet_enabled,a.fleet_enabled from public.business_members bm join public.account_service_entitlements a on a.account_user_id=bm.user_id
 where bm.business_id=p_business_id and lower(bm.role::text) in ('owner','admin','manager')
 order by case when bm.user_id=auth.uid() then 0 else 1 end,case when lower(bm.role::text)='owner' then 0 else 1 end,bm.created_at,a.updated_at desc limit 1
),
resolved as (
 select b.id,b.tier,coalesce(ae.service_tier,case when b.tier='enterprise' then 'enterprise' when b.tier in ('growth','fleet') then 'growth' else 'business' end) service_tier,
 ae.location_limit entitlement_location_limit,coalesce(ae.enterprise_fleet_enabled,false) enterprise_fleet_enabled,coalesce(ae.fleet_enabled,false) entitlement_fleet_enabled from b left join account_entitlement ae on true
),
lc as (select count(*)::integer n from public.locations l where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true))
select r.id,r.tier,lc.n,
 case when oa.allowed then null when r.service_tier='enterprise' or r.tier='enterprise' then null when r.entitlement_location_limit is not null then r.entitlement_location_limit when r.service_tier='growth' or r.tier in ('growth','fleet') then 5 else 1 end,
 (r.service_tier='enterprise' or r.tier='enterprise' or oa.allowed),
 (r.entitlement_fleet_enabled or r.enterprise_fleet_enabled or r.service_tier in ('growth','fleet','enterprise') or r.tier in ('growth','fleet','enterprise') or oa.allowed),
 oa.allowed from resolved r,lc,owner_access oa,member_access ma where ma.allowed or oa.allowed;
$$;

create or replace function public.get_business_service_entitlement(p_business_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
select jsonb_build_object('business_id',b.id,'business_tier',b.business_tier::text,
 'service_tier',coalesce(ase.service_tier,case when b.business_tier::text='enterprise' then 'enterprise' when b.business_tier::text in ('growth','fleet') then 'growth' else 'business' end),
 'location_limit',coalesce(ase.location_limit,case when b.business_tier::text in ('growth','fleet') then 5 when b.business_tier::text='standard' then 1 else null end),
 'enterprise_fleet_enabled',coalesce(ase.enterprise_fleet_enabled,b.business_tier::text='enterprise'),
 'fleet_enabled',coalesce(ase.fleet_enabled,b.business_tier::text in ('growth','fleet','enterprise')))
from public.businesses b left join lateral (
 select a.* from public.business_members bm join public.account_service_entitlements a on a.account_user_id=bm.user_id
 where bm.business_id=b.id and bm.role::text in ('owner','admin') order by case when bm.user_id=auth.uid() then 0 else 1 end,case when bm.role::text='owner' then 0 else 1 end,bm.created_at,a.updated_at desc limit 1
) ase on true
where b.id=p_business_id and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=b.id and bm.user_id=auth.uid()));
$$;

create or replace function public.business_invite_member(p_business_id uuid,p_user_id uuid,p_role public.business_member_role default 'staff'::public.business_member_role)
returns public.business_members
language plpgsql
security definer
set search_path=''
as $$
declare v public.business_members; v_tier text; v_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_role='owner' then raise exception 'Owner role requires ownership transfer'; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='owner') and not public.is_platform_owner_session() then raise exception 'Only the business owner can manage members'; end if;
 if exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_user_id) then raise exception 'User is already a member'; end if;
 select lower(b.business_tier::text) into v_tier from public.businesses b where b.id=p_business_id;
 select count(*)::integer into v_count from public.business_members bm where bm.business_id=p_business_id;
 if coalesce(v_tier,'standard')='standard' and v_count>=5 then raise exception 'GROWTH_REQUIRED_FOR_MORE_THAN_5_USERS'; end if;
 insert into public.business_members(business_id,user_id,role) values(p_business_id,p_user_id,p_role) returning * into v;
 return v;
end;
$$;
revoke all on function public.business_invite_member(uuid,uuid,public.business_member_role) from public,anon;
grant execute on function public.business_invite_member(uuid,uuid,public.business_member_role) to authenticated,service_role;

create or replace function public.business_manage_location(p_business_id uuid,p_location_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r public.locations; v_limit integer; v_count integer;
begin
 if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
 if p_action='create' then
   select a.location_limit into v_limit from public.get_business_product_access(p_business_id) a limit 1;
   select count(*)::integer into v_count from public.locations l where coalesce(l.claimed_business_id,l.business_id)=p_business_id and coalesce(l.is_active,true);
   if v_limit is not null and v_count>=v_limit then raise exception 'LOCATION_LIMIT_REACHED_UPGRADE_REQUIRED'; end if;
   insert into public.locations(business_id,name,address,city,state,postal_code,country,latitude,longitude,description,phone,website,is_active,is_premium,accessible,changing_table,source,verification_status,created_by)
   values(p_business_id,coalesce(p_payload->>'name','New Location'),p_payload->>'address',p_payload->>'city',p_payload->>'state',p_payload->>'postal_code',coalesce(p_payload->>'country','US'),nullif(p_payload->>'latitude','')::double precision,nullif(p_payload->>'longitude','')::double precision,p_payload->>'description',p_payload->>'phone',p_payload->>'website',coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'is_premium')::boolean,false),coalesce((p_payload->>'accessible')::boolean,false),coalesce((p_payload->>'changing_table')::boolean,false),'business','pending',auth.uid()) returning * into r;
 elsif p_action='update' then
   update public.locations set name=coalesce(p_payload->>'name',name),address=coalesce(p_payload->>'address',address),city=coalesce(p_payload->>'city',city),state=coalesce(p_payload->>'state',state),description=coalesce(p_payload->>'description',description),phone=coalesce(p_payload->>'phone',phone),website=coalesce(p_payload->>'website',website),is_active=coalesce((p_payload->>'is_active')::boolean,is_active),is_premium=coalesce((p_payload->>'is_premium')::boolean,is_premium),updated_at=now() where id=p_location_id and coalesce(claimed_business_id,business_id)=p_business_id returning * into r;
 elsif p_action='deactivate' then
   update public.locations set is_active=false,updated_at=now() where id=p_location_id and coalesce(claimed_business_id,business_id)=p_business_id returning * into r;
 else raise exception 'Unsupported location action'; end if;
 if r.id is null then raise exception 'Location not found'; end if;
 return to_jsonb(r);
end;
$$;

insert into public.capability_function_classifications(function_signature,domain,classification,rationale,created_at,updated_at) values
('business_tier_qualification_snapshot(p_business_id uuid)','business_management','canonical','Canonical Standard/Growth/Enterprise qualification, thresholds and Fleet inclusion.',now(),now()),
('business_tier_capability_matrix(p_business_id uuid)','business_management','canonical','Canonical tier capability matrix for Standard, Growth and Enterprise UX.',now(),now()),
('enterprise_location_feature_defaults()','enterprise_partnerships','supporting','Shared Enterprise per-location feature defaults.',now(),now()),
('enterprise_location_role_capabilities(p_role text)','enterprise_partnerships','supporting','Shared Enterprise employee/manager/admin/owner capability defaults.',now(),now()),
('enterprise_manage_location_staff(p_business_id uuid, p_location_id uuid, p_user_id uuid, p_role text, p_action text, p_capability_overrides jsonb)','enterprise_partnerships','canonical','Manage Enterprise per-location staff with five-user cap and scoped capabilities.',now(),now()),
('enterprise_list_location_staff(p_business_id uuid, p_location_id uuid)','enterprise_partnerships','canonical','List Enterprise per-location staff and effective capabilities.',now(),now()),
('enterprise_list_location_configs(p_business_id uuid)','enterprise_partnerships','canonical','List Enterprise per-location engagement and operating configuration.',now(),now()),
('enterprise_update_location_config(p_business_id uuid, p_location_id uuid, p_config jsonb)','enterprise_partnerships','canonical','Configure campaigns, challenges, contests, missions, journeys, games, notifications, photos, Fleet and intelligence per location.',now(),now()),
('enterprise_location_comparison_snapshot(p_business_id uuid, p_window_days integer)','enterprise_partnerships','canonical','Cross-location Enterprise operating and engagement comparison.',now(),now()),
('enterprise_intracompany_opportunities(p_business_id uuid, p_window_days integer)','enterprise_partnerships','canonical','Intelligence-led intracompany cooperation opportunities.',now(),now()),
('enterprise_network_opportunity_snapshot(p_business_id uuid, p_window_days integer)','enterprise_partnerships','canonical','Intelligence, engagement, cooperation, feasibility and location-based network candidate analysis.',now(),now())
on conflict(function_signature) do update set domain=excluded.domain,classification=excluded.classification,rationale=excluded.rationale,updated_at=now();
