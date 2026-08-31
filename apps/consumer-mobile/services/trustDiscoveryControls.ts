import { routeTrustScore } from './routeTrust';

export type TrustEvidenceFilter='any'|'verified'|'fresh';
export type TrustSortMode='default'|'evidence';

export function hasVerifiedTrustEvidence(item:any){return Number(item?.trust?.verified_visit_count||0)>0}

export function hasFreshTrustEvidence(item:any,days=30){
  const raw=item?.trust?.latest_verified_at;
  if(!raw)return false;
  const timestamp=new Date(raw).getTime();
  if(!Number.isFinite(timestamp))return false;
  return Date.now()-timestamp<=Math.max(1,days)*86400000;
}

export function applyTrustDiscoveryControls<T extends {trust?:any}>(rows:T[],filter:TrustEvidenceFilter='any',sort:TrustSortMode='default'){
  let next=filter==='verified'?rows.filter(hasVerifiedTrustEvidence):filter==='fresh'?rows.filter(item=>hasFreshTrustEvidence(item)):rows.slice();
  if(sort==='evidence')next=next.slice().sort((a,b)=>routeTrustScore(b.trust)-routeTrustScore(a.trust));
  return next;
}
