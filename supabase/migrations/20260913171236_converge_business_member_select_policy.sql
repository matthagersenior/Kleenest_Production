-- Converge authenticated Business SELECT visibility into one permissive policy.
-- Members can see their own pending workspace; verified businesses and platform-owner access remain unchanged.

drop policy if exists businesses_member_select on public.businesses;
drop policy if exists businesses_platform_owner_select on public.businesses;

create policy businesses_platform_owner_select
on public.businesses
for select
to authenticated
using (
  verification_status='verified'::public.verification_status
  or public.is_platform_owner_session()
  or exists (
    select 1
    from public.business_members bm
    where bm.business_id=businesses.id
      and bm.user_id=(select auth.uid())
  )
);
