drop function if exists public.business_preferred_location_summary();
drop function if exists public.business_preferred_location_usage(uuid);
drop function if exists public.business_partner_program_usage(uuid);
create function public.business_preferred_location_summary()
returns table(location_id uuid,program_id uuid,event_type text,day timestamptz,event_count bigint,unique_users bigint)
language sql security invoker as $$
 select e.location_id,e.program_id,e.event_type,date_trunc('day',e.occurred_at),count(*),count(distinct e.user_id)
 from public.preferred_usage_events e
 where e.business_id in (select business_id from public.business_members where user_id=auth.uid() and role in ('owner','admin'))
 group by e.location_id,e.program_id,e.event_type,date_trunc('day',e.occurred_at)
 order by date_trunc('day',e.occurred_at) desc;
$$;
grant execute on function public.business_preferred_location_summary() to authenticated;
create function public.business_preferred_location_usage(p_location_id uuid)
returns table(event_type text,day timestamptz,event_count bigint,unique_users bigint)
language sql security invoker as $$
 select e.event_type,date_trunc('day',e.occurred_at),count(*),count(distinct e.user_id)
 from public.preferred_usage_events e
 where e.location_id=p_location_id and e.business_id in (select business_id from public.business_members where user_id=auth.uid() and role in ('owner','admin'))
 group by e.event_type,date_trunc('day',e.occurred_at)
 order by date_trunc('day',e.occurred_at) desc;
$$;
grant execute on function public.business_preferred_location_usage(uuid) to authenticated;
create function public.business_partner_program_usage(p_partner_program_id uuid)
returns table(location_id uuid,event_type text,day timestamptz,event_count bigint,unique_users bigint)
language sql security invoker as $$
 select e.location_id,e.event_type,date_trunc('day',e.occurred_at),count(*),count(distinct e.user_id)
 from public.preferred_usage_events e
 where e.program_id=p_partner_program_id and e.business_id in (select business_id from public.business_members where user_id=auth.uid() and role in ('owner','admin'))
 group by e.location_id,e.event_type,date_trunc('day',e.occurred_at)
 order by date_trunc('day',e.occurred_at) desc;
$$;
grant execute on function public.business_partner_program_usage(uuid) to authenticated;
