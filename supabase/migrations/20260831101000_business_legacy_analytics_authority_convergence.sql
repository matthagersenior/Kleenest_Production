create or replace function public.business_analytics_authorized(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    public.is_platform_owner_session()
    or exists (
      select 1 from public.business_members bm
      where bm.business_id = p_business_id
        and bm.user_id = auth.uid()
        and lower(bm.role::text) in ('owner','admin','manager','analyst')
    )
  );
$$;
revoke execute on function public.business_analytics_authorized(uuid) from public, anon;
grant execute on function public.business_analytics_authorized(uuid) to authenticated, service_role;

create or replace function public.business_benchmark_analytics(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (with peers as(select b.id,count(ci.id)::numeric check_ins from public.businesses b left join public.locations l on l.business_id=b.id left join public.check_ins ci on ci.location_id=l.id and ci.checked_in_at between p_start and p_end group by b.id),ranked as(select id,check_ins,percent_rank() over(order by check_ins) percentile from peers),mine as(select * from ranked where id=p_business_id) select jsonb_build_object('business_check_ins',coalesce((select check_ins from mine),0),'peer_businesses',(select count(*) from peers),'peer_average_check_ins',coalesce(round((select avg(check_ins) from peers)::numeric,2),0),'percentile',coalesce(round((100*(select percentile from mine))::numeric,2),0)));
end $$;

create or replace function public.business_campaign_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (select c.id,c.name,c.campaign_type,c.goal,c.status,c.created_at,coalesce(sum(o.visits) filter(where o.metric_date between p_start::date and p_end::date),0) visits,coalesce(sum(o.check_ins) filter(where o.metric_date between p_start::date and p_end::date),0) check_ins,coalesce(sum(o.reviews) filter(where o.metric_date between p_start::date and p_end::date),0) reviews,coalesce(sum(o.attributed_users) filter(where o.metric_date between p_start::date and p_end::date),0) attributed_users from public.enterprise_partner_campaigns c left join public.enterprise_partner_campaign_outcomes o on o.campaign_id=c.id where c.network_id in(select id from public.enterprise_partner_networks where owner_business_id=p_business_id) and c.created_at<=p_end group by c.id,c.name,c.campaign_type,c.goal,c.status,c.created_at) x);
end $$;

create or replace function public.business_event_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.event_date desc,x.created_at desc),'[]'::jsonb) from (select e.id,e.title,e.description,e.event_date,e.event_time,e.created_at,l.name location,count(er.user_id) rsvps from public.business_events e left join public.locations l on l.id=e.location_id left join public.event_rsvps er on er.event_id=e.id where e.business_id=p_business_id and(e.event_date is null or e.event_date between p_start::date and p_end::date) group by e.id,e.title,e.description,e.event_date,e.event_time,e.created_at,l.name) x);
end $$;

create or replace function public.business_media_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (select p.id,l.name location,p.media_type,p.mime_type,p.size_bytes,p.width,p.height,p.caption,p.storage_path,p.created_at from public.location_photos p join public.locations l on l.id=p.location_id where l.business_id=p_business_id and p.created_at between p_start and p_end) x);
end $$;

create or replace function public.business_occupancy_analytics(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (with v as(select lv.occurred_at,lv.user_id from public.location_visits lv join public.locations l on l.id=lv.location_id where l.business_id=p_business_id and lv.occurred_at between p_start and p_end),c as(select ci.checked_in_at occurred_at,ci.user_id from public.check_ins ci join public.locations l on l.id=ci.location_id where l.business_id=p_business_id and ci.checked_in_at between p_start and p_end),allv as(select * from v union all select * from c),peak as(select extract(hour from occurred_at)::int h,count(*) n from allv group by 1 order by n desc limit 1) select jsonb_build_object('visits',(select count(*) from v),'check_ins',(select count(*) from c),'unique_visitors',(select count(distinct user_id) from allv),'peak_hour',(select h from peak)));
end $$;

create or replace function public.business_partner_analytics(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (select jsonb_build_object('business_id',p_business_id,'partner_programs',count(distinct pp.id),'enabled_programs',count(distinct pp.id) filter(where pp.enabled),'partner_agreements',count(distinct pa.id),'active_agreements',count(distinct pa.id) filter(where pa.status='active'),'preferred_uses',coalesce((select count(*) from public.preferred_usage_events e where e.business_id=p_business_id and e.occurred_at between p_start and p_end),0),'partner_users',coalesce((select count(distinct ppm.user_id) from public.partner_program_memberships ppm join public.partner_programs ppx on ppx.id=ppm.partner_program_id where ppx.business_id=p_business_id and ppm.granted_at between p_start and p_end),0)) from public.partner_programs pp left join public.partner_agreements pa on pa.partner_program_id=pp.id where pp.business_id=p_business_id);
end $$;

create or replace function public.business_partner_detail(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (select p.id,p.name,p.enabled,p.preferred_access,p.match_discount_bonus,p.custom_perk,p.created_at,count(pa.id) agreements,count(pa.id) filter(where pa.status='active') active_agreements from public.partner_programs p left join public.partner_agreements pa on pa.partner_program_id=p.id where p.business_id=p_business_id group by p.id,p.name,p.enabled,p.preferred_access,p.match_discount_bonus,p.custom_perk,p.created_at) x);
end $$;

create or replace function public.business_roi_analytics(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (select jsonb_build_object('business_id',p_business_id,'revenue',null,'cost_cents',coalesce((select sum(epa.budget_cents) from public.enterprise_partner_allocations epa join public.enterprise_partner_networks epn on epn.id=epa.network_id where epn.owner_business_id=p_business_id and epa.created_at between p_start and p_end),0),'attributed_users',coalesce((select count(distinct bea.user_id) from public.business_engagement_attributions bea where bea.business_id=p_business_id and bea.created_at between p_start and p_end),0),'roi',null,'roi_status','unavailable_without_revenue_source'));
end $$;

create or replace function public.business_visitors_analytics(p_business_id uuid,p_start timestamptz default now()-interval '30 days',p_end timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.business_analytics_authorized(p_business_id) then raise exception 'Business analytics access required'; end if;
 return (with visits as (select ci.user_id,ci.checked_in_at occurred_at from public.check_ins ci join public.locations l on l.id=ci.location_id where l.business_id=p_business_id and ci.checked_in_at between p_start and p_end union all select lv.user_id,lv.occurred_at from public.location_visits lv join public.locations l on l.id=lv.location_id where l.business_id=p_business_id and lv.occurred_at between p_start and p_end),counts as(select user_id,count(*) n from visits group by user_id) select jsonb_build_object('visits',(select count(*) from visits),'unique_visitors',(select count(*) from counts),'repeat_visitors',(select count(*) from counts where n>1),'new_visitors',(select count(*) from counts where user_id not in (select v2.user_id from public.check_ins v2 join public.locations l2 on l2.id=v2.location_id where l2.business_id=p_business_id and v2.checked_in_at<p_start union select v3.user_id from public.location_visits v3 join public.locations l3 on l3.id=v3.location_id where l3.business_id=p_business_id and v3.occurred_at<p_start)),'returning_visitors',(select count(*) from counts where user_id in (select v2.user_id from public.check_ins v2 join public.locations l2 on l2.id=v2.location_id where l2.business_id=p_business_id and v2.checked_in_at<p_start union select v3.user_id from public.location_visits v3 join public.locations l3 on l3.id=v3.location_id where l3.business_id=p_business_id and v3.occurred_at<p_start)),'retention_rate_pct',case when (select count(*) from counts)=0 then 0 else round(100.0*(select count(*) from counts where n>1)/(select count(*) from counts),2) end));
end $$;

revoke execute on function public.business_benchmark_analytics(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_campaign_detail(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_event_detail(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_media_detail(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_occupancy_analytics(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_partner_analytics(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_partner_detail(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_roi_analytics(uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.business_visitors_analytics(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.business_benchmark_analytics(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_campaign_detail(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_event_detail(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_media_detail(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_occupancy_analytics(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_partner_analytics(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_partner_detail(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_roi_analytics(uuid,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.business_visitors_analytics(uuid,timestamptz,timestamptz) to authenticated, service_role;
