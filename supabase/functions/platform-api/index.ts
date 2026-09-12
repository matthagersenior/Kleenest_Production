import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const secretKeys = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); }
  catch { return {}; }
})();
const SUPABASE_SECRET_KEY = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Authorization = {
  authorized: boolean;
  reason?: string;
  request_id?: string;
  partner_id?: string;
  partner_slug?: string;
  plan?: string;
  api_key_id?: string;
  credential_type?: string;
  credential_minute_limit?: number;
  credential_minute_remaining?: number;
  minute_limit?: number;
  minute_remaining?: number;
  month_limit?: number;
  month_remaining?: number;
  retry_after_seconds?: number;
};

function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-kleenest-api-key,x-kleenest-client-token',
    'access-control-expose-headers': 'x-kleenest-request-id,x-kleenest-partner-id,x-kleenest-plan,x-kleenest-credential-type,x-ratelimit-limit-minute,x-ratelimit-remaining-minute,x-ratelimit-limit-month,x-ratelimit-remaining-month,x-ratelimit-limit-client-minute,x-ratelimit-remaining-client-minute',
    'access-control-max-age': '600',
  };
  if (origin) headers['vary'] = 'Origin';
  return headers;
}

class ApiInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiInputError';
  }
}

function boundedNumber(value: unknown, min: number, max: number, fallback?: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ApiInputError(`Value must be between ${min} and ${max}`);
  }
  return parsed;
}

function coordinate(value: unknown, min: number, max: number, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new ApiInputError(`${name} is invalid`);
  return parsed;
}

function normalizedAmenities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item).trim()).filter(Boolean))].slice(0, 24);
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeConfidence(value: unknown): number | null {
  const parsed = finite(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no') return false;
  return null;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function publicVerificationStatus(value: unknown): 'verified' | 'needs_verification' | 'unverified' | 'conflicted' | 'unknown' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'verified') return 'verified';
  if (normalized === 'needs_verification' || normalized === 'needs verification') return 'needs_verification';
  if (normalized === 'unverified') return 'unverified';
  if (normalized === 'conflicted' || normalized === 'conflict') return 'conflicted';
  return 'unknown';
}

function optionalText(value: unknown, name: string, max = 320): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new ApiInputError(`${name} is too long`);
  return normalized;
}

function scoredMatchCandidate(row: Record<string, unknown>) {
  const exactExternal = boolOrNull(row.exact_external) === true;
  const exactAddress = boolOrNull(row.exact_address) === true;
  const exactName = boolOrNull(row.exact_name) === true;
  const cityMatch = boolOrNull(row.city_match) === true;
  const stateMatch = boolOrNull(row.state_match) === true;
  const postalMatch = boolOrNull(row.postal_match) === true;
  const distanceMeters = finite(row.distance_meters);
  const matchedSignals: string[] = [];
  let matchScore = 0;

  if (exactExternal) {
    matchedSignals.push('EXTERNAL_ID');
    matchScore = 100;
  }
  if (exactAddress) {
    matchedSignals.push('ADDRESS');
    if (!exactExternal) matchScore += 75;
  }
  if (exactName) {
    matchedSignals.push('NAME');
    if (!exactExternal) matchScore += 25;
  }
  if (cityMatch) {
    matchedSignals.push('CITY');
    if (!exactExternal) matchScore += 4;
  }
  if (stateMatch) {
    matchedSignals.push('STATE');
    if (!exactExternal) matchScore += 3;
  }
  if (postalMatch) {
    matchedSignals.push('POSTAL_CODE');
    if (!exactExternal) matchScore += 8;
  }

  if (distanceMeters !== null) {
    let proximityScore = 0;
    let proximitySignal = 'PROXIMITY';
    if (distanceMeters <= 25) { proximityScore = 50; proximitySignal = 'PROXIMITY_25M'; }
    else if (distanceMeters <= 75) { proximityScore = 40; proximitySignal = 'PROXIMITY_75M'; }
    else if (distanceMeters <= 150) { proximityScore = 30; proximitySignal = 'PROXIMITY_150M'; }
    else if (distanceMeters <= 250) { proximityScore = 20; proximitySignal = 'PROXIMITY_250M'; }
    else if (distanceMeters <= 500) { proximityScore = 10; proximitySignal = 'PROXIMITY_500M'; }
    else if (distanceMeters <= 1000) { proximityScore = 5; proximitySignal = 'PROXIMITY_1000M'; }
    matchedSignals.push(proximitySignal);
    if (!exactExternal) matchScore += proximityScore;
  }

  return {
    place: {
      kleenestPlaceId: String(row.location_id ?? ''),
      name: String(row.name ?? 'Kleenest place'),
      latitude: finite(row.latitude),
      longitude: finite(row.longitude),
      address: stringOrNull(row.address),
      city: stringOrNull(row.city),
      state: stringOrNull(row.state),
      postalCode: stringOrNull(row.postal_code),
    },
    matchScore: Math.max(0, Math.min(100, Math.round(matchScore))),
    matchedSignals,
    distanceMeters,
    verificationStatus: publicVerificationStatus(row.verification_status),
    confidence: normalizeConfidence(row.verification_confidence),
  };
}

function publicPlaceDetails(row: Record<string, unknown>) {
  const id = String(row.id ?? row.location_id ?? '').trim();
  if (!id) return null;

  const business = recordOrNull(row.business);
  const intelligence = recordOrNull(row.intelligence);
  const featureSummary = recordOrNull(row.feature_summary);
  const hours = Array.isArray(row.hours) ? row.hours : [];
  const promotions = Array.isArray(row.promotions) ? row.promotions : [];
  const photos = Array.isArray(row.photos) ? row.photos : [];

  const amenityNames = (() => {
    const raw = featureSummary?.amenity_names ?? featureSummary?.amenities ?? row.amenity_names;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map(item => {
      if (typeof item === 'string') return item.trim();
      const object = recordOrNull(item);
      return String(object?.name ?? object?.amenity_name ?? '').trim();
    }).filter(Boolean))].slice(0, 64);
  })();

  const publicHours = hours
    .map(item => recordOrNull(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(item => ({
      dayOfWeek: finite(item.day_of_week),
      opensAt: stringOrNull(item.opens_at),
      closesAt: stringOrNull(item.closes_at),
      is24Hours: boolOrNull(item.is_24_hours) === true,
      notes: stringOrNull(item.notes),
    }));

  const publicPromotions = promotions
    .map(item => recordOrNull(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(item => ({
      id: stringOrNull(item.id),
      title: String(item.title ?? 'Kleenest offer').trim() || 'Kleenest offer',
      description: stringOrNull(item.description),
      discount: stringOrNull(item.discount),
      startsAt: stringOrNull(item.starts_at),
      endsAt: stringOrNull(item.ends_at),
    }))
    .slice(0, 25);

  const publicPhotos = photos
    .map(item => recordOrNull(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(item => ({
      id: stringOrNull(item.id),
      url: stringOrNull(item.url ?? item.photo_url ?? item.public_url),
      caption: stringOrNull(item.caption),
      isFeatured: boolOrNull(item.is_featured) === true,
    }))
    .filter(item => item.url && /^https?:\/\//i.test(item.url))
    .map(item => ({ ...item, url: item.url as string }))
    .slice(0, 30);

  const confidence = normalizeConfidence(
    row.verification_confidence ?? intelligence?.confidence ?? intelligence?.confidence_score
  );
  const verificationStatus = publicVerificationStatus(
    row.verification_status ?? row.bathroom_verification_status ?? intelligence?.status
  );
  const publicAccess = boolOrNull(
    row.public_access ?? row.restroom_public_access ?? featureSummary?.public_access ?? intelligence?.public_access
  );
  const open24Hours = boolOrNull(
    row.open_24_hours ?? featureSummary?.open_24_hours ?? intelligence?.open_24_hours
  );

  return {
    place: {
      kleenestPlaceId: id,
      name: String(row.name ?? 'Kleenest place'),
      latitude: finite(row.latitude),
      longitude: finite(row.longitude),
      address: stringOrNull(row.address),
      city: stringOrNull(row.city),
      state: stringOrNull(row.state),
      postalCode: stringOrNull(row.postal_code),
      country: stringOrNull(row.country),
      placeType: stringOrNull(row.place_type),
      description: stringOrNull(row.description),
      phone: stringOrNull(row.phone),
      website: stringOrNull(row.website),
    },
    business: business && business.id ? {
      id: String(business.id),
      name: String(business.name ?? row.business_name ?? 'Business'),
      description: stringOrNull(business.description),
      website: stringOrNull(business.website),
      phone: stringOrNull(business.phone),
      logoUrl: stringOrNull(business.logo_url),
      verificationStatus: stringOrNull(business.verification_status),
    } : null,
    restroom: {
      publicAccess,
      wheelchairAccessible: boolOrNull(row.accessible ?? featureSummary?.accessible),
      changingTable: boolOrNull(row.changing_table ?? featureSummary?.changing_table),
      familyRestroom: boolOrNull(row.family_restroom ?? featureSummary?.family_restroom),
      open24Hours,
      amenityNames,
      smartBathroom: boolOrNull(row.smart_bathroom),
      cleanlinessPct: finite(row.cleanliness_pct ?? row.cleanliness),
      rating: finite(row.rating),
      reviewCount: finite(row.review_count),
      cleaningSchedule: stringOrNull(row.cleaning_schedule),
    },
    trust: {
      confidence,
      verificationStatus,
      lastVerifiedAt: stringOrNull(row.bathroom_verified_at ?? intelligence?.last_verified_at),
      observationCount: finite(row.verification_observation_count ?? intelligence?.evidence_count),
      freshnessAt: stringOrNull(row.updated_at ?? intelligence?.updated_at),
      positiveCount: finite(row.verification_positive_count ?? row.bathroom_positive_count),
      negativeCount: finite(row.verification_negative_count ?? row.bathroom_negative_count),
    },
    hours: publicHours,
    promotions: publicPromotions,
    photos: publicPhotos,
    deepLink: `https://kleenest.app/place/${encodeURIComponent(id)}`,
    source: 'kleenest' as const,
  };
}

function normalizeRow(row: Record<string, unknown>) {
  const id = String(row.location_id ?? row.place_id ?? row.id ?? '').trim();
  const confidence = normalizeConfidence(row.confidence ?? row.confidence_score ?? row.trust_score);
  const verified = row.needs_restroom_verification !== true;
  const distanceMeters = finite(row.distance_meters);
  const detourMinutes = finite(row.detour_minutes);
  const publicAccess = boolOrNull(row.public_access ?? row.restroom_public_access);
  const wheelchairAccessible = boolOrNull(row.wheelchair_accessible ?? row.accessible);
  const reasonCodes: string[] = [];
  if (verified) reasonCodes.push('VERIFIED');
  if ((confidence ?? 0) >= 0.8) reasonCodes.push('HIGH_CONFIDENCE');
  if (distanceMeters !== null && distanceMeters <= 8047) reasonCodes.push('LOW_DISTANCE');
  if (detourMinutes !== null && detourMinutes <= 5) reasonCodes.push('LOW_DETOUR');
  if (publicAccess === true) reasonCodes.push('PUBLIC_ACCESS');
  if (wheelchairAccessible === true) reasonCodes.push('ACCESSIBILITY_MATCH');

  let score = 35;
  if (verified) score += 25;
  if (confidence !== null) score += Math.round(confidence * 20);
  if (publicAccess === true) score += 8;
  if (wheelchairAccessible === true) score += 4;
  if (distanceMeters !== null) score += Math.max(0, 8 - Math.round(distanceMeters / 3218));
  if (detourMinutes !== null) score += Math.max(0, 10 - Math.round(detourMinutes));

  const explanation = [
    verified ? 'verified restroom evidence' : null,
    (confidence ?? 0) >= 0.8 ? 'high-confidence Kleenest data' : null,
    publicAccess === true ? 'public access' : null,
    wheelchairAccessible === true ? 'accessibility information' : null,
    detourMinutes !== null && detourMinutes <= 5 ? 'low route detour' : null,
    distanceMeters !== null && distanceMeters <= 8047 ? 'close to the requested location' : null,
  ].filter(Boolean).join(', ') || 'Kleenest restroom candidate';

  return {
    place: {
      kleenestPlaceId: id,
      name: String(row.name ?? row.place_name ?? row.location_name ?? 'Kleenest place'),
      latitude: finite(row.latitude ?? row.lat),
      longitude: finite(row.longitude ?? row.lng ?? row.lon),
    },
    score: Math.max(0, Math.min(100, score)),
    trust: {
      confidence,
      verificationStatus: verified ? 'verified' : 'needs_verification',
      lastVerifiedAt: row.last_verified_at ?? row.verified_at ?? null,
      observationCount: finite(row.observation_count ?? row.observations),
      freshnessAt: row.freshness_at ?? row.updated_at ?? null,
    },
    restroom: {
      publicAccess,
      wheelchairAccessible,
      changingTable: boolOrNull(row.changing_table),
      familyRestroom: boolOrNull(row.family_restroom),
      open24Hours: boolOrNull(row.open_24_hours ?? row.open24_hours),
      amenityNames: Array.isArray(row.amenity_names) ? row.amenity_names.map(String) : [],
    },
    distanceMeters,
    distanceAheadMeters: finite(row.distance_ahead_meters),
    detourMinutes,
    reasonCodes,
    explanation,
    deepLink: `https://kleenest.app/place/${encodeURIComponent(id)}`,
    source: 'kleenest',
  };
}

function ranked(rows: unknown[], limit: number) {
  return rows
    .filter(row => row && typeof row === 'object')
    .map(row => normalizeRow(row as Record<string, unknown>))
    .filter(item => item.place.kleenestPlaceId)
    .sort((a, b) =>
      b.score - a.score ||
      (a.detourMinutes ?? Number.POSITIVE_INFINITY) - (b.detourMinutes ?? Number.POSITIVE_INFINITY) ||
      (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY)
    )
    .slice(0, limit);
}

function canonicalPlatformRoute(pathname: string): string {
  const marker = '/v1/';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index) : pathname;
}

function suppliedApiKey(req: Request): string {
  return req.headers.get('x-kleenest-client-token')
    ?? req.headers.get('x-kleenest-api-key')
    ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? '';
}

async function authorize(req: Request, route: string): Promise<Authorization> {
  const rawKey = suppliedApiKey(req);
  const requestId = crypto.randomUUID();
  const { data, error } = await db.rpc('authorize_platform_request', {
    p_raw_key: rawKey,
    p_route: route,
    p_request_id: requestId,
    p_origin: req.headers.get('origin'),
  });
  if (error) throw error;
  return (data ?? { authorized: false, reason: 'authorization_failed', request_id: requestId }) as Authorization;
}

function authFailure(req: Request, auth: Authorization) {
  const quota = auth.reason === 'minute_quota_exceeded'
    || auth.reason === 'monthly_quota_exceeded'
    || auth.reason === 'credential_minute_quota_exceeded';
  const forbidden = auth.reason === 'insufficient_scope'
    || auth.reason === 'partner_inactive'
    || auth.reason === 'origin_required'
    || auth.reason === 'origin_not_allowed'\n    || auth.reason === 'product_not_enabled';
  const headers: Record<string, string> = { ...corsHeaders(req) };
  if (auth.retry_after_seconds) headers['retry-after'] = String(auth.retry_after_seconds);
  return json({
    error: quota ? 'Rate limit exceeded' : forbidden ? 'Forbidden' : 'Unauthorized',
    code: auth.reason ?? 'unauthorized',
    requestId: auth.request_id,
  }, quota ? 429 : forbidden ? 403 : 401, headers);
}

function rateHeaders(auth: Authorization): Record<string, string> {
  const headers: Record<string, string> = {
    'x-kleenest-request-id': String(auth.request_id ?? ''),
    'x-kleenest-partner-id': String(auth.partner_id ?? ''),
    'x-kleenest-plan': String(auth.plan ?? ''),
  };
  if (auth.minute_limit !== undefined) headers['x-ratelimit-limit-minute'] = String(auth.minute_limit);
  if (auth.minute_remaining !== undefined) headers['x-ratelimit-remaining-minute'] = String(auth.minute_remaining);
  if (auth.month_limit !== undefined) headers['x-ratelimit-limit-month'] = String(auth.month_limit);
  if (auth.month_remaining !== undefined) headers['x-ratelimit-remaining-month'] = String(auth.month_remaining);
  if (auth.credential_type) headers['x-kleenest-credential-type'] = String(auth.credential_type);
  if (auth.credential_minute_limit !== undefined && auth.credential_minute_limit !== null) {
    headers['x-ratelimit-limit-client-minute'] = String(auth.credential_minute_limit);
  }
  if (auth.credential_minute_remaining !== undefined && auth.credential_minute_remaining !== null) {
    headers['x-ratelimit-remaining-client-minute'] = String(auth.credential_minute_remaining);
  }
  return headers;
}

async function recordOutcome(auth: Authorization, route: string, status: number) {
  if (!auth.partner_id || !auth.api_key_id) return;
  const { error } = await db.rpc('record_platform_request_outcome', {
    p_partner_id: auth.partner_id,
    p_api_key_id: auth.api_key_id,
    p_route: route,
    p_status_code: status,
    p_units: 1,
  });
  if (error) console.error('Kleenest Platform usage outcome record failed', error.code ?? 'rpc_error');
}

function placeIdFromRoute(routePath: string): string {
  const match = routePath.match(/^\/v1\/places\/([^/]+)$/);
  if (!match) throw new ApiInputError('Place id is required');
  const decoded = decodeURIComponent(match[1]).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded)) {
    throw new ApiInputError('Place id is invalid');
  }
  return decoded;
}

async function placeDetails(routePath: string) {
  const placeId = placeIdFromRoute(routePath);
  const { data, error } = await db.rpc('mobile_location_detail_v1', {
    p_location_id: placeId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return publicPlaceDetails(data as Record<string, unknown>);
}

async function matchPlaces(body: any) {
  const external = recordOrNull(body?.external);
  const externalSource = optionalText(external?.source, 'external.source', 160);
  const externalId = optionalText(external?.id, 'external.id', 320);
  if (Boolean(externalSource) !== Boolean(externalId)) {
    throw new ApiInputError('external.source and external.id must be supplied together');
  }

  const name = optionalText(body?.name, 'name');
  const address = optionalText(body?.address, 'address');
  const city = optionalText(body?.city, 'city', 160);
  const state = optionalText(body?.state, 'state', 80);
  const postalCode = optionalText(body?.postalCode, 'postalCode', 40);
  const location = recordOrNull(body?.location);
  const hasLatitude = location?.latitude !== undefined && location?.latitude !== null;
  const hasLongitude = location?.longitude !== undefined && location?.longitude !== null;
  if (hasLatitude !== hasLongitude) {
    throw new ApiInputError('location.latitude and location.longitude must be supplied together');
  }
  const latitude = hasLatitude ? coordinate(location?.latitude, -90, 90, 'latitude') : null;
  const longitude = hasLongitude ? coordinate(location?.longitude, -180, 180, 'longitude') : null;

  if (!externalId && !address && latitude === null) {
    throw new ApiInputError('external id, address, or coordinates are required');
  }

  const maxDistanceMeters = Math.round(boundedNumber(body?.maxDistanceMeters, 10, 5000, 250));
  const limit = Math.round(boundedNumber(body?.limit, 1, 10, 5));

  const { data, error } = await db.rpc('platform_match_places', {
    p_name: name,
    p_address: address,
    p_city: city,
    p_state: state,
    p_postal_code: postalCode,
    p_lat: latitude,
    p_lng: longitude,
    p_max_distance_m: maxDistanceMeters,
    p_external_source: externalSource,
    p_external_id: externalId,
    p_limit: limit,
  });
  if (error) throw error;

  const candidates = (Array.isArray(data) ? data : [])
    .filter(row => row && typeof row === 'object')
    .map(row => scoredMatchCandidate(row as Record<string, unknown>))
    .filter(candidate => candidate.place.kleenestPlaceId)
    .sort((a, b) =>
      b.matchScore - a.matchScore ||
      (a.distanceMeters ?? Number.POSITIVE_INFINITY) - (b.distanceMeters ?? Number.POSITIVE_INFINITY) ||
      (b.confidence ?? -1) - (a.confidence ?? -1) ||
      a.place.kleenestPlaceId.localeCompare(b.place.kleenestPlaceId)
    )
    .slice(0, limit);

  const top = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  const margin = top && second ? top.matchScore - second.matchScore : Number.POSITIVE_INFINITY;
  const exactExternalMatch = Boolean(top?.matchedSignals.includes('EXTERNAL_ID'));
  const matched = Boolean(top && top.matchScore >= 75 && (exactExternalMatch || !second || margin >= 10));
  const ambiguous = Boolean(top && top.matchScore >= 75 && !matched);

  return {
    match: matched ? top : null,
    candidates,
    metadata: {
      requestedAt: new Date().toISOString(),
      candidateCount: candidates.length,
      matched,
      ambiguous,
    },
  };
}

async function nearby(body: any) {
  const latitude = coordinate(body?.location?.latitude, -90, 90, 'latitude');
  const longitude = coordinate(body?.location?.longitude, -180, 180, 'longitude');
  const radiusMeters = Math.round(boundedNumber(body?.radiusMeters, 100, 402336));
  const limit = Math.round(boundedNumber(body?.limit, 1, 100, 10));
  const requirements = body?.requirements ?? {};
  const amenityNames = normalizedAmenities(requirements.amenityNames);
  const amenityMatch = requirements.amenityMatch === 'all' ? 'all' : 'any';

  const { data, error } = await db.rpc('map_network_nearby_v3', {
    p_lat: latitude,
    p_lng: longitude,
    p_radius_m: radiusMeters,
    p_limit: limit,
    p_category: 'restroom',
    p_search: String(body?.search ?? '').trim() || null,
    p_amenity_names: amenityNames,
    p_amenity_match: amenityMatch,
  });
  if (error) throw error;
  const recommendations = ranked(Array.isArray(data) ? data : [], limit);
  return {
    recommendations,
    metadata: {
      requestedAt: new Date().toISOString(),
      resultCount: recommendations.length,
      expanded: false,
      effectiveRadiusMeters: radiusMeters,
      attemptedRadiiMeters: [radiusMeters],
    },
  };
}

async function route(body: any) {
  const geometry = body?.route;
  if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 5000) {
    throw new ApiInputError('route must be a LineString with 2 to 5000 coordinates');
  }
  const corridorMeters = Math.round(boundedNumber(body?.corridorMeters, 100, 40234, 8047));
  const limit = Math.round(boundedNumber(body?.limit, 1, 50, 10));
  const requirements = body?.requirements ?? {};
  const amenityNames = normalizedAmenities(requirements.amenityNames);
  const amenityMatch = requirements.amenityMatch === 'all' ? 'all' : 'any';

  const { data, error } = await db.rpc('map_network_along_route_v1', {
    p_route_geojson: geometry,
    p_corridor_m: corridorMeters,
    p_limit: limit,
    p_category: 'restroom',
    p_search: String(body?.search ?? '').trim() || null,
    p_amenity_names: amenityNames,
    p_amenity_match: amenityMatch,
  });
  if (error) throw error;
  const recommendations = ranked(Array.isArray(data) ? data : [], limit);
  return {
    recommendations,
    metadata: {
      requestedAt: new Date().toISOString(),
      resultCount: recommendations.length,
    },
  };
}

Deno.serve(async req => {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method === 'GET' && url.pathname.endsWith('/health')) {
    return json({ ok: true, service: 'kleenest-platform-api', version: 'v1' }, 200, corsHeaders(req));
  }
  if (!SUPABASE_SECRET_KEY) return json({ error: 'Service unavailable' }, 503, corsHeaders(req));

  const routePath = canonicalPlatformRoute(url.pathname);
  const isNearby = routePath === '/v1/recommendations/nearby';
  const isRoute = routePath === '/v1/recommendations/route';
  const isPlaceMatch = routePath === '/v1/places/match';
  const isPlaceDetails = /^\/v1\/places\/[^/]+$/.test(routePath) && !isPlaceMatch;

  if (!isNearby && !isRoute && !isPlaceMatch && !isPlaceDetails) {
    return json({ error: 'Not found' }, 404, corsHeaders(req));
  }
  if ((isNearby || isRoute || isPlaceMatch) && req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders(req));
  }
  if (isPlaceDetails && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders(req));
  }

  let auth: Authorization;
  try {
    auth = await authorize(req, routePath);
  } catch (error) {
    console.error('Kleenest Platform authorization failed', error instanceof Error ? error.name : 'unknown_error');
    return json({ error: 'Service unavailable' }, 503, corsHeaders(req));
  }
  if (!auth.authorized) return authFailure(req, auth);

  let status = 200;
  let payload: unknown;
  try {
    if (isPlaceDetails) {
      payload = await placeDetails(routePath);
      if (!payload) {
        status = 404;
        payload = { error: 'Place not found' };
      }
    } else {
      const body = await req.json().catch(() => ({}));
      if (isPlaceMatch) {
        payload = await matchPlaces(body);
      } else if (isNearby) {
        payload = await nearby(body);
      } else {
        payload = await route(body);
      }
    }
  } catch (error) {
    if (error instanceof ApiInputError) {
      status = 400;
      payload = { error: error.message };
    } else {
      status = 500;
      payload = { error: 'Internal server error' };
      console.error('Kleenest Platform API request failed', error instanceof Error ? error.name : 'unknown_error');
    }
  }

  await recordOutcome(auth, routePath, status);
  return json(payload, status, { ...corsHeaders(req), ...rateHeaders(auth) });
});
