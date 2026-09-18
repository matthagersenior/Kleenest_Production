create extension if not exists pgcrypto;

create table if not exists public.place_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  category text not null references public.place_categories(slug),
  description text,
  address text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  rating numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count integer not null default 0 check (review_count >= 0),
  is_active boolean not null default true,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_category_idx on public.places(category);
create index if not exists places_active_idx on public.places(is_active);
create index if not exists places_location_idx on public.places(latitude, longitude);

insert into public.place_categories (slug, name) values
 ('restaurant','Restaurants'), ('cafe','Cafes'), ('gas_station','Gas Stations'),
 ('shopping','Shopping'), ('park','Parks'), ('service','Services')
on conflict (slug) do update set name = excluded.name;

insert into public.places (name, slug, category, description, address, rating, review_count, is_verified)
values
 ('Kleenest Coffee House','kleenest-coffee-house','cafe','A local coffee stop with a welcoming atmosphere.','12 Main Street',4.8,38,true),
 ('Main Street Market','main-street-market','restaurant','A neighborhood restaurant serving the local community.','24 Main Street',4.6,51,true),
 ('River Road Fuel','river-road-fuel','gas_station','Convenient fuel and everyday essentials.','101 River Road',4.4,22,true),
 ('Downtown Goods','downtown-goods','shopping','Independent local shopping and specialty goods.','7 Market Avenue',4.7,17,true),
 ('Riverside Park','riverside-park','park','A clean outdoor space for walks, recreation, and events.','1 Riverside Drive',4.9,29,true)
on conflict (slug) do nothing;

alter table public.place_categories enable row level security;
alter table public.places enable row level security;

drop policy if exists "public can read active place categories" on public.place_categories;
create policy "public can read active place categories" on public.place_categories for select to anon, authenticated using (true);

drop policy if exists "public can read active places" on public.places;
create policy "public can read active places" on public.places for select to anon, authenticated using (is_active = true);
