-- Rewards/history indexes.
create index if not exists point_transactions_user_created_idx on public.point_transactions(user_id, created_at desc);
create index if not exists user_badges_user_earned_idx on public.user_badges(user_id, earned_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists location_photos_location_created_idx on public.location_photos(location_id, created_at desc);
create index if not exists review_photos_review_created_idx on public.review_photos(review_id, created_at desc);

-- Users must never be able to manufacture their own reward ledger entries or badges.
drop policy if exists point_transactions_own_insert on public.point_transactions;
drop policy if exists point_transactions_own_update on public.point_transactions;
drop policy if exists point_transactions_own_delete on public.point_transactions;

-- Public badge catalog is readable; awards are server-controlled.
drop policy if exists user_badges_own_insert on public.user_badges;
drop policy if exists user_badges_own_update on public.user_badges;
drop policy if exists user_badges_own_delete on public.user_badges;

-- Prevent users from changing ownership metadata on uploaded location photos.
drop policy if exists photo_own_update on public.location_photos;
create policy photo_own_update on public.location_photos
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Keep notification ownership strict; clients can mark their own notifications read but cannot transfer them.
drop policy if exists notifications_own_delete on public.notifications;
create policy notifications_own_delete on public.notifications
for delete to authenticated
using ((select auth.uid()) = user_id);

-- Add an RPC for safely marking a notification read without exposing arbitrary notification mutation.
create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public
as $$
  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id
     and user_id = (select auth.uid())
  returning true;
$$;
revoke execute on function public.mark_notification_read(uuid) from anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
