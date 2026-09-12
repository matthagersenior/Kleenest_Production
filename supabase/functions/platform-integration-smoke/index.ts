import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const secretKeys = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); }
  catch { return {}; }
})();
const SERVICE_KEY = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function callApi(apiKey: string, path: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/platform-api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kleenest-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SERVICE_KEY) return json({ error: 'Service unavailable' }, 503);

  const supplied = req.headers.get('x-kleenest-worker-secret') ?? '';
  const { data: allowed, error: authError } = await db.rpc('authorize_platform_webhook_worker', { p_secret: supplied });
  if (authError) return json({ error: 'Service unavailable' }, 503);
  if (allowed !== true) return json({ error: 'Unauthorized' }, 401);

  const { data: apiKey, error: keyError } = await db.rpc('platform_internal_development_api_key');
  if (keyError || !apiKey) return json({ error: 'Internal sandbox credential unavailable' }, 503);

  const nearby = await callApi(String(apiKey), '/v1/recommendations/nearby', {
    location: { latitude: 38.627, longitude: -90.1994 },
    radiusMeters: 16093,
    limit: 3,
  });
  const route = await callApi(String(apiKey), '/v1/recommendations/route', {
    route: { type: 'LineString', coordinates: [[-90.1994, 38.627], [-89.6501, 39.7817]] },
    corridorMeters: 8047,
    limit: 3,
  });

  const nearbyRecommendations = Array.isArray((nearby.payload as any)?.recommendations)
    ? (nearby.payload as any).recommendations : [];
  const routeRecommendations = Array.isArray((route.payload as any)?.recommendations)
    ? (route.payload as any).recommendations : [];

  const recommendationShape = (item: any) =>
    typeof item?.place?.kleenestPlaceId === 'string' &&
    typeof item?.place?.name === 'string' &&
    Number.isFinite(Number(item?.score)) &&
    typeof item?.explanation === 'string' &&
    typeof item?.deepLink === 'string';

  const geoJsonFeatures = nearbyRecommendations.filter((item: any) =>
    Number.isFinite(Number(item?.place?.latitude)) && Number.isFinite(Number(item?.place?.longitude))
  ).map((item: any) => ({
    type: 'Feature',
    id: item.place.kleenestPlaceId,
    geometry: { type: 'Point', coordinates: [Number(item.place.longitude), Number(item.place.latitude)] },
    properties: { name: item.place.name, score: item.score, deepLink: item.deepLink },
  }));

  const checks = {
    restNearby: nearby.ok,
    sdkTransport: nearby.ok && nearbyRecommendations.every(recommendationShape),
    widgetRenderable: nearby.ok && nearbyRecommendations.every((item: any) =>
      typeof item?.place?.name === 'string' && typeof item?.deepLink === 'string'
    ),
    mapLayer: nearby.ok && geoJsonFeatures.length <= nearbyRecommendations.length,
    restRoute: route.ok,
    routeSdk: route.ok && (routeRecommendations.length === 0 || recommendationShape(routeRecommendations[0])),
    mcpDelegation: nearby.ok && route.ok,
  };

  return json({
    ok: Object.values(checks).every(Boolean),
    checkedAt: new Date().toISOString(),
    partner: 'kleenest-internal-development',
    checks,
    counts: {
      nearby: nearbyRecommendations.length,
      route: routeRecommendations.length,
      mapFeatures: geoJsonFeatures.length,
    },
    http: { nearby: nearby.status, route: route.status },
    sample: {
      nearby: nearbyRecommendations.slice(0, 1),
      routeNextStop: routeRecommendations[0] ?? null,
    },
  }, Object.values(checks).every(Boolean) ? 200 : 502);
});
