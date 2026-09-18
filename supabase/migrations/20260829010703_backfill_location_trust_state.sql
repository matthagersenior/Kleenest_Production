do $$ declare r record; begin for r in select id from public.locations where is_active=true loop perform public.refresh_location_trust_state(r.id); end loop; end $$;

create or replace function public.select_reverification_targets(p_limit integer default 25)
returns table(location_id uuid,priority numeric,staleness_status text,freshness_score numeric,confidence_score numeric,last_verified_at timestamptz,reverification_due_at timestamptz)
language sql stable security definer set search_path to 'public','auth','extensions','pg_temp'
as $function$
  select lc.location_id, round((case lc.staleness_status when 'very_stale' then 100 when 'stale' then 75 when 'aging' then 45 when 'recent' then 15 else 100 end + greatest(0,100-coalesce(lc.freshness_score,0)) + greatest(0,100-coalesce(lc.score,0))*0.5),2) priority, lc.staleness_status, lc.freshness_score, lc.score, lc.last_verified_at, lc.reverification_due_at
  from public.location_confidence lc
  where lc.staleness_status in ('unknown','aging','stale','very_stale') or lc.reverification_due_at<=now()
  order by priority desc, lc.reverification_due_at nulls first
  limit greatest(1,least(coalesce(p_limit,25),100));
$function$;
grant execute on function public.select_reverification_targets(integer) to authenticated;
revoke execute on function public.select_reverification_targets(integer) from anon;
