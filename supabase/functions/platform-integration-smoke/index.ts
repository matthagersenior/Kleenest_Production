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

async function getText(url: string, redirect: RequestRedirect = 'follow') {
  const response = await fetch(url, { redirect, signal: AbortSignal.timeout(15000) });
  const body = await response.text().catch(() => '');
  return {
    ok: response.ok,
    status: response.status,
    body,
    contentType: response.headers.get('content-type') ?? '',
    location: response.headers.get('location') ?? '',
  };
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

  const distributionBase = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/platform-distribution/v1`;
  const manifestResponse = await getText(`${distributionBase}/manifest.json`);
  let manifest: any = {};
  try { manifest = JSON.parse(manifestResponse.body); } catch {}

  const [sdk, widget, map, routeModule] = await Promise.all([
    getText(`${distributionBase}/sdk.js`),
    getText(`${distributionBase}/widget.js`),
    getText(`${distributionBase}/map.js`),
    getText(`${distributionBase}/route.js`),
  ]);

  const portalEdgeUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/platform-developer-portal`;
  const portalRedirect = await getText(portalEdgeUrl, 'manual');
  const portalLocation = portalRedirect.location;
  const portalHtml = portalLocation.startsWith('https://')
    ? await getText(portalLocation)
    : { ok: false, status: 0, body: '', contentType: '', location: '' };

  const manifestModules = manifest?.modules && typeof manifest.modules === 'object'
    ? Object.values(manifest.modules) as unknown[]
    : [];
  const manifestHttps = typeof manifest?.apiBaseUrl === 'string' &&
    manifest.apiBaseUrl.startsWith('https://') &&
    typeof manifest?.openapi === 'string' &&
    manifest.openapi.startsWith('https://') &&
    manifestModules.length === 4 &&
    manifestModules.every(value => typeof value === 'string' && value.startsWith('https://'));

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
    distributionManifest: manifestResponse.ok && manifest?.version === '0.1.0' && manifestHttps,
    distributionSdk: sdk.ok && sdk.contentType.includes('javascript') && sdk.body.includes('KleenestClient'),
    distributionWidget: widget.ok && widget.contentType.includes('javascript') && widget.body.includes('mountKleenestFinder'),
    distributionMap: map.ok && map.contentType.includes('javascript') && map.body.includes('recommendationsToGeoJSON'),
    distributionRoute: routeModule.ok && routeModule.contentType.includes('javascript') && routeModule.body.includes('KleenestRouteClient'),
    portalRedirect: [301,302,307,308].includes(portalRedirect.status) && portalLocation.startsWith('https://'),
    portalHtml: portalHtml.ok && portalHtml.contentType.toLowerCase().includes('text/html') && portalHtml.body.includes('Kleenest Developer Portal'),
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
    http: {
      nearby: nearby.status,
      route: route.status,
      manifest: manifestResponse.status,
      sdk: sdk.status,
      widget: widget.status,
      map: map.status,
      routeModule: routeModule.status,
      portalRedirect: portalRedirect.status,
      portalHtml: portalHtml.status,
    },
    sample: {
      nearby: nearbyRecommendations.slice(0, 1),
      routeNextStop: routeRecommendations[0] ?? null,
      portalLocation,
    },
  }, Object.values(checks).every(Boolean) ? 200 : 502);
});
