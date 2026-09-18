create or replace function public.mobile_review_photos_for_reviews(p_review_ids uuid[])
returns table(review_id uuid, storage_path text, mime_type text, width integer, height integer, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.review_id,rp.storage_path,rp.mime_type,rp.width,rp.height,rp.sort_order
  from public.review_photos rp
  join public.reviews r on r.id=rp.review_id
  where r.status='published'
    and rp.review_id = any(coalesce(p_review_ids,'{}'::uuid[]))
  order by rp.review_id,rp.sort_order,rp.created_at;
$$;
revoke all on function public.mobile_review_photos_for_reviews(uuid[]) from public;
grant execute on function public.mobile_review_photos_for_reviews(uuid[]) to anon,authenticated;
