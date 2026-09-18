create or replace function public.business_admin_allowed(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select public.business_admin_guard(p_business_id); $$;

create or replace function public.business_manage_location(p_business_id uuid,p_location_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.locations; role text;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if p_action='create' then
    insert into public.locations(business_id,name,address,city,state,postal_code,country,latitude,longitude,description,phone,website,is_active,is_premium,accessible,changing_table,source,verification_status,created_by)
    values(p_business_id,coalesce(p_payload->>'name','New Location'),p_payload->>'address',p_payload->>'city',p_payload->>'state',p_payload->>'postal_code',coalesce(p_payload->>'country','US'),nullif(p_payload->>'latitude','')::double precision,nullif(p_payload->>'longitude','')::double precision,p_payload->>'description',p_payload->>'phone',p_payload->>'website',coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'is_premium')::boolean,false),coalesce((p_payload->>'accessible')::boolean,false),coalesce((p_payload->>'changing_table')::boolean,false),'business','pending',auth.uid()) returning * into r;
  elsif p_action='update' then
    update public.locations set name=coalesce(p_payload->>'name',name),address=coalesce(p_payload->>'address',address),city=coalesce(p_payload->>'city',city),state=coalesce(p_payload->>'state',state),description=coalesce(p_payload->>'description',description),phone=coalesce(p_payload->>'phone',phone),website=coalesce(p_payload->>'website',website),is_active=coalesce((p_payload->>'is_active')::boolean,is_active),is_premium=coalesce((p_payload->>'is_premium')::boolean,is_premium),updated_at=now() where id=p_location_id and business_id=p_business_id returning * into r;
  elsif p_action='deactivate' then
    update public.locations set is_active=false,updated_at=now() where id=p_location_id and business_id=p_business_id returning * into r;
  else raise exception 'Unsupported location action'; end if;
  if r.id is null then raise exception 'Location not found'; end if;
  return to_jsonb(r);
end;
$$;

create or replace function public.business_manage_event(p_business_id uuid,p_event_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.business_events; loc uuid;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
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

create or replace function public.business_manage_promotion(p_business_id uuid,p_promotion_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.promotions; loc uuid;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
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

create or replace function public.business_manage_qr(p_business_id uuid,p_location_id uuid,p_qr_id uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.qr_codes;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if p_location_id is not null and not exists(select 1 from public.locations where id=p_location_id and business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
  if p_action='create' then insert into public.qr_codes(location_id,code,active,label,customization) values(p_location_id,encode(gen_random_bytes(12),'hex'),true,coalesce(p_payload->>'label','Location QR'),coalesce(p_payload->'customization','{}'::jsonb)) returning * into q;
  elsif p_action='update' then update public.qr_codes set label=coalesce(p_payload->>'label',label),customization=coalesce(p_payload->'customization',customization),active=coalesce((p_payload->>'active')::boolean,active) where id=p_qr_id and (p_location_id is null or location_id=p_location_id) and exists(select 1 from public.locations l where l.id=qr_codes.location_id and l.business_id=p_business_id) returning * into q;
  elsif p_action='deactivate' then update public.qr_codes set active=false where id=p_qr_id and (p_location_id is null or location_id=p_location_id) and exists(select 1 from public.locations l where l.id=qr_codes.location_id and l.business_id=p_business_id) returning * into q;
  else raise exception 'Unsupported QR action'; end if;
  if q.id is null then raise exception 'QR code not found'; end if;
  return to_jsonb(q);
end;
$$;

create or replace function public.business_manage_campaign(p_business_id uuid,p_campaign_id uuid,p_action text,p_name text default null,p_campaign_type text default null,p_goal text default null,p_status text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if not public.business_admin_guard(p_business_id) then raise exception 'Admin access required'; end if;
  if p_action in('create','update') then
    if p_action='create' then insert into public.campaigns(business_id,name,campaign_type,goal,status) values(p_business_id,coalesce(p_name,'New Campaign'),p_campaign_type,p_goal,coalesce(p_status,'draft')) returning to_jsonb(campaigns.*) into v;
    else update public.campaigns set name=coalesce(p_name,name),campaign_type=coalesce(p_campaign_type,campaign_type),goal=coalesce(p_goal,goal),status=coalesce(p_status,status) where id=p_campaign_id and business_id=p_business_id returning to_jsonb(campaigns.*) into v; end if;
  elsif p_action='pause' then update public.campaigns set status='paused' where id=p_campaign_id and business_id=p_business_id returning to_jsonb(campaigns.*) into v;
  elsif p_action='activate' then update public.campaigns set status='active' where id=p_campaign_id and business_id=p_business_id returning to_jsonb(campaigns.*) into v;
  else raise exception 'Unknown campaign action'; end if;
  if v is null then raise exception 'Campaign not found'; end if;
  return v;
end;
$$;

create or replace function public.business_dashboard_secure_summary(p_business_id uuid,p_start timestamp with time zone default now()-interval '30 days',p_end timestamp with time zone default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb; v_summary jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.business_can_manage(p_business_id) and not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid()) then raise exception 'Not authorized for this business'; end if;
  select coalesce(jsonb_object_agg(a.event_type,a.event_count),'{}'::jsonb) into v_summary from (select ae.event_type::text event_type,count(*)::bigint event_count from public.analytics_events ae where ae.business_id=p_business_id and ae.created_at>=p_start and ae.created_at<p_end group by ae.event_type) a;
  select jsonb_build_object('business',(select to_jsonb(b) from public.businesses b where b.id=p_business_id),'locations',coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from public.locations l where l.business_id=p_business_id),'[]'::jsonb),'summary',v_summary,'reviews',(select count(*) from public.reviews r join public.locations l on l.id=r.location_id where l.business_id=p_business_id and r.created_at>=p_start and r.created_at<p_end),'check_ins',(select count(*) from public.check_ins c join public.locations l on l.id=c.location_id where l.business_id=p_business_id and c.checked_in_at>=p_start and c.checked_in_at<p_end),'redemptions',(select count(*) from public.promotion_redemptions pr join public.locations l on l.id=pr.location_id where l.business_id=p_business_id and pr.redeemed_at>=p_start and pr.redeemed_at<p_end)) into v_result;
  return v_result;
end;
$$;
