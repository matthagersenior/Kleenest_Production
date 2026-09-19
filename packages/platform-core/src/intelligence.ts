export const PUBLIC_INTELLIGENCE_CONTRACT_VERSION=1 as const;

export type PublicFreshnessLabel='very_fresh'|'fresh'|'aging'|'stale'|string;
export type PublicConfidenceLevel='high'|'medium'|'low'|'unknown'|string;

export interface PublicKleenestNow {
  location_id:string;
  name?:string|null;
  freshness_score:number;
  freshness_label:PublicFreshnessLabel;
  freshness_provenance:string;
  freshness_at?:string|null;
  confidence_score:number;
  confidence_level:PublicConfidenceLevel;
  independent_confirmations:number;
  recent_conflicts:number;
  bathroom_status:string;
  availability:string;
  latest_service?:{
    event_kind:string;
    reported_at:string;
    provenance:string;
    freshness_score:number;
  }|null;
  explanation?:{freshness?:string;confidence?:string};
  generated_at:string;
}

export interface PublicLocationExplanation {
  location:{id:string;name?:string|null;address?:string|null;city?:string|null;state?:string|null};
  now:PublicKleenestNow;
  rationale:string[];
  source_counts:Record<string,number>;
  recent_evidence:Array<{
    kind:string;
    provenance:string;
    observed_at:string;
    confidence:number;
    source_type:string;
  }>;
  generated_at:string;
}

export interface PublicProofCard {
  version:number;
  location_id:string;
  name?:string|null;
  address?:string|null;
  city?:string|null;
  state?:string|null;
  freshness_score:number;
  freshness_label:string;
  confidence_score:number;
  confidence_level:string;
  freshness_provenance:string;
  independent_confirmations:number;
  recent_conflicts:number;
  evidence_age_days:number|null;
  bathroom_status:string;
  availability:string;
  amenities:string[];
  deep_link:string;
  share_text:string;
  generated_at:string;
}

export interface PublicAccessProjection {
  allowed:boolean;
  source:string;
  reason:string;
  partner_program_id?:string|null;
  expires_at?:string|null;
  checked_at?:string|null;
}

export interface PublicPlaceIntelligence {
  contractVersion:typeof PUBLIC_INTELLIGENCE_CONTRACT_VERSION;
  locationId:string;
  revision:number;
  now:PublicKleenestNow;
  explanation:PublicLocationExplanation;
  generatedAt:string;
}

export interface PublicPlaceProof {
  contractVersion:typeof PUBLIC_INTELLIGENCE_CONTRACT_VERSION;
  locationId:string;
  revision:number;
  proof:PublicProofCard;
  generatedAt:string;
}

export interface PublicVerifiedAccess {
  contractVersion:typeof PUBLIC_INTELLIGENCE_CONTRACT_VERSION;
  locationId:string;
  revision:number;
  access:PublicAccessProjection;
  generatedAt:string;
}

export interface PublicRouteIntelligence {
  contractVersion:typeof PUBLIC_INTELLIGENCE_CONTRACT_VERSION;
  route:{
    type:'LineString';
    coordinates:Array<[number,number]>;
  };
  coverage:{
    recommendationCount:number;
    trustedCount:number;
    coveragePct:number;
    longestGapMeters:number|null;
  };
  recommendations:import('./types').RecommendationCandidate[];
  explanation:string;
  generatedAt:string;
}

export interface IntelligenceChangedWebhookData {
  contractVersion:typeof PUBLIC_INTELLIGENCE_CONTRACT_VERSION;
  locationId:string;
  revision:number;
  changedDimensions:string[];
  sourceType:string;
  sourceId:string|null;
  snapshot:Record<string,unknown>;
  changedAt:string;
}
