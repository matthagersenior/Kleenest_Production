create or replace function public.business_advanced_allowed(p_business_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public','pg_temp'
as $$
  select public.is_platform_owner_session()
    or exists(select 1 from public.businesses b where b.id=p_business_id and b.business_tier::text in ('growth','enterprise'))
    or coalesce((public.get_business_service_entitlement(p_business_id)->>'service_tier') in ('growth','enterprise'),false);
$$;

create or replace function public.get_business_product_access(p_business_id uuid)
returns table(business_id uuid, plan text, location_count integer, location_limit integer, enterprise_enabled boolean, fleet_enabled boolean, is_admin boolean)
language sql
security definer
set search_path to 'public','pg_temp'
as $$
with owner_access as (select public.is_platform_owner_session() a),
member as (select exists(select 1 from public.app_business_memberships m where m.business_id=p_business_id and m.user_id=auth.uid()) a),
b as (select x.id,x.business_tier::text tier from public.businesses x where x.id=p_business_id),
lc as (select count(*)::integer n from public.locations l where l.business_id=p_business_id and coalesce(l.is_active,true)),
svc as (select public.get_business_service_entitlement(p_business_id) j)
select b.id,
       coalesce(b.tier,'standard'),
       lc.n,
       case
         when owner_access.a then null
         when coalesce((svc.j->>'service_tier'),'')='enterprise' or coalesce(b.tier,'standard')='enterprise' then null
         when coalesce((svc.j->>'service_tier'),'')='growth' or coalesce(b.tier,'standard')='growth' then 5
         else 1
       end,
       (coalesce((svc.j->>'service_tier'),'')='enterprise' or coalesce(b.tier,'standard')='enterprise') or owner_access.a,
       coalesce((svc.j->>'fleet_enabled')::boolean,false) or coalesce(b.tier,'standard') in ('fleet','enterprise') or owner_access.a,
       owner_access.a
from b,lc,owner_access,member,svc
where member.a or owner_access.a;
$$;
revoke execute on function public.get_business_product_access(uuid) from public, anon;
grant execute on function public.get_business_product_access(uuid) to authenticated, service_role;

create or replace function public.business_manage_promotion(p_business_id uuid,p_promotion_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare r public.promotions; loc uuid;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  loc=nullif(p_payload->>'location_id','')::uuid;
  if loc is not null and not exists(select 1 from public.locations l where l.id=loc and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if p_action='create' then insert into public.promotions(business_id,location_id,title,description,discount,starts_at,ends_at,active) values(p_business_id,loc,coalesce(p_payload->>'title','New Promotion'),p_payload->>'description',p_payload->>'discount',nullif(p_payload->>'starts_at','')::timestamptz,nullif(p_payload->>'ends_at','')::timestamptz,coalesce((p_payload->>'active')::boolean,true)) returning * into r;
  elsif p_action='update' then update public.promotions set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),discount=coalesce(p_payload->>'discount',discount),starts_at=coalesce(nullif(p_payload->>'starts_at','')::timestamptz,starts_at),ends_at=coalesce(nullif(p_payload->>'ends_at','')::timestamptz,ends_at),active=coalesce((p_payload->>'active')::boolean,active),location_id=coalesce(loc,location_id) where id=p_promotion_id and business_id=p_business_id returning * into r;
  elsif p_action='deactivate' then update public.promotions set active=false where id=p_promotion_id and business_id=p_business_id returning * into r;
  else raise exception 'Unsupported promotion action'; end if;
  if r.id is null then raise exception 'Promotion not found'; end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.business_manage_event(p_business_id uuid,p_event_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare r public.business_events; loc uuid;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  loc=nullif(p_payload->>'location_id','')::uuid;
  if loc is not null and not exists(select 1 from public.locations l where l.id=loc and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if p_action='create' then insert into public.business_events(business_id,location_id,title,description,event_date,event_time) values(p_business_id,loc,coalesce(p_payload->>'title','New Event'),p_payload->>'description',nullif(p_payload->>'event_date','')::date,nullif(p_payload->>'event_time','')::time) returning * into r;
  elsif p_action='update' then update public.business_events set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),event_date=coalesce(nullif(p_payload->>'event_date','')::date,event_date),event_time=coalesce(nullif(p_payload->>'event_time','')::time,event_time),location_id=coalesce(loc,location_id) where id=p_event_id and business_id=p_business_id returning * into r;
  elsif p_action='delete' then delete from public.business_events where id=p_event_id and business_id=p_business_id returning * into r;
  else raise exception 'Unsupported event action'; end if;
  if r.id is null then raise exception 'Event not found'; end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.business_set_promotion_active(p_business_id uuid,p_promotion_id uuid,p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
begin
  if not public.business_admin_allowed(p_business_id) then raise exception 'Admin access required'; end if;
  if not public.business_advanced_allowed(p_business_id) then raise exception 'Business Growth or Enterprise plan required'; end if;
  update public.promotions set active=p_active where id=p_promotion_id and business_id=p_business_id;
  if not found then raise exception 'Promotion not found'; end if;
  return (select to_jsonb(p) from public.promotions p where p.id=p_promotion_id);
end;
$$;
