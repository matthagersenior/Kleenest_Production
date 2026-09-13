
create index if not exists review_photo_storage_moderation_jobs_report_idx
  on public.review_photo_storage_moderation_jobs(report_id)
  where report_id is not null;

create index if not exists review_photo_storage_moderation_jobs_requested_by_idx
  on public.review_photo_storage_moderation_jobs(requested_by)
  where requested_by is not null;
