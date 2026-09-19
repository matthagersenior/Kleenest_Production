import type { RecommendationCandidate } from './types';
import { normalizeRecommendationAuthority,rankRecommendationAuthority } from './recommendationAuthority';

export function normalizeRecommendation(row:Record<string,unknown>):RecommendationCandidate|null{
  return normalizeRecommendationAuthority(row) as RecommendationCandidate|null;
}

export function rankRecommendations(rows:Record<string,unknown>[],limit=10):RecommendationCandidate[]{
  return rankRecommendationAuthority(rows,limit) as RecommendationCandidate[];
}
