create or replace function public.fleet_exception_alerts(p_business_id uuid,p_status text default 'open',p_limit integer default 50)
returns setof public.fleet_alerts language plpgsql stable security definer set search_path='public','auth','extensions','pg_temp' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_observe_access(p_business_id) then raise exception 'Fleet access required'; end if;
 return query select a.* from public.fleet_alerts a where a.business_id=p_business_id and (p_status is null or a.status=p_status) order by case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end,a.created_at desc limit least(greatest(coalesce(p_limit,50),1),100);
end $$;
revoke all on function public.fleet_exception_alerts(uuid,text,integer) from public,anon;
grant execute on function public.fleet_exception_alerts(uuid,text,integer) to authenticated;
