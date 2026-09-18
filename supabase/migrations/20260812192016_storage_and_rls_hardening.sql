begin;

-- Storage buckets for app media. Files remain private unless an explicit policy grants access.
insert into storage.buckets(id,name,public) values
('avatars','avatars',true),
('location-photos','location-photos',true),
('review-photos','review-photos',true),
('social-media','social-media',true)
on conflict(id) do update set public=excluded.public;

-- Public read for published app media; authenticated users can upload to their own folder.
create policy avatars_public_read on storage.objects for select to public using (bucket_id='avatars');
create policy location_photos_public_read on storage.objects for select to public using (bucket_id='location-photos');
create policy review_photos_public_read on storage.objects for select to public using (bucket_id='review-photos');
create policy social_media_public_read on storage.objects for select to public using (bucket_id='social-media');

create policy avatars_user_upload on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy location_photos_user_upload on storage.objects for insert to authenticated with check (bucket_id='location-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy review_photos_user_upload on storage.objects for insert to authenticated with check (bucket_id='review-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy social_media_user_upload on storage.objects for insert to authenticated with check (bucket_id='social-media' and (storage.foldername(name))[1]=(select auth.uid())::text);

create policy avatars_user_delete on storage.objects for delete to authenticated using (bucket_id='avatars' and owner_id=(select auth.uid())::text);
create policy location_photos_user_delete on storage.objects for delete to authenticated using (bucket_id='location-photos' and owner_id=(select auth.uid())::text);
create policy review_photos_user_delete on storage.objects for delete to authenticated using (bucket_id='review-photos' and owner_id=(select auth.uid())::text);
create policy social_media_user_delete on storage.objects for delete to authenticated using (bucket_id='social-media' and owner_id=(select auth.uid())::text);

-- Allow authenticated business staff to create analytics events for their own business.
create policy analytics_member_insert on public.analytics_events for insert to authenticated with check (exists(select 1 from public.business_members bm where bm.business_id=analytics_events.business_id and bm.user_id=(select auth.uid())));

-- QR codes are publicly readable when active, but only business staff can manage them.
create policy qr_codes_public_select on public.qr_codes for select to anon,authenticated using (active=true);
create policy qr_codes_member_all on public.qr_codes for all to authenticated using (exists(select 1 from public.locations l join public.business_members bm on bm.business_id=l.business_id where l.id=qr_codes.location_id and bm.user_id=(select auth.uid()) and bm.role in ('owner','admin','manager'))) with check (exists(select 1 from public.locations l join public.business_members bm on bm.business_id=l.business_id where l.id=qr_codes.location_id and bm.user_id=(select auth.uid()) and bm.role in ('owner','admin','manager')));

-- Make business members insertable by business owners/admins.
create policy business_members_owner_insert on public.business_members for insert to authenticated with check (exists(select 1 from public.business_members bm where bm.business_id=business_members.business_id and bm.user_id=(select auth.uid()) and bm.role in ('owner','admin')));
create policy business_members_owner_update on public.business_members for update to authenticated using (exists(select 1 from public.business_members bm where bm.business_id=business_members.business_id and bm.user_id=(select auth.uid()) and bm.role in ('owner','admin'))) with check (exists(select 1 from public.business_members bm where bm.business_id=business_members.business_id and bm.user_id=(select auth.uid()) and bm.role in ('owner','admin')));
create policy business_members_owner_delete on public.business_members for delete to authenticated using (exists(select 1 from public.business_members bm where bm.business_id=business_members.business_id and bm.user_id=(select auth.uid()) and bm.role in ('owner','admin')));

-- Users can submit their own location reports and authenticated users can see approved reports.
create policy reports_approved_public_select on public.reports for select to anon,authenticated using (status in ('approved','added'));

-- Seed helper badges and plans are already idempotent.
commit;
