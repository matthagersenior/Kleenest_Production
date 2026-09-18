-- Canonical map discovery is intentionally public-read: it returns location/network discovery data and contains no user mutation.
-- Keep PUBLIC inheritance removed, then explicitly grant only the API roles that are allowed to invoke it.
revoke execute on function public.map_network_nearby_v1(double precision, double precision, integer, integer, text, text, text[]) from public;
revoke execute on function public.map_network_nearby_v1(double precision, double precision, integer, integer, text, text, text[]) from anon;
revoke execute on function public.map_network_nearby_v1(double precision, double precision, integer, integer, text, text, text[]) from authenticated;
grant execute on function public.map_network_nearby_v1(double precision, double precision, integer, integer, text, text, text[]) to anon;
grant execute on function public.map_network_nearby_v1(double precision, double precision, integer, integer, text, text, text[]) to authenticated;
