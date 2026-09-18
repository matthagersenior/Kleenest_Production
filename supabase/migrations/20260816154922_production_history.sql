alter table public.social_posts add column if not exists kind text not null default 'discovery' check (kind in ('discovery','tip','verification','review','route','win'));
create index if not exists social_posts_kind_created_at_idx on public.social_posts(kind,created_at desc);
