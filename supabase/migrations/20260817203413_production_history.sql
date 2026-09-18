alter function public.nearby_locations(double precision,double precision,integer,integer) security invoker;
alter function public.nearby_locations_enriched(double precision,double precision,integer,integer,uuid[]) security invoker;
comment on function public.nearby_locations(double precision,double precision,integer,integer) is 'Public Free Maps read RPC. SECURITY INVOKER intentionally relies on public SELECT RLS for verified active locations.';
comment on function public.nearby_locations_enriched(double precision,double precision,integer,integer,uuid[]) is 'Public Free Maps enriched read RPC. SECURITY INVOKER intentionally relies on public SELECT RLS for verified active locations and public amenity/fixture read policies.';
