-- Canonical Business/Enterprise capability authority and least-privilege hardening.
-- This is the exact migration form verified against Kleenest Production.

create or replace function public.business_capability_allowed(p_business_id uuid,p_capability text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare v_matrix jsonb; v_scope text:=split_part(lower(trim(coalesce(p_capability,''))),'.',1); v_key text:=split_part(lower(trim(coalesce(p_capability,''))),'.',2); v_value text;
begin
  if auth.uid() is null then return false; end if;
  if not public.business_can_manage(p_business_id) then return false; end if;
  if public.is_platform_owner_session() then return true; end if;
  if v_scope not in ('standard','growth','enterprise') or coalesce(v_key,'')='' then return false; end if;
  v_matrix:=public.business_tier_capability_matrix(p_business_id);
  v_value:=v_matrix->v_scope->>v_key;
  return coalesce(v_value::boolean,false);
exception when others then return false;
end $$;
revoke all on function public.business_capability_allowed(uuid,text) from public,anon;
grant execute on function public.business_capability_allowed(uuid,text) to authenticated,service_role;

create or replace function public.business_enterprise_authorized(p_business_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select public.business_capability_allowed(p_business_id,'enterprise.enabled'); $$;
revoke all on function public.business_enterprise_authorized(uuid) from public,anon;
grant execute on function public.business_enterprise_authorized(uuid) to authenticated,service_role;

create or replace function public.enterprise_partner_capability_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_business_id uuid; v_network_id uuid; v_campaign_id uuid; v_capability text; v_allowed boolean;
begin
  if coalesce(auth.role(),'')='service_role' then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name='enterprise_partner_networks' then
    v_business_id:=case when tg_op='DELETE' then old.owner_business_id else new.owner_business_id end; v_capability:='enterprise.enterprise_networks';
  elsif tg_table_name in ('enterprise_partner_network_members','enterprise_partner_network_metrics') then
    v_network_id:=case when tg_op='DELETE' then old.network_id else new.network_id end;
    select n.owner_business_id into v_business_id from public.enterprise_partner_networks n where n.id=v_network_id; v_capability:='enterprise.enterprise_networks';
  elsif tg_table_name='enterprise_partner_campaigns' then
    v_network_id:=case when tg_op='DELETE' then old.network_id else new.network_id end;
    select n.owner_business_id into v_business_id from public.enterprise_partner_networks n where n.id=v_network_id; v_capability:='enterprise.partner_campaigns';
  elsif tg_table_name='enterprise_partner_allocations' then
    v_network_id:=case when tg_op='DELETE' then old.network_id else new.network_id end;
    select n.owner_business_id into v_business_id from public.enterprise_partner_networks n where n.id=v_network_id; v_capability:='enterprise.allocations';
  elsif tg_table_name='enterprise_partner_campaign_outcomes' then
    v_campaign_id:=case when tg_op='DELETE' then old.campaign_id else new.campaign_id end;
    select n.owner_business_id into v_business_id from public.enterprise_partner_campaigns c join public.enterprise_partner_networks n on n.id=c.network_id where c.id=v_campaign_id; v_capability:='enterprise.partner_campaigns';
  else raise exception 'Unsupported Enterprise guarded table %',tg_table_name;
  end if;
  v_allowed:=public.business_capability_allowed(v_business_id,v_capability) and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=v_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin')));
  if not coalesce(v_allowed,false) then raise exception 'Enterprise capability required for %',v_capability; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.enterprise_partner_capability_guard() from public,anon,authenticated;

drop trigger if exists enterprise_partner_networks_enterprise_guard on public.enterprise_partner_networks;
create trigger enterprise_partner_networks_enterprise_guard before insert or update or delete on public.enterprise_partner_networks for each row execute function public.enterprise_partner_capability_guard();
drop trigger if exists enterprise_partner_network_members_enterprise_guard on public.enterprise_partner_network_members;
create trigger enterprise_partner_network_members_enterprise_guard before insert or update or delete on public.enterprise_partner_network_members for each row execute function public.enterprise_partner_capability_guard();
drop trigger if exists enterprise_partner_campaigns_enterprise_guard on public.enterprise_partner_campaigns;
create trigger enterprise_partner_campaigns_enterprise_guard before insert or update or delete on public.enterprise_partner_campaigns for each row execute function public.enterprise_partner_capability_guard();
drop trigger if exists enterprise_partner_allocations_enterprise_guard on public.enterprise_partner_allocations;
create trigger enterprise_partner_allocations_enterprise_guard before insert or update or delete on public.enterprise_partner_allocations for each row execute function public.enterprise_partner_capability_guard();
drop trigger if exists enterprise_partner_campaign_outcomes_enterprise_guard on public.enterprise_partner_campaign_outcomes;
create trigger enterprise_partner_campaign_outcomes_enterprise_guard before insert or update or delete on public.enterprise_partner_campaign_outcomes for each row execute function public.enterprise_partner_capability_guard();
drop trigger if exists enterprise_partner_network_metrics_enterprise_guard on public.enterprise_partner_network_metrics;
create trigger enterprise_partner_network_metrics_enterprise_guard before insert or update or delete on public.enterprise_partner_network_metrics for each row execute function public.enterprise_partner_capability_guard();

create or replace function public.enterprise_list_owned_networks(p_business_id uuid) returns setof public.enterprise_partner_networks language sql stable security definer set search_path=''
as $$ select n.* from public.enterprise_partner_networks n where n.owner_business_id=p_business_id and public.business_capability_allowed(p_business_id,'enterprise.enterprise_networks') and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))) order by n.created_at desc; $$;
create or replace function public.enterprise_list_partner_businesses(p_business_id uuid) returns table(id uuid,name text,business_tier text) language sql stable security definer set search_path=''
as $$ select b.id,b.name,b.business_tier::text from public.businesses b where b.id<>p_business_id and public.business_capability_allowed(p_business_id,'enterprise.enterprise_networks') and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))) order by b.name; $$;
create or replace function public.enterprise_list_network_members(p_network_id uuid) returns table(id uuid,network_id uuid,partner_business_id uuid,partner_business_name text,status text,created_at timestamptz) language sql stable security definer set search_path=''
as $$ select m.id,m.network_id,m.partner_business_id,b.name,m.status,m.created_at from public.enterprise_partner_network_members m join public.enterprise_partner_networks n on n.id=m.network_id join public.businesses b on b.id=m.partner_business_id where m.network_id=p_network_id and public.business_capability_allowed(n.owner_business_id,'enterprise.enterprise_networks') and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))) order by m.created_at; $$;
create or replace function public.enterprise_list_network_campaigns(p_network_id uuid) returns setof public.enterprise_partner_campaigns language sql stable security definer set search_path=''
as $$ select c.* from public.enterprise_partner_campaigns c join public.enterprise_partner_networks n on n.id=c.network_id where c.network_id=p_network_id and public.business_capability_allowed(n.owner_business_id,'enterprise.partner_campaigns') and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))) order by c.created_at desc; $$;

create or replace function public.get_partner_campaign_roi(p_campaign_id uuid,p_start date default current_date-30,p_end date default current_date)
returns table(partner_business_id uuid,visits bigint,check_ins bigint,reviews bigint,preferred_uses bigint,access_redemptions bigint,promotion_redemptions bigint,attributed_users bigint,points_awarded bigint,engagement_score numeric,conversion_rate numeric)
language sql security definer set search_path=''
as $$ select o.partner_business_id,sum(o.visits),sum(o.check_ins),sum(o.reviews),sum(o.preferred_uses),sum(o.access_redemptions),sum(o.promotion_redemptions),sum(o.attributed_users),sum(o.points_awarded),round((sum(o.check_ins)*.25+sum(o.reviews)*.15+sum(o.preferred_uses)*.2+sum(o.access_redemptions)*.2+sum(o.promotion_redemptions)*.2)::numeric,2),round(case when sum(o.visits)>0 then sum(o.check_ins)::numeric/sum(o.visits)*100 else 0 end,2) from public.enterprise_partner_campaign_outcomes o join public.enterprise_partner_campaigns c on c.id=o.campaign_id join public.enterprise_partner_networks n on n.id=c.network_id where o.campaign_id=p_campaign_id and o.metric_date between p_start and p_end and public.business_capability_allowed(n.owner_business_id,'enterprise.partner_campaigns') and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))) group by o.partner_business_id order by 10 desc; $$;

create or replace function public.get_partner_network_benchmark(p_network_id uuid,p_start date default current_date-30,p_end date default current_date)
returns table(partner_business_id uuid,partner_visits bigint,partner_checkins bigint,partner_reviews bigint,partner_preferred bigint,partner_access bigint,partner_promotions bigint,checkin_rate numeric,review_rate numeric,engagement_score numeric)
language sql security definer set search_path=''
as $$ with m as (select o.partner_business_id,sum(o.visits) visits,sum(o.check_ins) checkins,sum(o.reviews) reviews,sum(o.preferred_uses) preferred,sum(o.access_redemptions) access,sum(o.promotion_redemptions) promotions from public.enterprise_partner_campaign_outcomes o join public.enterprise_partner_campaigns c on c.id=o.campaign_id join public.enterprise_partner_networks n on n.id=c.network_id where c.network_id=p_network_id and o.metric_date between p_start and p_end and public.business_capability_allowed(n.owner_business_id,'enterprise.partner_campaigns') and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))) group by o.partner_business_id) select partner_business_id,visits,checkins,reviews,preferred,access,promotions,round(case when visits>0 then checkins::numeric/visits*100 else 0 end,2),round(case when checkins>0 then reviews::numeric/checkins*100 else 0 end,2),round((checkins*.25+reviews*.15+preferred*.2+access*.2+promotions*.2)::numeric,2) from m order by 10 desc; $$;

create or replace function public.get_partner_allocation_roi(p_network_id uuid,p_start date default current_date-30,p_end date default current_date)
returns table(partner_business_id uuid,allocation_type text,allocated_budget_cents bigint,outcome_value bigint,efficiency numeric)
language sql security definer set search_path=''
as $$ select a.partner_business_id,a.allocation_type,sum(a.budget_cents)::bigint,sum(coalesce(o.check_ins,0)+coalesce(o.preferred_uses,0)+coalesce(o.access_redemptions,0)+coalesce(o.promotion_redemptions,0))::bigint,case when sum(a.budget_cents)>0 then round((sum(coalesce(o.check_ins,0)+coalesce(o.preferred_uses,0)+coalesce(o.access_redemptions,0)+coalesce(o.promotion_redemptions,0))::numeric*100)/sum(a.budget_cents),4) else 0 end from public.enterprise_partner_allocations a left join public.enterprise_partner_campaigns c on c.id=a.campaign_id left join public.enterprise_partner_campaign_outcomes o on o.campaign_id=c.id and o.partner_business_id=a.partner_business_id and o.metric_date between p_start and p_end join public.enterprise_partner_networks n on n.id=a.network_id where a.network_id=p_network_id and a.status in('active','completed') and public.business_capability_allowed(n.owner_business_id,'enterprise.allocations') and (public.is_platform_owner_session() or exists(select 1 from public.business_members bm where bm.business_id=n.owner_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin'))) group by a.partner_business_id,a.allocation_type; $$;

create or replace function public.enterprise_control_plane_snapshot(p_business_id uuid,p_window_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_days integer:=greatest(1,least(coalesce(p_window_days,30),365)); v_start date:=current_date-(greatest(1,least(coalesce(p_window_days,30),365))-1); v_result jsonb;
begin
 if not public.business_capability_allowed(p_business_id,'enterprise.enabled') then raise exception 'Enterprise access required'; end if;
 if not public.is_platform_owner_session() and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role in ('owner','admin')) then raise exception 'Enterprise admin access required'; end if;
 with owned_networks as (select n.id,n.name,n.enabled,n.created_at from public.enterprise_partner_networks n where n.owner_business_id=p_business_id), member_rollup as (select m.network_id,count(*) filter(where m.status='active')::bigint active_members from public.enterprise_partner_network_members m join owned_networks n on n.id=m.network_id group by m.network_id), campaign_rollup as (select c.network_id,count(*)::bigint campaigns,count(*) filter(where c.status='active')::bigint active_campaigns from public.enterprise_partner_campaigns c join owned_networks n on n.id=c.network_id group by c.network_id), metric_rollup as (select x.network_id,coalesce(sum(x.visits),0)::bigint visits,coalesce(sum(x.check_ins),0)::bigint check_ins,coalesce(sum(x.reviews),0)::bigint reviews,coalesce(sum(x.preferred_uses),0)::bigint preferred_uses,coalesce(sum(x.access_redemptions),0)::bigint access_redemptions,coalesce(sum(x.promotion_redemptions),0)::bigint promotion_redemptions from public.enterprise_partner_network_metrics x join owned_networks n on n.id=x.network_id where x.metric_date between v_start and current_date group by x.network_id), outcome_rollup as (select c.network_id,coalesce(sum(o.attributed_users),0)::bigint attributed_users,coalesce(sum(o.points_awarded),0)::bigint points_awarded from public.enterprise_partner_campaigns c join owned_networks n on n.id=c.network_id left join public.enterprise_partner_campaign_outcomes o on o.campaign_id=c.id and o.metric_date between v_start and current_date group by c.network_id)
 select jsonb_build_object('business_id',p_business_id,'window_days',v_days,'start_date',v_start,'end_date',current_date,'totals',jsonb_build_object('networks',count(*)::bigint,'enabled_networks',count(*) filter(where n.enabled)::bigint,'active_members',coalesce(sum(m.active_members),0)::bigint,'campaigns',coalesce(sum(c.campaigns),0)::bigint,'active_campaigns',coalesce(sum(c.active_campaigns),0)::bigint,'visits',coalesce(sum(x.visits),0)::bigint,'check_ins',coalesce(sum(x.check_ins),0)::bigint,'reviews',coalesce(sum(x.reviews),0)::bigint,'preferred_uses',coalesce(sum(x.preferred_uses),0)::bigint,'access_redemptions',coalesce(sum(x.access_redemptions),0)::bigint,'promotion_redemptions',coalesce(sum(x.promotion_redemptions),0)::bigint,'attributed_users',coalesce(sum(o.attributed_users),0)::bigint,'points_awarded',coalesce(sum(o.points_awarded),0)::bigint),'networks',coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'enabled',n.enabled,'created_at',n.created_at,'active_members',coalesce(m.active_members,0),'campaigns',coalesce(c.campaigns,0),'active_campaigns',coalesce(c.active_campaigns,0),'visits',coalesce(x.visits,0),'check_ins',coalesce(x.check_ins,0),'reviews',coalesce(x.reviews,0),'preferred_uses',coalesce(x.preferred_uses,0),'access_redemptions',coalesce(x.access_redemptions,0),'promotion_redemptions',coalesce(x.promotion_redemptions,0),'attributed_users',coalesce(o.attributed_users,0),'points_awarded',coalesce(o.points_awarded,0)) order by n.created_at desc),'[]'::jsonb),'generated_at',now()) into v_result from owned_networks n left join member_rollup m on m.network_id=n.id left join campaign_rollup c on c.network_id=n.id left join metric_rollup x on x.network_id=n.id left join outcome_rollup o on o.network_id=n.id;
 return coalesce(v_result,jsonb_build_object('business_id',p_business_id,'window_days',v_days,'start_date',v_start,'end_date',current_date,'totals',jsonb_build_object('networks',0,'enabled_networks',0,'active_members',0,'campaigns',0,'active_campaigns',0,'visits',0,'check_ins',0,'reviews',0,'preferred_uses',0,'access_redemptions',0,'promotion_redemptions',0,'attributed_users',0,'points_awarded',0),'networks','[]'::jsonb,'generated_at',now()));
end $$;

create or replace function public.business_enterprise_truth_demo_snapshot(p_business_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare b uuid:=p_business_id; n uuid; result jsonb; c_locations integer; c_roles integer; c_qr integer; c_scans integer; c_redemptions integer; c_members integer; c_campaigns integer; c_allocations integer; c_remediation integer; c_preventive integer; c_vehicles integer; c_drivers integer; c_routes integer; c_active_routes integer; c_alerts integer; c_metrics integer; c_outcomes integer;
begin
 if b is null then select id into b from public.businesses where name='Matt Test Business' and is_demo_test=true and lower(business_tier::text)='enterprise' order by created_at limit 1; end if;
 if b is null or not public.business_can_manage(b) then raise exception 'Managed demo Enterprise business required'; end if;
 select id into n from public.enterprise_partner_networks where owner_business_id=b and name='Kleenest Mock Enterprise Network' order by created_at limit 1;
 select count(*) into c_locations from public.locations where business_id=b and source_dataset='enterprise_truth_demo';
 select count(distinct role) into c_roles from public.business_members where business_id=b;
 select count(*) into c_qr from public.qr_codes where business_id=b and code like 'enterprise-truth-demo-qr-%';
 select count(*) into c_scans from public.qr_attribution_events where business_id=b and metadata->>'demo_seed'='enterprise_truth_qr';
 select count(*) into c_redemptions from public.qr_redemptions r join public.qr_codes q on q.id=r.qr_code_id where q.business_id=b and r.metadata->>'demo_seed'='enterprise_truth_qr';
 select count(*) into c_members from public.enterprise_partner_network_members where network_id=n and status='active';
 select count(*) into c_campaigns from public.enterprise_partner_campaigns where network_id=n and status='active';
 select count(*) into c_allocations from public.enterprise_partner_allocations where network_id=n and status in('active','completed') and rationale like '%enterprise_truth_allocation%';
 select count(*) into c_remediation from public.business_restroom_remediation_cases where business_id=b and resolution_snapshot->>'demo_seed'='enterprise_truth_remediation';
 select count(*) into c_preventive from public.business_restroom_preventive_work_orders where business_id=b and source_snapshot->>'demo_seed'='enterprise_truth_preventive';
 select count(*) into c_vehicles from public.fleet_vehicles where business_id=b and metadata->>'demo_seed' like 'enterprise_truth_vehicle_%';
 select count(*) into c_drivers from public.fleet_drivers where business_id=b and metadata->>'demo_seed' like 'enterprise_truth_driver_%';
 select count(*) into c_routes from public.fleet_routes where business_id=b and metadata->>'demo_seed' like 'enterprise_truth_route_%';
 select count(*) into c_active_routes from public.fleet_routes where business_id=b and metadata->>'demo_seed'='enterprise_truth_route_active' and status in('dispatched','active','in_progress');
 select count(*) into c_alerts from public.fleet_alerts where business_id=b and source_kind='enterprise_truth_demo' and status not in('resolved','closed');
 select count(*) into c_metrics from public.enterprise_partner_network_metrics where network_id=n and metric_date>=current_date-30;
 select count(*) into c_outcomes from public.enterprise_partner_campaign_outcomes o join public.enterprise_partner_campaigns c on c.id=o.campaign_id where c.network_id=n and o.metric_date>=current_date-30;
 result:=jsonb_build_object('business_id',b,'capability_matrix',public.business_tier_capability_matrix(b),'evidence',jsonb_build_object('locations',c_locations,'team_roles',c_roles,'qr_assets',c_qr,'qr_scans',c_scans,'qr_redemptions',c_redemptions,'network_members',c_members,'active_campaigns',c_campaigns,'allocations',c_allocations,'remediation_cases',c_remediation,'preventive_work_orders',c_preventive,'vehicles',c_vehicles,'drivers',c_drivers,'routes',c_routes,'active_routes',c_active_routes,'open_alerts',c_alerts,'network_metric_days',c_metrics,'campaign_outcomes',c_outcomes),'passed',(c_locations>=5 and c_roles>=4 and c_qr>=3 and c_scans>=12 and c_redemptions>=3 and c_members>=2 and c_campaigns>=1 and c_allocations>=2 and c_remediation>=1 and c_preventive>=2 and c_vehicles>=2 and c_drivers>=2 and c_routes>=2 and c_active_routes>=1 and c_alerts>=1 and c_metrics>=1 and c_outcomes>=2),'generated_at',now());
 return result;
end $$;

revoke all on function public.enterprise_list_owned_networks(uuid) from public,anon;
revoke all on function public.enterprise_list_partner_businesses(uuid) from public,anon;
revoke all on function public.enterprise_list_network_members(uuid) from public,anon;
revoke all on function public.enterprise_list_network_campaigns(uuid) from public,anon;
revoke all on function public.get_partner_campaign_roi(uuid,date,date) from public,anon;
revoke all on function public.get_partner_network_benchmark(uuid,date,date) from public,anon;
revoke all on function public.get_partner_allocation_roi(uuid,date,date) from public,anon;
revoke all on function public.enterprise_control_plane_snapshot(uuid,integer) from public,anon;
revoke all on function public.business_enterprise_truth_demo_snapshot(uuid) from public,anon;
grant execute on function public.enterprise_list_owned_networks(uuid),public.enterprise_list_partner_businesses(uuid),public.enterprise_list_network_members(uuid),public.enterprise_list_network_campaigns(uuid),public.get_partner_campaign_roi(uuid,date,date),public.get_partner_network_benchmark(uuid,date,date),public.get_partner_allocation_roi(uuid,date,date),public.enterprise_control_plane_snapshot(uuid,integer),public.business_enterprise_truth_demo_snapshot(uuid) to authenticated,service_role;

revoke all on function public.qr_studio_archive_template(uuid,uuid) from public,anon;
revoke all on function public.qr_studio_list_assets(uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.qr_studio_list_templates(uuid) from public,anon;
revoke all on function public.qr_studio_normalize_program_type(text) from public,anon;
revoke all on function public.qr_studio_restore_version(uuid,uuid,integer,text) from public,anon;
revoke all on function public.qr_studio_save_template(uuid,uuid,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.qr_studio_upsert_asset(uuid,uuid,uuid,jsonb,text) from public,anon;
revoke all on function public.qr_studio_validate_action(text,jsonb) from public,anon;
revoke all on function public.qr_studio_validate_customization(jsonb) from public,anon;
revoke all on function public.qr_studio_versions(uuid,uuid) from public,anon;
grant execute on function public.qr_studio_archive_template(uuid,uuid),public.qr_studio_list_assets(uuid,timestamptz,timestamptz),public.qr_studio_list_templates(uuid),public.qr_studio_normalize_program_type(text),public.qr_studio_restore_version(uuid,uuid,integer,text),public.qr_studio_save_template(uuid,uuid,text,text,jsonb,jsonb),public.qr_studio_upsert_asset(uuid,uuid,uuid,jsonb,text),public.qr_studio_validate_action(text,jsonb),public.qr_studio_validate_customization(jsonb),public.qr_studio_versions(uuid,uuid) to authenticated,service_role;
