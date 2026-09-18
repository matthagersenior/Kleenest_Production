grant select on table public.fleet_route_stops to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='fleet_routes'
  ) then
    alter publication supabase_realtime add table public.fleet_routes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='fleet_route_stops'
  ) then
    alter publication supabase_realtime add table public.fleet_route_stops;
  end if;
end $$;
