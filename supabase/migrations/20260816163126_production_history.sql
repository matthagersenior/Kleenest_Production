drop policy if exists social_posts_public_select on public.social_posts;

alter table public.follows enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_comments enable row level security;
alter table public.social_post_likes enable row level security;
alter table public.social_post_saves enable row level security;
alter table public.social_post_reports enable row level security;

create index if not exists social_posts_user_created_at_idx on public.social_posts (user_id, created_at desc);
create index if not exists social_post_comments_post_created_at_idx on public.social_post_comments (post_id, created_at asc);
create index if not exists social_post_likes_post_idx on public.social_post_likes (post_id);
create index if not exists social_post_saves_post_idx on public.social_post_saves (post_id);
