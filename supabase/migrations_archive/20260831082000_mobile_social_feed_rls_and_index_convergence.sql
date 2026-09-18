drop policy if exists social_posts_own_all on public.social_posts;
create policy social_posts_insert_own on public.social_posts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy social_posts_update_own on public.social_posts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy social_posts_delete_own on public.social_posts for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_comments_public_read on public.social_post_comments;
create policy social_comments_public_read on public.social_post_comments for select to authenticated using (((select auth.uid()) = user_id) or exists (select 1 from public.social_posts p where p.id = social_post_comments.post_id));
drop policy if exists social_post_comments_own_all on public.social_post_comments;
create policy social_post_comments_insert_own on public.social_post_comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy social_post_comments_update_own on public.social_post_comments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy social_post_comments_delete_own on public.social_post_comments for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_post_likes_own_all on public.social_post_likes;
create policy social_post_likes_insert_own on public.social_post_likes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy social_post_likes_update_own on public.social_post_likes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy social_post_likes_delete_own on public.social_post_likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_post_saves_own_all on public.social_post_saves;
create policy social_post_saves_select_own on public.social_post_saves for select to authenticated using ((select auth.uid()) = user_id);
create policy social_post_saves_insert_own on public.social_post_saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy social_post_saves_update_own on public.social_post_saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy social_post_saves_delete_own on public.social_post_saves for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists social_reports_own_insert on public.social_post_reports;
create policy social_reports_own_insert on public.social_post_reports for insert to authenticated with check ((select auth.uid()) = reporter_id);
drop policy if exists social_reports_own_read on public.social_post_reports;
create policy social_reports_own_read on public.social_post_reports for select to authenticated using ((select auth.uid()) = reporter_id);

drop policy if exists social_challenge_entries_own_delete on public.social_challenge_entries;
create policy social_challenge_entries_own_delete on public.social_challenge_entries for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists social_challenge_entries_own_read on public.social_challenge_entries;
create policy social_challenge_entries_own_read on public.social_challenge_entries for select to authenticated using ((select auth.uid()) = user_id);

drop index if exists public.social_posts_user_idx;
alter table public.social_challenge_entries drop constraint if exists social_challenge_entries_challenge_user_key;
drop index if exists public.social_challenge_entries_challenge_idx;