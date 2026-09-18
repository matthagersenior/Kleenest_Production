create or replace function public.business_manage_event(p_business_id uuid, p_event_id uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.business_events; role text; loc uuid;
begin
 select lower(bm.role) into role from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() limit 1;
 if role not in ('owner','admin') and coalesce((select is_admin from public.profiles where id=auth.uid()),false) is not true then raise exception 'Admin access required'; end if;
 loc=nullif(p_payload->>'location_id','')::uuid;
 if loc is not null and not exists(select 1 from public.locations l where l.id=loc and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
 if p_action='create' then insert into public.business_events(business_id,location_id,title,description,event_date,event_time) values(p_business_id,loc,coalesce(p_payload->>'title','New Event'),p_payload->>'description',nullif(p_payload->>'event_date','')::date,nullif(p_payload->>'event_time','')::time) returning * into r;
 elsif p_action='update' then update public.business_events set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),event_date=coalesce(nullif(p_payload->>'event_date','')::date,event_date),event_time=coalesce(nullif(p_payload->>'event_time','')::time,event_time),location_id=coalesce(loc,location_id) where id=p_event_id and business_id=p_business_id returning * into r;
 elsif p_action='delete' then delete from public.business_events where id=p_event_id and business_id=p_business_id returning * into r;
 else raise exception 'Unsupported event action'; end if;
 if r.id is null then raise exception 'Event not found'; end if; return to_jsonb(r);
end; $$;

create or replace function public.business_manage_promotion(p_business_id uuid, p_promotion_id uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.promotions; role text; loc uuid;
begin
 select lower(bm.role) into role from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() limit 1;
 if role not in ('owner','admin') and coalesce((select is_admin from public.profiles where id=auth.uid()),false) is not true then raise exception 'Admin access required'; end if;
 loc=nullif(p_payload->>'location_id','')::uuid;
 if loc is not null and not exists(select 1 from public.locations l where l.id=loc and l.business_id=p_business_id) then raise exception 'Location does not belong to business'; end if;
 if p_action='create' then insert into public.promotions(business_id,location_id,title,description,discount,starts_at,ends_at,active) values(p_business_id,loc,coalesce(p_payload->>'title','New Promotion'),p_payload->>'description',p_payload->>'discount',nullif(p_payload->>'starts_at','')::timestamptz,nullif(p_payload->>'ends_at','')::timestamptz,coalesce((p_payload->>'active')::boolean,true)) returning * into r;
 elsif p_action='update' then update public.promotions set title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),discount=coalesce(p_payload->>'discount',discount),starts_at=coalesce(nullif(p_payload->>'starts_at','')::timestamptz,starts_at),ends_at=coalesce(nullif(p_payload->>'ends_at','')::timestamptz,ends_at),active=coalesce((p_payload->>'active')::boolean,active),location_id=coalesce(loc,location_id) where id=p_promotion_id and business_id=p_business_id returning * into r;
 elsif p_action='deactivate' then update public.promotions set active=false where id=p_promotion_id and business_id=p_business_id returning * into r;
 else raise exception 'Unsupported promotion action'; end if;
 if r.id is null then raise exception 'Promotion not found'; end if; return to_jsonb(r);
end; $$;
