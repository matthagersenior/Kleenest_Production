revoke select, insert, update, delete on table public.profiles, public.check_ins, public.point_transactions, public.user_badges, public.notifications, public.subscriptions, public.promotion_redemptions, public.business_members from anon;
revoke insert, update, delete on table public.locations, public.reviews, public.promotions, public.businesses from anon;
revoke select on table public.business_members, public.businesses from anon;
