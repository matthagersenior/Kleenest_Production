-- Reviews: preserve published-or-own read semantics while removing duplicate permissive policies.
drop policy if exists "published reviews are public" on public.reviews;
drop policy if exists reviews_public_select on public.reviews;
create policy reviews_public_or_own_select on public.reviews
for select to anon, authenticated
using (status = 'published'::public.review_status or user_id = (select auth.uid()));

drop policy if exists "users create their own reviews" on public.reviews;
drop policy if exists reviews_own_insert on public.reviews;
create policy reviews_own_insert on public.reviews
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users update their own reviews" on public.reviews;
drop policy if exists reviews_own_update on public.reviews;
create policy reviews_own_update on public.reviews
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "users delete their own reviews" on public.reviews;
drop policy if exists reviews_own_delete on public.reviews;
create policy reviews_own_delete on public.reviews
for delete to authenticated
using (user_id = (select auth.uid()));

-- Check-ins: converge duplicate reads and make self checks init-plan safe.
drop policy if exists "users read their own checkins" on public.check_ins;
drop policy if exists checkins_own_select on public.check_ins;
create policy checkins_own_select on public.check_ins
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users create their own checkins" on public.check_ins;
create policy checkins_own_insert on public.check_ins
for insert to authenticated
with check (user_id = (select auth.uid()));

-- Verification points and point transactions: collapse exact duplicate owner reads.
drop policy if exists "users read own verification points" on public.location_verification_points;
drop policy if exists verification_points_own_select on public.location_verification_points;
create policy verification_points_own_select on public.location_verification_points
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users read own point transactions" on public.point_transactions;
drop policy if exists point_transactions_own_select on public.point_transactions;
create policy point_transactions_own_select on public.point_transactions
for select to authenticated
using (user_id = (select auth.uid()));

-- Follows: one connected read policy plus explicit follower-owned mutation policies.
drop policy if exists follows_own_all on public.follows;
drop policy if exists follows_read_connected on public.follows;
create policy follows_read_connected on public.follows
for select to authenticated
using (follower_id = (select auth.uid()) or following_id = (select auth.uid()));
create policy follows_own_insert on public.follows
for insert to authenticated
with check (follower_id = (select auth.uid()) and follower_id <> following_id);
create policy follows_own_update on public.follows
for update to authenticated
using (follower_id = (select auth.uid()))
with check (follower_id = (select auth.uid()) and follower_id <> following_id);
create policy follows_own_delete on public.follows
for delete to authenticated
using (follower_id = (select auth.uid()));
