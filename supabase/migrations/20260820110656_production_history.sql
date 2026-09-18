create table if not exists public.location_verification_observations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_open boolean not null,
  is_public boolean not null,
  observed_at timestamptz not null default now(),
  source text not null default 'community',
  notes text,
  created_at timestamptz not null default now(),
  unique(location_id,user_id)
);
create index if not exists idx_location_verification_observations_location on public.location_verification_observations(location_id, observed_at desc);
alter table public.location_verification_observations enable row level security;
create policy "users can read verification observations" on public.location_verification_observations for select to authenticated using (true);
create policy "users can submit own verification observations" on public.location_verification_observations for insert to authenticated with check (auth.uid() = user_id);
create policy "users can update own verification observations" on public.location_verification_observations for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
