drop policy if exists social_comments_own_insert on public.social_post_comments;
create policy social_comments_own_insert on public.social_post_comments for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.social_posts p where p.id = social_post_comments.post_id));

drop policy if exists social_likes_own_insert on public.social_post_likes;
create policy social_likes_own_insert on public.social_post_likes for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.social_posts p where p.id = social_post_likes.post_id));

drop policy if exists social_saves_own_insert on public.social_post_saves;
create policy social_saves_own_insert on public.social_post_saves for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.social_posts p where p.id = social_post_saves.post_id));

alter policy messages_sender_insert on public.messages with check ((select auth.uid()) = from_id and (select auth.uid()) <> to_id);

alter policy social_comments_own_update on public.social_post_comments with check (auth.uid() = user_id and exists (select 1 from public.social_posts p where p.id = social_post_comments.post_id));
