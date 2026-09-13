
-- Reviews: public/own row visibility stays, but raw author/check-in identity is no longer selectable.
revoke select on table public.reviews from anon,authenticated;
revoke references,trigger on table public.reviews from anon,authenticated;

grant select(
  id,location_id,stars,cleanliness_pct,comment,status,
  business_reply,business_replied_at,created_at,updated_at
) on table public.reviews to anon,authenticated;

-- Review photos: no direct client SELECT grant today, but make the policy correct if that changes later.
drop policy if exists review_photos_public_select on public.review_photos;
create policy review_photos_public_select
on public.review_photos
for select
to anon,authenticated
using (
  moderation_status='visible'
  and exists(
    select 1
    from public.reviews r
    where r.id=review_photos.review_id
      and r.status='published'
  )
);

-- Amenity observations: raw evidence is contributor-private. Cross-user consumption must use aggregate/evidence RPCs.
drop policy if exists location_amenity_observations_select_public on public.location_amenity_observations;
drop policy if exists location_amenity_observations_select_own on public.location_amenity_observations;

create policy location_amenity_observations_select_own
on public.location_amenity_observations
for select
to authenticated
using (user_id=(select auth.uid()));

revoke select,references,trigger on table public.location_amenity_observations from anon;
revoke references,trigger on table public.location_amenity_observations from authenticated;
grant select on table public.location_amenity_observations to authenticated;

-- Location photos: public can only see visible media and never contributor/check-in/moderation-reason internals.
drop policy if exists location_photos_public_select on public.location_photos;
create policy location_photos_public_select
on public.location_photos
for select
to anon,authenticated
using (moderation_status='visible');

revoke select,references,trigger on table public.location_photos from anon,authenticated;

grant select(
  id,location_id,storage_path,caption,created_at,media_type,mime_type,
  size_bytes,width,height,sort_order,is_featured,origin,business_id,moderation_status
) on table public.location_photos to anon,authenticated;
