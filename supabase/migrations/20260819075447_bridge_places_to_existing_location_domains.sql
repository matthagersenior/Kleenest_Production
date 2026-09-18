alter table public.places add column if not exists location_id uuid references public.locations(id) on delete set null;

insert into public.locations (name, address, place_type, description, rating, review_count, verification_status, source, is_active)
select p.name, p.address, p.category, p.description, p.rating, p.review_count, 'verified', 'kleenest_app_seed', true
from public.places p
where p.location_id is null
and not exists (select 1 from public.locations l where l.name = p.name and l.source = 'kleenest_app_seed');

update public.places p
set location_id = l.id
from public.locations l
where p.location_id is null and l.name = p.name and l.source = 'kleenest_app_seed';

create index if not exists places_location_id_idx on public.places(location_id);

alter table public.reviews enable row level security;
drop policy if exists "published reviews are public" on public.reviews;
drop policy if exists "users create their own reviews" on public.reviews;
drop policy if exists "users update their own reviews" on public.reviews;
drop policy if exists "users delete their own reviews" on public.reviews;
create policy "published reviews are public" on public.reviews for select to anon, authenticated using (status = 'published' or auth.uid() = user_id);
create policy "users create their own reviews" on public.reviews for insert to authenticated with check (auth.uid() = user_id);
create policy "users update their own reviews" on public.reviews for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users delete their own reviews" on public.reviews for delete to authenticated using (auth.uid() = user_id);

alter table public.check_ins enable row level security;
drop policy if exists "users read their own checkins" on public.check_ins;
drop policy if exists "users create their own checkins" on public.check_ins;
create policy "users read their own checkins" on public.check_ins for select to authenticated using (auth.uid() = user_id);
create policy "users create their own checkins" on public.check_ins for insert to authenticated with check (auth.uid() = user_id);

alter table public.point_transactions enable row level security;
create policy "users read own point transactions" on public.point_transactions for select to authenticated using (auth.uid() = user_id);

alter table public.location_verification_points enable row level security;
create policy "users read own verification points" on public.location_verification_points for select to authenticated using (auth.uid() = user_id);
