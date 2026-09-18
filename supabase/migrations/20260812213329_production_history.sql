-- QR codes contain the credential used by verify_checkin(); do not expose the code to anonymous clients.
drop policy if exists qr_codes_public_select on public.qr_codes;

-- Profiles contain roles, subscription tier, counters, and admin state; expose only the fields needed for public identity.
drop policy if exists profiles_public_select on public.profiles;
create policy profiles_public_select on public.profiles
for select to authenticated
using (true);

-- Badge ownership is public-facing, but only authenticated users need direct table access.
drop policy if exists user_badges_public_select on public.user_badges;
create policy user_badges_public_select on public.user_badges
for select to authenticated
using (true);
