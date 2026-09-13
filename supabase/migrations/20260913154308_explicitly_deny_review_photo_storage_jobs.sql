
drop policy if exists review_photo_storage_jobs_deny_anon on public.review_photo_storage_moderation_jobs;
drop policy if exists review_photo_storage_jobs_deny_authenticated on public.review_photo_storage_moderation_jobs;

create policy review_photo_storage_jobs_deny_anon
  on public.review_photo_storage_moderation_jobs
  as restrictive
  for all
  to anon
  using (false)
  with check (false);

create policy review_photo_storage_jobs_deny_authenticated
  on public.review_photo_storage_moderation_jobs
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
