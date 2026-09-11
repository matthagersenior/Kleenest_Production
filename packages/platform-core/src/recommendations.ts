import type {
  RecommendationCandidate,
  RecommendationReasonCode,
  RestroomAttributes,
  TrustSummary,
} from './types';

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no') return false;
  return null;
}

function stringOrNull(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
}

function clamp01(value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function placeId(row: Record<string, unknown>): string {
  return String(row.location_id ?? row.place_id ?? row.id ?? '').trim();
}

function verification(row: Record<string, unknown>): TrustSummary['verificationStatus'] {
  if (row.needs_restroom_verification === true) return 'needs_verification';
  const raw = String(row.verification_status ?? row.restroom_verification_status ?? '').toLowerCase();
  if (raw.includes('conflict')) return 'conflicted';
  if (raw.includes('verified')) return 'verified';
  if (raw.includes('unverified')) return 'unverified';
  if (row.restroom_candidate_status === 'restroom_evidence') return 'verified';
  return 'unknown';
}

function amenityNames(row: Record<string, unknown>): string[] {
  const direct = row.amenity_names;
  if (Array.isArray(direct)) return [...new Set(direct.map(String).map(v => v.trim()).filter(Boolean))];
  const source = row.amenities;
  if (Array.isArray(source)) return [...new Set(source.map(String).map(v => v.trim()).filter(Boolean))];
  if (source && typeof source === 'object') {
    return Object.entries(source as Record<string, unknown>)
      .filter(([, value]) => boolOrNull(value) === true)
      .map(([key]) => key);
  }
  return [];
}

function attributes(row: Record<string, unknown>): RestroomAttributes {
  return {
    publicAccess: boolOrNull(row.public_access ?? row.restroom_public_access),
    wheelchairAccessible: boolOrNull(row.wheelchair_accessible ?? row.accessible),
    changingTable: boolOrNull(row.changing_table),
    familyRestroom: boolOrNull(row.family_restroom),
    open24Hours: boolOrNull(row.open_24_hours ?? row.open24_hours),
    amenityNames: amenityNames(row),
  };
}

function reasonCodes(
  trust: TrustSummary,
  restroom: RestroomAttributes,
  distanceMeters: number | null,
  detourMinutes: number | null,
): RecommendationReasonCode[] {
  const reasons: RecommendationReasonCode[] = [];
  if (trust.verificationStatus === 'verified') reasons.push('VERIFIED');
  if (trust.verificationStatus === 'needs_verification') reasons.push('NEEDS_VERIFICATION');
  if ((trust.confidence ?? 0) >= 0.8) reasons.push('HIGH_CONFIDENCE');
  if (distanceMeters !== null && distanceMeters <= 8047) reasons.push('LOW_DISTANCE');
  if (detourMinutes !== null && detourMinutes <= 5) reasons.push('LOW_DETOUR');
  if (restroom.publicAccess === true) reasons.push('PUBLIC_ACCESS');
  if (restroom.wheelchairAccessible === true) reasons.push('ACCESSIBILITY_MATCH');
  return [...new Set(reasons)];
}

function score(
  trust: TrustSummary,
  restroom: RestroomAttributes,
  distanceMeters: number | null,
  detourMinutes: number | null,
): number {
  let value = 35;
  if (trust.verificationStatus === 'verified') value += 25;
  if (trust.verificationStatus === 'needs_verification') value -= 15;
  if (trust.verificationStatus === 'conflicted') value -= 20;
  if (trust.confidence !== null) value += Math.round(trust.confidence * 20);
  if (restroom.publicAccess === true) value += 8;
  if (restroom.wheelchairAccessible === true) value += 4;
  if (distanceMeters !== null) value += Math.max(0, 8 - Math.round(distanceMeters / 3218));
  if (detourMinutes !== null) value += Math.max(0, 10 - Math.round(detourMinutes));
  return Math.max(0, Math.min(100, value));
}

function explanation(reasons: RecommendationReasonCode[]): string {
  const phrases: string[] = [];
  if (reasons.includes('VERIFIED')) phrases.push('verified restroom evidence');
  if (reasons.includes('HIGH_CONFIDENCE')) phrases.push('high-confidence Kleenest data');
  if (reasons.includes('PUBLIC_ACCESS')) phrases.push('public access');
  if (reasons.includes('ACCESSIBILITY_MATCH')) phrases.push('accessibility information');
  if (reasons.includes('LOW_DETOUR')) phrases.push('low route detour');
  if (reasons.includes('LOW_DISTANCE')) phrases.push('close to the requested location');
  if (reasons.includes('NEEDS_VERIFICATION')) phrases.push('candidate awaiting consumer verification');
  return phrases.length ? phrases.join(', ') : 'Kleenest restroom candidate';
}

export function normalizeRecommendation(row: Record<string, unknown>): RecommendationCandidate | null {
  const id = placeId(row);
  if (!id) return null;
  const trust: TrustSummary = {
    confidence: clamp01(row.confidence ?? row.confidence_score ?? row.trust_score),
    verificationStatus: verification(row),
    lastVerifiedAt: stringOrNull(row.last_verified_at ?? row.verified_at),
    observationCount: finiteNumber(row.observation_count ?? row.observations),
    freshnessAt: stringOrNull(row.freshness_at ?? row.updated_at),
  };
  const restroom = attributes(row);
  const distanceMeters = finiteNumber(row.distance_meters);
  const detourMinutes = finiteNumber(row.detour_minutes);
  const reasons = reasonCodes(trust, restroom, distanceMeters, detourMinutes);
  return {
    place: {
      kleenestPlaceId: id,
      name: String(row.name ?? row.place_name ?? row.location_name ?? 'Kleenest place'),
      latitude: finiteNumber(row.latitude ?? row.lat),
      longitude: finiteNumber(row.longitude ?? row.lng ?? row.lon),
    },
    score: score(trust, restroom, distanceMeters, detourMinutes),
    trust,
    restroom,
    distanceMeters,
    distanceAheadMeters: finiteNumber(row.distance_ahead_meters),
    detourMinutes,
    reasonCodes: reasons,
    explanation: explanation(reasons),
    deepLink: `https://kleenest.app/place/${encodeURIComponent(id)}`,
    source: 'kleenest',
  };
}

export function rankRecommendations(rows: Record<string, unknown>[], limit = 10): RecommendationCandidate[] {
  const bounded = Math.max(1, Math.min(100, Math.round(limit || 10)));
  return rows
    .map(normalizeRecommendation)
    .filter((row): row is RecommendationCandidate => Boolean(row))
    .sort((a, b) =>
      b.score - a.score ||
      (a.detourMinutes ?? Number.POSITIVE_INFINITY) - (b.detourMinutes ?? Number.POSITIVE_INFINITY) ||
      (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, bounded);
}
