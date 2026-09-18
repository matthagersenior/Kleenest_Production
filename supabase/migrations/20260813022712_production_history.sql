create or replace function public.business_preferred_location_summary()
returns table(location_id uuid, business_id uuid, activation_count bigint, active_user_count bigint, total_uses bigint, last_used_at timestamptz)
language sql security definer set search_path=public as $$
 select pla.location_id,l.business_id,count(*)::bigint,
        count(distinct pla.user_id) filter(where pla.deactivated_at is null)::bigint,
        coalesce(sum(pla.use_count),0)::bigint,max(pla.last_used_at)
 from public.preferred_location_activations pla
 join public.locations l on l.id=pla.location_id
 where exists(select 1 from public.business_members bm where bm.business_id=l.business_id and bm.user_id=auth.uid())
 group by pla.location_id,l.business_id;
$$;

create or replace function public.business_preferred_location_usage(p_location_id uuid)
returns table(user_id uuid, activated_at timestamptz, deactivated_at timestamptz, use_count integer, last_used_at timestamptz, partner_program_id uuid)
language sql security definer set search_path=public as $$
 select pla.user_id,pla.activated_at,pla.deactivated_at,pla.use_count,pla.last_used_at,pla.partner_program_id
 from public.preferred_location_activations pla
 join public.locations l on l.id=pla.location_id
 where pla.location_id=p_location_id
 and exists(select 1 from public.business_members bm where bm.business_id=l.business_id and bm.user_id=auth.uid());
$$;

create or replace function public.business_partner_program_usage(p_partner_program_id uuid)
returns table(location_id uuid, activation_count bigint, active_user_count bigint, total_uses bigint, last_used_at timestamptz)
language sql security definer set search_path=public as $$
 select pla.location_id,count(*)::bigint,
        count(distinct pla.user_id) filter(where pla.deactivated_at is null)::bigint,
        coalesce(sum(pla.use_count),0)::bigint,max(pla.last_used_at)
 from public.preferred_location_activations pla
 join public.locations l on l.id=pla.location_id
 where pla.partner_program_id=p_partner_program_id
 and exists(select 1 from public.business_members bm where bm.business_id=l.business_id and bm.user_id=auth.uid())
 group by pla.location_id;
$$;

grant execute on function public.business_preferred_location_summary() to authenticated;
grant execute on function public.business_preferred_location_usage(uuid) to authenticated;
grant execute on function public.business_partner_program_usage(uuid) to authenticated;
