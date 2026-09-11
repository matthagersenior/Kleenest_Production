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

type ApiKeyMap = Record<string, { partnerId?: string } | string>;

function apiKeys(): ApiKeyMap {
  try {
    const value = JSON.parse(Deno.env.get('KLEENEST_PLATFORM_API_KEYS') ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

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

function message(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
}

function boundedNumber(value: unknown, min: number, max: number, fallback?: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Value must be between ${min} and ${max}`);
  }
  return parsed;
}

function coordinate(value: unknown, min: number, max: number, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${name} is invalid`);
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

function partner(req: Request): string | null {
  const supplied = req.headers.get('x-kleenest-api-key')
    ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? '';
  if (!supplied) return null;
  const value = Object.entries(apiKeys()).find(([key]) => key === supplied)?.[1];
  if (!value) return null;
  if (typeof value === 'string') return value;
  return String(value.partnerId ?? 'partner');
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
    throw new Error('route must be a LineString with 2 to 5000 coordinates');
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
  try {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.pathname.endsWith('/health')) {
      return json({ ok: true, service: 'kleenest-platform-api', version: 'v1' });
    }

    const partnerId = partner(req);
    if (!partnerId) return json({ error: 'Unauthorized' }, 401);
    if (!SUPABASE_SECRET_KEY) return json({ error: 'Supabase service credentials are not configured' }, 500);
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const body = await req.json().catch(() => ({}));
    if (url.pathname.endsWith('/v1/recommendations/nearby')) {
      const response = await nearby(body);
      return json(response, 200, { 'x-kleenest-partner-id': partnerId });
    }
    if (url.pathname.endsWith('/v1/recommendations/route')) {
      const response = await route(body);
      return json(response, 200, { 'x-kleenest-partner-id': partnerId });
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    return json({ error: message(error) }, 400);
  }
});
