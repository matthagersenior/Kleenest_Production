create table if not exists public.social_post_likes (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);
create table if not exists public.social_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.social_post_comments(id) on delete cascade,
  content text not null check (length(trim(content)) between 1 and 2000),
  status text not null default 'published' check (status in ('published','hidden','flagged','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.social_post_saves (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);
create table if not exists public.social_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create table if not exists public.social_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  activity_type text not null,
  post_id uuid references public.social_posts(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  business_id uuid references public.businesses(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.social_challenge_entries (
  challenge_id uuid not null references public.progression_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id,user_id)
);
create index if not exists social_posts_created_at_idx on public.social_posts(created_at desc);
create index if not exists social_posts_location_id_idx on public.social_posts(location_id);
create index if not exists social_post_comments_post_id_created_at_idx on public.social_post_comments(post_id,created_at);
create index if not exists social_activity_user_created_at_idx on public.social_activity(user_id,created_at desc);
create index if not exists social_activity_created_at_idx on public.social_activity(created_at desc);
create index if not exists social_post_reports_status_idx on public.social_post_reports(status,created_at);

alter table public.social_post_likes enable row level security;
alter table public.social_post_comments enable row level security;
alter table public.social_post_saves enable row level security;
alter table public.social_post_reports enable row level security;
alter table public.social_activity enable row level security;
alter table public.social_challenge_entries enable row level security;

create policy social_posts_public_read on public.social_posts for select using (true);
create policy social_posts_own_insert on public.social_posts for insert with check (auth.uid() = user_id);
create policy social_posts_own_update on public.social_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy social_posts_own_delete on public.social_posts for delete using (auth.uid() = user_id);

create policy social_likes_public_read on public.social_post_likes for select using (true);
create policy social_likes_own_insert on public.social_post_likes for insert with check (auth.uid() = user_id);
create policy social_likes_own_delete on public.social_post_likes for delete using (auth.uid() = user_id);

create policy social_comments_public_read on public.social_post_comments for select using (status = 'published' or auth.uid() = user_id);
create policy social_comments_own_insert on public.social_post_comments for insert with check (auth.uid() = user_id);
create policy social_comments_own_update on public.social_post_comments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy social_comments_own_delete on public.social_post_comments for delete using (auth.uid() = user_id);

create policy social_saves_own_read on public.social_post_saves for select using (auth.uid() = user_id);
create policy social_saves_own_insert on public.social_post_saves for insert with check (auth.uid() = user_id);
create policy social_saves_own_delete on public.social_post_saves for delete using (auth.uid() = user_id);

create policy social_reports_own_insert on public.social_post_reports for insert with check (auth.uid() = reporter_id);
create policy social_reports_own_read on public.social_post_reports for select using (auth.uid() = reporter_id);

create policy social_activity_public_read on public.social_activity for select using (true);
create policy social_activity_own_insert on public.social_activity for insert with check (auth.uid() = user_id or auth.uid() = actor_user_id);

create policy social_challenge_entries_own_read on public.social_challenge_entries for select using (auth.uid() = user_id);
create policy social_challenge_entries_own_insert on public.social_challenge_entries for insert with check (auth.uid() = user_id);
create policy social_challenge_entries_own_update on public.social_challenge_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy social_challenge_entries_own_delete on public.social_challenge_entries for delete using (auth.uid() = user_id);
