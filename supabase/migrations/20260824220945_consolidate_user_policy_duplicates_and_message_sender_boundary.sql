drop policy if exists user_feedback_own_insert on public.user_feedback;
drop policy if exists feedback_insert_authenticated on public.user_feedback;
create policy feedback_insert_authenticated on public.user_feedback for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists social_posts_own_all on public.social_posts;
create policy social_posts_own_all on public.social_posts for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists messages_recipient_update on public.messages;
create policy messages_recipient_update on public.messages for update to authenticated using((select auth.uid())=to_id) with check((select auth.uid())=to_id);
