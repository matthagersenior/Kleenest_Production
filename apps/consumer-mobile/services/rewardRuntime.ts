import { getKleenestSupabaseClient, listMobileFavoriteLocations } from '@kleenest/mobile-core';

async function requireUser(){
 const client=getKleenestSupabaseClient();
 const{data,error}=await client.auth.getUser();
 if(error)throw error;
 if(!data.user)throw new Error('Sign in to use progression rewards.');
 return data.user;
}
async function rpc(name:string,args:Record<string,unknown>={}){
 await requireUser();
 const{data,error}=await getKleenestSupabaseClient().rpc(name,args);
 if(error)throw error;
 return data;
}

export async function getRewardCapabilities(){return (await rpc('consumer_reward_capabilities'))||{};}
export async function rerollProgressionObjective(objectiveId:string){return rpc('consumer_reroll_progression_objective',{p_objective_id:objectiveId});}
export async function pinProgressionObjective(objectiveId:string){return rpc('consumer_pin_progression_objective',{p_objective_id:objectiveId});}
export async function unpinProgressionObjective(objectiveId:string){return rpc('consumer_unpin_progression_objective',{p_objective_id:objectiveId});}

export async function listRewardCollections(){const data=await rpc('consumer_reward_collections');return Array.isArray(data)?data:[];}
export async function createRewardCollection(name:string){return rpc('consumer_create_reward_collection',{p_name:name});}
export async function addFavoriteToRewardCollection(collectionId:string,locationId:string){return rpc('consumer_add_favorite_to_collection',{p_collection_id:collectionId,p_location_id:locationId});}
export async function removeFavoriteFromRewardCollection(collectionId:string,locationId:string){return rpc('consumer_remove_favorite_from_collection',{p_collection_id:collectionId,p_location_id:locationId});}
export async function listRewardCollectionFavorites(){await requireUser();return listMobileFavoriteLocations();}

export async function listRewardCommunityChallenges(){const data=await rpc('consumer_reward_community_challenges');return Array.isArray(data)?data:[];}
export async function createRewardCommunityChallenge(title:string,description:string,days=7){return rpc('consumer_create_reward_community_challenge',{p_title:title,p_description:description,p_days:days});}
export async function joinRewardCommunityChallenge(challengeId:string){return rpc('consumer_join_reward_community_challenge',{p_challenge_id:challengeId});}

export async function listRewardProposals(){const data=await rpc('consumer_reward_proposals');return Array.isArray(data)?data:[];}
export async function voteRewardProposal(code:string,vote:'support'|'not_yet'|'abstain'){return rpc('consumer_vote_reward_proposal',{p_proposal_code:code,p_vote:vote});}
export async function setRewardBetaFeature(featureCode:'evidence_gap_radar',enabled:boolean){return rpc('consumer_set_beta_feature',{p_feature_code:featureCode,p_enabled:enabled});}
export async function getRewardImpactStats(){return (await rpc('consumer_reward_impact_stats'))||{};}
export async function listRewardVerificationQueue(){const data=await rpc('consumer_reward_verification_queue');return Array.isArray(data)?data:[];}
export async function submitRewardDisputeAdvisory(disputeId:string,signal:'supports_current_evidence'|'supports_business_dispute'|'needs_more_evidence',notes=''){return rpc('consumer_submit_dispute_advisory',{p_dispute_id:disputeId,p_signal:signal,p_notes:notes});}

export async function toggleRewardReaction(reviewId:string,reaction:string){return rpc('consumer_toggle_reward_reaction',{p_review_id:reviewId,p_reaction:reaction});}
export async function listRewardReactions(reviewIds:string[]){
 if(!reviewIds.length)return{};
 const data=await rpc('consumer_review_reward_reactions',{p_review_ids:reviewIds});
 return data&&typeof data==='object'?data:{};
}
