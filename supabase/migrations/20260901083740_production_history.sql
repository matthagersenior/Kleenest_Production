create or replace function public.business_list_campaigns(p_business_id uuid)
returns setof public.enterprise_partner_campaigns
language sql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
  select c.*
  from public.enterprise_partner_campaigns c
  join public.enterprise_partner_networks n on n.id=c.network_id
  where n.owner_business_id=p_business_id
    and public.business_can_manage(p_business_id)
    and public.business_advanced_allowed(p_business_id)
  order by c.created_at desc;
$$;

create or replace function public.business_list_events(p_business_id uuid)
returns setof public.business_events
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
begin
  if not public.business_can_manage(p_business_id) then raise exception 'Business management access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  return query select e.* from public.business_events e where e.business_id=p_business_id order by e.event_date nulls last,e.event_time nulls last,e.created_at desc;
end;
$$;

create or replace function public.business_campaign_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
   select c.id,c.name,c.campaign_type,c.goal,c.status,c.created_at,
     coalesce(sum(o.visits) filter(where o.metric_date between p_start::date and p_end::date),0) visits,
     coalesce(sum(o.check_ins) filter(where o.metric_date between p_start::date and p_end::date),0) check_ins,
     coalesce(sum(o.reviews) filter(where o.metric_date between p_start::date and p_end::date),0) reviews,
     coalesce(sum(o.attributed_users) filter(where o.metric_date between p_start::date and p_end::date),0) attributed_users
   from public.enterprise_partner_campaigns c
   left join public.enterprise_partner_campaign_outcomes o on o.campaign_id=c.id
   where c.network_id in(select id from public.enterprise_partner_networks where owner_business_id=p_business_id) and c.created_at<=p_end
   group by c.id,c.name,c.campaign_type,c.goal,c.status,c.created_at
 ) x);
end;
$$;

create or replace function public.business_event_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.event_date desc,x.created_at desc),'[]'::jsonb) from (
   select e.id,e.title,e.description,e.event_date,e.event_time,e.created_at,l.name location,count(er.user_id) rsvps
   from public.business_events e left join public.locations l on l.id=e.location_id left join public.event_rsvps er on er.event_id=e.id
   where e.business_id=p_business_id and(e.event_date is null or e.event_date between p_start::date and p_end::date)
   group by e.id,e.title,e.description,e.event_date,e.event_time,e.created_at,l.name
 ) x);
end;
$$;

create or replace function public.business_promotion_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.role='analyst') then raise exception 'Not authorized for this business'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into out
  from (
    select p.id,p.title,p.description,p.discount,p.active,p.starts_at,p.ends_at,p.created_at,l.name location,
      count(ae.id) filter(where ae.event_type='promotion_view' and ae.created_at between p_start and p_end) views,
      count(ae.id) filter(where ae.event_type='promotion_redeemed' and ae.created_at between p_start and p_end) redemptions
    from public.promotions p left join public.locations l on l.id=p.location_id left join public.analytics_events ae on ae.promotion_id=p.id
    where p.business_id=p_business_id
    group by p.id,p.title,p.description,p.discount,p.active,p.starts_at,p.ends_at,p.created_at,l.name
  ) x;
  return out;
end;
$$;

create or replace function public.reporting_build_payload(p_scope_type text,p_scope_id uuid,p_start timestamptz,p_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare v jsonb; internal_call boolean:=session_user in ('postgres','supabase_admin');
begin
 if p_scope_type='business' then
   if not internal_call and not (public.business_advanced_allowed(p_scope_id) and public.business_analytics_authorized(p_scope_id)) then raise exception 'Business Growth or Enterprise reporting access required'; end if;
   select jsonb_build_object('scope','business','period_start',p_start,'period_end',p_end,'locations',(select count(*) from public.locations where business_id=p_scope_id and is_active),'location_views',(select count(*) from public.analytics_events where business_id=p_scope_id and event_type='location_view' and created_at between p_start and p_end),'unique_visitors',(select count(distinct user_id) from public.analytics_events where business_id=p_scope_id and user_id is not null and created_at between p_start and p_end),'check_ins',(select count(*) from public.check_ins c join public.locations l on l.id=c.location_id where l.business_id=p_scope_id and c.checked_in_at between p_start and p_end),'reviews',(select count(*) from public.reviews r join public.locations l on l.id=r.location_id where l.business_id=p_scope_id and r.created_at between p_start and p_end),'promotion_redemptions',(select count(*) from public.promotion_redemptions pr join public.promotions p on p.id=pr.promotion_id where p.business_id=p_scope_id and pr.redeemed_at between p_start and p_end),'attributed_engagements',(select count(*) from public.business_engagement_attributions where business_id=p_scope_id and created_at between p_start and p_end),'growth_signals',(select count(*) from public.business_growth_signals where business_id=p_scope_id and created_at between p_start and p_end)) into v;
 elsif p_scope_type='fleet' then select jsonb_build_object('scope','fleet','period_start',p_start,'period_end',p_end,'active_vehicles',(select count(*) from public.fleet_vehicles where business_id=p_scope_id and status='active'),'active_drivers',(select count(*) from public.fleet_drivers where business_id=p_scope_id and status='active'),'routes_completed',(select count(*) from public.fleet_routes where business_id=p_scope_id and status='completed' and updated_at between p_start and p_end),'open_alerts',(select count(*) from public.fleet_alerts where business_id=p_scope_id and status='open'),'maintenance_due',(select count(*) from public.fleet_vehicle_daily_metrics where business_id=p_scope_id and maintenance_due),'miles',(select coalesce(sum(miles),0) from public.fleet_vehicle_daily_metrics where business_id=p_scope_id and metric_date between p_start::date and p_end::date),'trips',(select coalesce(sum(trips),0) from public.fleet_vehicle_daily_metrics where business_id=p_scope_id and metric_date between p_start::date and p_end::date),'avg_utilization_pct',(select round(avg(utilization_pct),2) from public.fleet_vehicle_daily_metrics where business_id=p_scope_id and metric_date between p_start::date and p_end::date)) into v;
 elsif p_scope_type='enterprise' then select jsonb_build_object('scope','enterprise','period_start',p_start,'period_end',p_end,'networks',(select count(*) from public.enterprise_partner_networks where id=p_scope_id and enabled),'partners',(select count(*) from public.enterprise_partner_network_members where network_id=p_scope_id and status='active'),'campaigns',(select count(*) from public.enterprise_partner_campaigns where network_id=p_scope_id),'visits',(select coalesce(sum(visits),0) from public.enterprise_partner_network_metrics where network_id=p_scope_id and metric_date between p_start::date and p_end::date),'check_ins',(select coalesce(sum(check_ins),0) from public.enterprise_partner_network_metrics where network_id=p_scope_id and metric_date between p_start::date and p_end::date),'reviews',(select coalesce(sum(reviews),0) from public.enterprise_partner_network_metrics where network_id=p_scope_id and metric_date between p_start::date and p_end::date),'preferred_uses',(select coalesce(sum(preferred_uses),0) from public.enterprise_partner_network_metrics where network_id=p_scope_id and metric_date between p_start::date and p_end::date),'promotion_redemptions',(select coalesce(sum(promotion_redemptions),0) from public.enterprise_partner_network_metrics where network_id=p_scope_id and metric_date between p_start::date and p_end::date)) into v;
 else select jsonb_build_object('scope','admin','period_start',p_start,'period_end',p_end,'profiles',(select count(*) from public.profiles),'locations',(select count(*) from public.locations where is_active),'feature_events',(select count(*) from public.data_feature_events where created_at between p_start and p_end),'feature_access_events',(select count(*) from public.feature_access_events where created_at between p_start and p_end),'notifications',(select count(*) from public.notifications where created_at between p_start and p_end),'open_data_conflicts',(select count(*) from public.location_data_conflicts where status='open'),'external_import_jobs',(select count(*) from public.external_import_jobs where created_at between p_start and p_end),'capability_audit_runs',(select count(*) from public.capability_audit_runs where executed_at between p_start and p_end)) into v;
 end if;
 return coalesce(v,'{}'::jsonb);
end;
$$;
