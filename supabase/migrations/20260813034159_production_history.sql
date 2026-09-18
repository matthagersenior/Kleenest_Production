create or replace function public.record_preferred_usage(p_location_id uuid,p_activation_id uuid default null,p_source text default 'preferred')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_event uuid; v_business uuid;
begin
 if v_uid is null then raise exception 'not_authenticated'; end if;
 if not exists(select 1 from public.profiles where id=v_uid and subscription_tier in ('premium','fleet','enterprise')) then raise exception 'tier_not_eligible'; end if;
 if p_activation_id is not null and not exists(select 1 from public.preferred_location_activations where id=p_activation_id and user_id=v_uid and location_id=p_location_id and status='active') then raise exception 'invalid_activation'; end if;
 select business_id into v_business from public.locations where id=p_location_id;
 insert into public.analytics_events(user_id,business_id,location_id,event_type,metadata)
 values(v_uid,v_business,p_location_id,'check_in',jsonb_build_object('source',p_source,'preferred',true,'activation_id',p_activation_id)) returning id into v_event;
 return v_event;
end;$$;
grant execute on function public.record_preferred_usage(uuid,uuid,text) to authenticated;

create or replace view public.partner_preferred_usage_analytics as
select l.business_id,
       l.id as location_id,
       count(*) filter(where ae.metadata->>'preferred'='true') as preferred_uses,
       count(distinct ae.user_id) filter(where ae.metadata->>'preferred'='true') as unique_preferred_users,
       count(*) filter(where ae.event_type='check_in') as total_check_ins,
       min(ae.created_at) filter(where ae.metadata->>'preferred'='true') as first_preferred_use,
       max(ae.created_at) filter(where ae.metadata->>'preferred'='true') as last_preferred_use
from public.locations l
left join public.analytics_events ae on ae.location_id=l.id
 group by l.business_id,l.id;
