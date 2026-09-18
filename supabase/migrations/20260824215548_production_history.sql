drop policy if exists social_comments_public_read on public.social_post_comments;
create policy social_comments_public_read on public.social_post_comments for select to public using ((status='published'::text) or (auth.uid()=user_id));
drop policy if exists social_comments_own_insert on public.social_post_comments;
create policy social_comments_own_insert on public.social_post_comments for insert to authenticated with check (auth.uid()=user_id and exists(select 1 from public.social_posts p where p.id=social_post_comments.post_id));
drop policy if exists social_posts_own_insert on public.social_posts;
create policy social_posts_own_insert on public.social_posts for insert to authenticated with check (auth.uid()=user_id and (media_storage_path is null or (storage.foldername(media_storage_path))[1]=auth.uid()::text));
drop policy if exists social_posts_own_update on public.social_posts;
create policy social_posts_own_update on public.social_posts for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id and (media_storage_path is null or (storage.foldername(media_storage_path))[1]=auth.uid()::text));
