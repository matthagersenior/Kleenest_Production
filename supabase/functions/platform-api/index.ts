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
  return req.headers.get('x-kleenest-api-key')
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
  });
  if (error) throw error;
  return (data ?? { authorized: false, reason: 'authorization_failed', request_id: requestId }) as Authorization;
}

function authFailure(auth: Authorization) {
  const quota = auth.reason === 'minute_quota_exceeded' || auth.reason === 'monthly_quota_exceeded';
  const scope = auth.reason === 'insufficient_scope' || auth.reason === 'partner_inactive';
  const headers: Record<string, string> = {};
  if (auth.retry_after_seconds) headers['retry-after'] = String(auth.retry_after_seconds);
  return json({
    error: quota ? 'Rate limit exceeded' : scope ? 'Forbidden' : 'Unauthorized',
    code: auth.reason ?? 'unauthorized',
    requestId: auth.request_id,
  }, quota ? 429 : scope ? 403 : 401, headers);
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
  if (req.method === 'GET' && url.pathname.endsWith('/health')) {
    return json({ ok: true, service: 'kleenest-platform-api', version: 'v1' });
  }
  if (!SUPABASE_SECRET_KEY) return json({ error: 'Service unavailable' }, 503);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const routePath = canonicalPlatformRoute(url.pathname);

  let auth: Authorization;
  try {
    auth = await authorize(req, routePath);
  } catch (error) {
    console.error('Kleenest Platform authorization failed', error instanceof Error ? error.name : 'unknown_error');
    return json({ error: 'Service unavailable' }, 503);
  }
  if (!auth.authorized) return authFailure(auth);

  let status = 200;
  let payload: unknown;
  try {
    const body = await req.json().catch(() => ({}));
    if (routePath === '/v1/recommendations/nearby') {
      payload = await nearby(body);
    } else if (routePath === '/v1/recommendations/route') {
      payload = await route(body);
    } else {
      status = 404;
      payload = { error: 'Not found' };
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
  return json(payload, status, rateHeaders(auth));
});
