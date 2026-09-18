create or replace function public.business_progression_engagement_snapshot(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.business_members bm where bm.business_id=p_business_id and bm.user_id=v_user)
     and not public.is_platform_owner_session() then
    raise exception 'business access required';
  end if;

  select jsonb_build_object(
    'business_id',p_business_id,
    'discoveries',(
      select count(*)
      from public.discovery_contributions dc
      join public.locations l on l.id=dc.location_id
      where l.business_id=p_business_id or l.claimed_business_id=p_business_id
    ),
    'discovered_locations',(
      select count(distinct dc.location_id)
      from public.discovery_contributions dc
      join public.locations l on l.id=dc.location_id
      where l.business_id=p_business_id or l.claimed_business_id=p_business_id
    ),
    'xp_at_locations',(
      select coalesce(sum(e.xp_awarded),0)
      from public.progression_events_v2 e
      join public.locations l on l.id=e.location_id
      where e.status='awarded' and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
    ),
    'contributors',(
      select count(distinct e.user_id)
      from public.progression_events_v2 e
      join public.locations l on l.id=e.location_id
      where e.status='awarded' and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
    ),
    'active_campaigns',(
      select count(*)
      from public.business_campaigns bc
      where bc.business_id=p_business_id
        and bc.status='active'
        and (bc.starts_at is null or bc.starts_at<=now())
        and (bc.ends_at is null or bc.ends_at>=now())
    ),
    'recent_actions',coalesce((
      select jsonb_agg(x order by x->>'created_at' desc)
      from (
        select jsonb_build_object(
          'action',e.action,
          'xp',e.xp_awarded,
          'location_id',e.location_id,
          'created_at',e.created_at
        ) x
        from public.progression_events_v2 e
        join public.locations l on l.id=e.location_id
        where e.status='awarded'
          and (l.business_id=p_business_id or l.claimed_business_id=p_business_id)
        order by e.created_at desc
        limit 25
      ) q
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;
grant execute on function public.business_progression_engagement_snapshot(uuid) to authenticated;
