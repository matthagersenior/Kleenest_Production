-- Prevent duplicate published reviews for the same check-in. A check-in can still exist without a review.
create unique index if not exists reviews_one_per_checkin_uidx
on public.reviews(check_in_id)
where check_in_id is not null;

-- Prevent a user from redeeming the same promotion repeatedly at the exact same check-in/location when the promotion is configured as one-time per user.
-- The existing schema does not expose a one-time flag, so do not impose that business rule globally.

-- Keep the highest-value history lookups available without changing application semantics.
create index if not exists check_ins_user_location_time_idx
on public.check_ins(user_id, location_id, checked_in_at desc);
