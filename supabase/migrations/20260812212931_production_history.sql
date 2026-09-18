create index if not exists business_members_user_business_idx on public.business_members(user_id, business_id);
create index if not exists profiles_username_idx on public.profiles(username) where username is not null;
create index if not exists reviews_user_created_idx on public.reviews(user_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists promotions_active_business_idx on public.promotions(business_id, active, starts_at desc);
create index if not exists subscriptions_owner_status_idx on public.subscriptions(user_id, status) where user_id is not null;
create index if not exists subscriptions_business_status_idx on public.subscriptions(business_id, status) where business_id is not null;
