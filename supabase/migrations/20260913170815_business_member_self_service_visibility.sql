-- Allow authenticated Business members to see their own pending/unverified Business row.
-- Trust verification remains independent: non-members still only see verified businesses.

drop policy if exists businesses_member_select on public.businesses;

create policy businesses_member_select
on public.businesses
for select
to authenticated
using (
  exists (
    select 1
    from public.business_members bm
    where bm.business_id=businesses.id
      and bm.user_id=(select auth.uid())
  )
);
