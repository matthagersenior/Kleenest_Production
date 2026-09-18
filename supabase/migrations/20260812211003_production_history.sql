-- Certification infrastructure only: criteria are data-driven and intentionally do not hard-code business rules.
create table if not exists public.certification_tiers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  minimum_rating numeric(3,2),
  minimum_reviews integer,
  minimum_check_ins integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint certification_tiers_rating_check check (minimum_rating is null or (minimum_rating >= 0 and minimum_rating <= 5)),
  constraint certification_tiers_reviews_check check (minimum_reviews is null or minimum_reviews >= 0),
  constraint certification_tiers_checkins_check check (minimum_check_ins is null or minimum_check_ins >= 0)
);

create table if not exists public.business_certifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  certification_tier_id uuid not null references public.certification_tiers(id),
  status text not null default 'pending',
  awarded_at timestamptz,
  expires_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  constraint business_certifications_status_check check (status in ('pending','active','suspended','expired','revoked'))
);

create unique index if not exists business_certifications_one_active_tier_idx
on public.business_certifications(business_id, certification_tier_id)
where status in ('pending','active');
create index if not exists business_certifications_business_status_idx on public.business_certifications(business_id,status);
create index if not exists business_certifications_expiry_idx on public.business_certifications(expires_at) where expires_at is not null;

alter table public.certification_tiers enable row level security;
alter table public.business_certifications enable row level security;

drop policy if exists certification_tiers_public_select on public.certification_tiers;
create policy certification_tiers_public_select on public.certification_tiers for select to anon, authenticated using (active = true);

drop policy if exists business_certifications_public_select on public.business_certifications;
create policy business_certifications_public_select on public.business_certifications for select to anon, authenticated using (status = 'active');

drop policy if exists business_certifications_member_select on public.business_certifications;
create policy business_certifications_member_select on public.business_certifications for select to authenticated using (
  exists (select 1 from public.business_members bm where bm.business_id = business_certifications.business_id and bm.user_id = (select auth.uid()))
);

-- Certification changes are server/admin controlled; no client insert/update/delete policies are created.
