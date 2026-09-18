drop policy if exists social_posts_public_read on public.social_posts; create policy social_posts_public_read on public.social_posts for select to public using (true);
