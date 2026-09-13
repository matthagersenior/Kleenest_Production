
revoke all on public.public_locations from anon, authenticated;
grant select on public.public_locations to anon, authenticated;
grant select on public.public_locations to service_role;
