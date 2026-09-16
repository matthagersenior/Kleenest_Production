-- Hardening for progression reward runtime tables:
-- keep direct table access explicitly denied and cover every new foreign-key lookup used by RPCs.

create index if not exists community_reward_challenge_participants_user_idx
  on public.community_reward_challenge_participants(user_id,challenge_id);
create index if not exists community_reward_challenges_creator_idx
  on public.community_reward_challenges(creator_user_id,created_at desc);
create index if not exists community_reward_votes_user_idx
  on public.community_reward_votes(user_id,proposal_code);
create index if not exists review_reward_reactions_user_idx
  on public.review_reward_reactions(user_id,review_id);
create index if not exists user_reward_dispute_advisories_user_idx
  on public.user_reward_dispute_advisories(user_id,dispute_id);
create index if not exists user_reward_objective_pins_objective_idx
  on public.user_reward_objective_pins(objective_id,user_id);
create index if not exists user_reward_objective_rerolls_objective_idx
  on public.user_reward_objective_rerolls(objective_id,user_id);
create index if not exists user_saved_collection_items_location_idx
  on public.user_saved_collection_items(location_id,collection_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_progression_reward_equipment',
    'user_reward_objective_rerolls',
    'user_reward_objective_pins',
    'user_reward_streak_shield_usage',
    'user_saved_collections',
    'user_saved_collection_items',
    'community_reward_challenges',
    'community_reward_challenge_participants',
    'community_reward_proposals',
    'community_reward_votes',
    'user_beta_feature_preferences',
    'user_reward_dispute_advisories',
    'review_reward_reactions'
  ]
  loop
    execute format('drop policy if exists deny_direct_reward_runtime_access on public.%I',t);
    execute format('create policy deny_direct_reward_runtime_access on public.%I for all to public using (false) with check (false)',t);
  end loop;
end
$$;
