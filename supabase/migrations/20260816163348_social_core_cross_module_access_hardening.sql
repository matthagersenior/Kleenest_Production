alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.check_ins enable row level security;
alter table public.location_bathroom_verifications enable row level security;
alter table public.locations enable row level security;

create index if not exists reviews_location_created_at_idx on public.reviews (location_id, created_at desc) where status = 'published';
create index if not exists check_ins_location_created_at_idx on public.check_ins (location_id, checked_in_at desc);
create index if not exists bathroom_verifications_location_created_at_idx on public.location_bathroom_verifications (location_id, created_at desc);
create index if not exists locations_verified_active_idx on public.locations (verification_status, bathroom_verification_status, is_active) where is_active = true;

-- Social may consume public location/review/check-in/verification data, but may not broaden the source modules' ownership rules.
-- Cross-module reads remain governed by each source table's canonical RLS policy.
