create policy "promotions_public_active_select" on public.promotions for select to anon, authenticated using (
  active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
  and exists (
    select 1 from public.businesses b
    where b.id = promotions.business_id
      and b.verification_status = 'verified'::public.verification_status
  )
  and (
    location_id is null
    or exists (
      select 1 from public.locations l
      where l.id = promotions.location_id
        and l.business_id = promotions.business_id
        and l.is_active = true
        and l.verification_status = 'verified'::public.verification_status
    )
  )
);
