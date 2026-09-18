-- Performance indexes for the core product flows.
create index if not exists idx_check_ins_user_location_time on public.check_ins(user_id, location_id, checked_in_at desc);
create index if not exists idx_check_ins_location_time on public.check_ins(location_id, checked_in_at desc);
create index if not exists idx_reviews_location_created on public.reviews(location_id, created_at desc);
create index if not exists idx_reviews_user_created on public.reviews(user_id, created_at desc);
create index if not exists idx_point_transactions_user_created on public.point_transactions(user_id, created_at desc);
create index if not exists idx_user_badges_badge on public.user_badges(badge_id);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists idx_analytics_business_created on public.analytics_events(business_id, created_at desc);
create index if not exists idx_analytics_user_created on public.analytics_events(user_id, created_at desc);

-- Business replies use a narrowly scoped RPC so business users cannot modify the review author's rating/content.
create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.reviews%rowtype;
  v_uid uuid := auth.uid();
  v_reply text := nullif(trim(p_reply), '');
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_reply is null then raise exception 'Reply cannot be empty'; end if;
  if length(v_reply) > 2000 then raise exception 'Reply is too long'; end if;

  select r.* into v_review
  from public.reviews r
  where r.id = p_review_id;

  if not found then raise exception 'Review not found'; end if;

  if not exists (
    select 1
    from public.locations l
    join public.business_members bm on bm.business_id = l.business_id
    where l.id = v_review.location_id
      and bm.user_id = v_uid
      and bm.role = any (array['owner'::business_member_role,'admin'::business_member_role,'manager'::business_member_role])
  ) then
    raise exception 'Not authorized to reply to this review';
  end if;

  update public.reviews
  set business_reply = v_reply,
      business_replied_at = now(),
      updated_at = now()
  where id = p_review_id
  returning * into v_review;

  return v_review;
end;
$$;

revoke execute on function public.reply_to_review(uuid,text) from public, anon;
grant execute on function public.reply_to_review(uuid,text) to authenticated;

-- Analytics events must belong to an authenticated actor or an authorized business member.
drop policy if exists analytics_member_insert on public.analytics_events;
create policy analytics_member_insert
on public.analytics_events
for insert to authenticated
with check (
  (user_id is null or user_id = (select auth.uid()))
  and (
    business_id is null
    or exists (
      select 1 from public.business_members bm
      where bm.business_id = analytics_events.business_id
        and bm.user_id = (select auth.uid())
    )
  )
  and (
    location_id is null
    or exists (
      select 1 from public.locations l
      where l.id = analytics_events.location_id
        and (
          l.business_id is null
          or exists (select 1 from public.business_members bm where bm.business_id = l.business_id and bm.user_id = (select auth.uid()))
        )
    )
  )
);

-- Users can create their own reviews only when authenticated. Keep business replies isolated to the RPC above.
drop policy if exists reviews_own_update on public.reviews;
create policy reviews_own_update
on public.reviews
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
