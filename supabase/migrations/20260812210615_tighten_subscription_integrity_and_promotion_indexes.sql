-- A subscription belongs to exactly one principal: either a user or a business.
alter table public.subscriptions drop constraint if exists subscriptions_check;
alter table public.subscriptions add constraint subscriptions_exactly_one_owner_check check (((user_id is not null) <> (business_id is not null)));

-- Fast subscription lookups used by account/business dashboards and webhook reconciliation.
create index if not exists subscriptions_user_status_idx on public.subscriptions (user_id, status) where user_id is not null;
create index if not exists subscriptions_business_status_idx on public.subscriptions (business_id, status) where business_id is not null;
create unique index if not exists subscriptions_provider_subscription_uidx on public.subscriptions (provider_subscription_id) where provider_subscription_id is not null;

-- Promotion discovery and redemption history.
create index if not exists promotions_business_active_idx on public.promotions (business_id, active, starts_at, ends_at);
create index if not exists promotion_redemptions_user_time_idx on public.promotion_redemptions (user_id, redeemed_at desc);
create index if not exists promotion_redemptions_promotion_time_idx on public.promotion_redemptions (promotion_id, redeemed_at desc);

-- QR management and check-in history.
create index if not exists qr_codes_location_active_idx on public.qr_codes (location_id, active);
create index if not exists check_ins_location_time_idx on public.check_ins (location_id, checked_in_at desc);
create index if not exists check_ins_user_time_idx on public.check_ins (user_id, checked_in_at desc);
