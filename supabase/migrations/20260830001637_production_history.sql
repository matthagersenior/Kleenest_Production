create or replace function public.fleet_set_route_status(p_business_id uuid, p_route_id uuid, p_status text)
returns public.fleet_routes
language plpgsql security definer
set search_path to 'public','auth','extensions','pg_temp'
as $$
declare r public.fleet_routes;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.fleet_actor_is_manager(p_business_id) then raise exception 'Fleet manager permission required'; end if;
 if p_status not in ('planned','active','completed','cancelled','paused') then raise exception 'Invalid route status'; end if;
 update public.fleet_routes set
   status=p_status,
   dispatched_at=case when p_status='active' then coalesce(dispatched_at,now()) else dispatched_at end,
   started_at=case when p_status='active' then coalesce(started_at,now()) else started_at end,
   actual_completed_at=case when p_status='completed' then coalesce(actual_completed_at,now()) when p_status in ('planned','active','paused') then null else actual_completed_at end,
   dispatch_locked=case when p_status in ('active','completed') then true when p_status='planned' then false else dispatch_locked end,
   updated_at=now()
 where id=p_route_id and business_id=p_business_id returning * into r;
 if not found then raise exception 'Route not found'; end if;
 return r;
end $$;
