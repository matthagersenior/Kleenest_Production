import type { RecommendationCandidate } from '@kleenest/platform-core';

export type KleenestMapFeature = {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    kleenestPlaceId: string;
    name: string;
    score: number;
    verificationStatus: string;
    confidence: number | null;
    explanation: string;
    deepLink: string;
  };
};

export type KleenestMapFeatureCollection = {
  type: 'FeatureCollection';
  features: KleenestMapFeature[];
};

export function recommendationsToGeoJSON(
  recommendations: RecommendationCandidate[],
): KleenestMapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: recommendations
      .filter(item => item.place.latitude !== null && item.place.longitude !== null)
      .map(item => ({
        type: 'Feature' as const,
        id: item.place.kleenestPlaceId,
        geometry: {
          type: 'Point' as const,
          coordinates: [item.place.longitude as number, item.place.latitude as number],
        },
        properties: {
          kleenestPlaceId: item.place.kleenestPlaceId,
          name: item.place.name,
          score: item.score,
          verificationStatus: item.trust.verificationStatus,
          confidence: item.trust.confidence,
          explanation: item.explanation,
          deepLink: item.deepLink,
        },
      })),
  };
}
