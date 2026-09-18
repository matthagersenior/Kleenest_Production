alter table public.pricing_family_catalog_v1 enable row level security;
drop policy if exists pricing_family_catalog_v1_public_read on public.pricing_family_catalog_v1;
create policy pricing_family_catalog_v1_public_read on public.pricing_family_catalog_v1 for select using (active = true);
