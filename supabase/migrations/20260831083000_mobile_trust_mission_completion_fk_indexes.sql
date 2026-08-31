create index if not exists user_trust_missions_qualifying_review_idx
  on public.user_trust_missions(qualifying_review_id)
  where qualifying_review_id is not null;

create index if not exists user_trust_missions_qualifying_check_in_idx
  on public.user_trust_missions(qualifying_check_in_id)
  where qualifying_check_in_id is not null;
