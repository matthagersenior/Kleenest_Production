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

export function bestEvidencedStop<T extends {trust?:LocationTrustSummary|null}>(rows:T[]){
  return rows.reduce<T|null>((best,row)=>!best||routeTrustScore(row.trust)>routeTrustScore(best.trust)?row:best,null);
}
