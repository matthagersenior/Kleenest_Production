drop policy if exists profiles_public_select on public.profiles;
create policy profiles_own_select on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create or replace view public.public_profiles as
select id, display_name, username, avatar_url, bio
from public.profiles;

grant select on public.public_profiles to anon, authenticated;
revoke select on public.profiles from anon;
revoke select on public.profiles from authenticated;
grant select on public.profiles to authenticated;
