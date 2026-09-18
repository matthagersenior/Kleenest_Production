alter table public.business_events add column if not exists status text not null default 'active' check (status in ('draft','active','paused','archived'));
