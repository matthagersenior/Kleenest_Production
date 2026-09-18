-- Keep the more explicit earned_at index name; remove the exact unconstrained duplicate.
drop index if exists public.user_badges_user_earned_idx;
