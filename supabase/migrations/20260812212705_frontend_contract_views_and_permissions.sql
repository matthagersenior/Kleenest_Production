create or replace view public.app_profile
with (security_invoker = true)
as
select p.*
from public.profiles p
where p.id = (select auth.uid());

create or replace view public.app_business_memberships
with (security_invoker = true)
as
select bm.*, b.name as business_name
from public.business_members bm
join public.businesses b on b.id = bm.business_id
where bm.user_id = (select auth.uid());

create index if not exists business_members_user_business_idx on public.business_members(user_id, business_id);
create index if not exists profiles_id_idx on public.profiles(id);

revoke all on public.app_profile from anon;
revoke all on public.app_business_memberships from anon;
grant select on public.app_profile to authenticated;
grant select on public.app_business_memberships to authenticated;
