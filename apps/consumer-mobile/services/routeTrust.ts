import type { LocationTrustSummary } from './locationTrust';
import { visitFreshness } from './evidenceFormatting';

export function routeTrustScore(summary:LocationTrustSummary|null|undefined){
  if(!summary)return 0;
  const verified=Math.min(40,Number(summary.verified_visit_count||0)*10);
  const photos=Math.min(20,Number(summary.photo_evidence_count||0)*4);
  const amenities=Math.min(20,Number(summary.amenity_evidence_count||0)*4);
  let freshness=0;
  const time=summary.latest_verified_at?new Date(summary.latest_verified_at).getTime():NaN;
  if(Number.isFinite(time)){
    const days=Math.max(0,(Date.now()-time)/86400000);
    freshness=days<=1?20:days<=7?16:days<=30?10:days<=90?5:2;
  }
  return verified+photos+amenities+freshness;
}

export function routeTrustLabel(summary:LocationTrustSummary|null|undefined){
  if(!summary?.verified_visit_count)return'Needs verified evidence';
  const fresh=visitFreshness(summary.latest_verified_at);
  const count=Number(summary.verified_visit_count||0);
  return `${count} verified visit${count===1?'':'s'}${fresh?` · ${fresh}`:''}`;
}

export function trustConfidenceLabel(summary:LocationTrustSummary|null|undefined){
  const score=routeTrustScore(summary);
  if(score>=70)return'Strong evidence';
  if(score>=45)return'Recent evidence';
  if(score>0)return'Limited evidence';
  return'Needs verification';
}

export function trustEvidenceLine(summary:LocationTrustSummary|null|undefined){
  if(!summary)return'No published verified visit evidence yet';
  const visits=Number(summary.verified_visit_count||0),photos=Number(summary.photo_evidence_count||0),amenities=Number(summary.amenity_evidence_count||0),fresh=visitFreshness(summary.latest_verified_at);
  const parts=[visits?`${visits} verified visit${visits===1?'':'s'}`:'No verified visits',photos?`${photos} photo${photos===1?'':'s'}`:null,amenities?`${amenities} observed amenit${amenities===1?'y':'ies'}`:null,fresh?`updated ${fresh}`:null].filter(Boolean);
  return parts.join(' · ');
}

export function trustReason(summary:LocationTrustSummary|null|undefined){
  if(!summary?.verified_visit_count)return'No published verified visit currently supports this restroom. A verified check-in and review would strengthen the network.';
  const score=routeTrustScore(summary),photos=Number(summary.photo_evidence_count||0),amenities=Number(summary.amenity_evidence_count||0),fresh=visitFreshness(summary.latest_verified_at);
  if(score>=70)return`Multiple evidence signals agree${fresh?` and the newest verified visit is ${fresh}`:''}. This is one of the stronger current trust signals in Kleenest.`;
  if(score>=45)return`Verified visit evidence is available${fresh?` and was updated ${fresh}`:''}${photos||amenities?', with supporting photo or amenity observations':''}.`;
  const gaps=[!photos?'photo evidence':null,!amenities?'amenity observations':null].filter(Boolean).join(' and ');
  return `Verified evidence exists, but confidence is still limited${gaps?` because ${gaps} are sparse`:''}. More recent verified contributions would improve confidence.`;
}

export type TrustContributionPriority='high'|'medium'|'low'|'none';
export function trustContributionPriority(summary:LocationTrustSummary|null|undefined):TrustContributionPriority{
  const score=routeTrustScore(summary);
  if(!summary?.verified_visit_count)return'high';
  if(score<45)return'medium';
  if(score<70)return'low';
  return'none';
}

export function trustContributionMission(summary:LocationTrustSummary|null|undefined){
  const visits=Number(summary?.verified_visit_count||0),photos=Number(summary?.photo_evidence_count||0),amenities=Number(summary?.amenity_evidence_count||0);
  if(!visits)return'Be the first recent verified contributor: check in, leave a verified review, and add current photo or amenity evidence.';
  const needs:string[]=[];
  if(visits<2)needs.push('another verified visit');
  if(!photos)needs.push('current photos');
  if(!amenities)needs.push('amenity observations');
  if(!needs.length)return'Add a fresh verified visit to keep this restroom current for the next person.';
  return `This restroom would benefit most from ${needs.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
}

export function firstContributionOpportunity<T extends {trust?:LocationTrustSummary|null}>(rows:T[]){
  return rows.find(row=>trustContributionPriority(row.trust)==='high')||rows.find(row=>trustContributionPriority(row.trust)==='medium')||rows.find(row=>trustContributionPriority(row.trust)==='low')||null;
}

export function bestEvidencedStop<T extends {trust?:LocationTrustSummary|null}>(rows:T[]){
  return rows.reduce<T|null>((best,row)=>!best||routeTrustScore(row.trust)>routeTrustScore(best.trust)?row:best,null);
}
