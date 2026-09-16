import fs from 'node:fs';

const files={
 migration:fs.readFileSync('supabase/migrations/20260916024500_progression_reward_capability_runtime.sql','utf8'),
 service:fs.readFileSync('apps/consumer-mobile/services/rewardRuntime.ts','utf8'),
 tools:fs.readFileSync('apps/consumer-mobile/app/reward-tools.tsx','utf8'),
 explore:fs.readFileSync('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','utf8'),
 location:fs.readFileSync('apps/consumer-mobile/app/location/[id].tsx','utf8'),
 social:fs.readFileSync('apps/consumer-mobile/app/social.tsx','utf8'),
 layout:fs.readFileSync('apps/consumer-mobile/app/_layout.tsx','utf8'),
 progress:fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8'),
};
const need=(file,token,label)=>{if(!files[file].includes(token))throw new Error(label+' missing '+token)};

for(const token of [
 'consumer_reroll_progression_objective','consumer_pin_progression_objective','user_reward_streak_shield_usage',
 'consumer_reward_collections','consumer_create_reward_community_challenge','consumer_vote_reward_proposal',
 'consumer_set_beta_feature','consumer_reward_impact_stats','consumer_reward_verification_queue',
 'consumer_submit_dispute_advisory','consumer_toggle_reward_reaction'
])need('migration',token,'runtime migration');
for(const token of ['rerollProgressionObjective','createRewardCollection','createRewardCommunityChallenge','voteRewardProposal','setRewardBetaFeature','getRewardImpactStats','listRewardVerificationQueue','toggleRewardReaction'])need('service',token,'reward service');
for(const token of ['FOCUS BOARD','STREAK SHIELD','SAVED COLLECTIONS','COMMUNITY CHALLENGES','NETWORK VOTE','KLEENEST LABS','IMPACT ANALYTICS','DISPUTED DATA'])need('tools',token,'Reward Toolkit');
for(const token of ['getRewardCapabilities','verifiedEvidenceOnly','evidenceGapOnly','progressionPriority','equippedMapFlair'])need('explore',token,'Explore reward runtime');
for(const token of ['getRewardCapabilities','checkInAnimation','Signal Ripple','Guardian Lock'])need('location',token,'check-in reward runtime');
for(const token of ['listRewardReactions','toggleRewardReaction','reactionOptions','reactionChip'])need('social',token,'Community reward reactions');
need('layout','name="reward-tools"','reward toolkit route');
need('progress',"router.push('/reward-tools')",'progress reward toolkit entry');

console.log('progression reward runtime audit passed');
