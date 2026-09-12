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

async function callBrowserToken(clientToken: string, origin: string, path: string, body: unknown) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/platform-api${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-kleenest-client-token': clientToken,
      'origin': origin,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload,
    allowOrigin: response.headers.get('access-control-allow-origin') ?? '',
    credentialType: response.headers.get('x-kleenest-credential-type') ?? '',
  };
}

async function browserPreflight(origin: string) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/platform-api/v1/recommendations/nearby`, {
    method: 'OPTIONS',
    headers: {
      'origin': origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type,x-kleenest-client-token',
    },
    signal: AbortSignal.timeout(10000),
  });
  return {
    status: response.status,
    allowOrigin: response.headers.get('access-control-allow-origin') ?? '',
    allowHeaders: response.headers.get('access-control-allow-headers') ?? '',
  };
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

  const browserOrigin = 'https://smoke.kleenest.invalid';
  let browserTokenId = '';
  let browserAllowed = { ok: false, status: 0, payload: {} as any, allowOrigin: '', credentialType: '' };
  let browserDenied = { ok: false, status: 0, payload: {} as any, allowOrigin: '', credentialType: '' };
  const preflight = await browserPreflight(browserOrigin);

  try {
    const { data: internalPartner, error: partnerError } = await db
      .from('platform_partners')
      .select('id')
      .eq('slug', 'kleenest-internal-development')
      .single();
    if (partnerError || !internalPartner?.id) throw partnerError ?? new Error('Internal sandbox partner unavailable');

    const { data: issued, error: issueError } = await db.rpc('issue_platform_publishable_token', {
      p_partner_id: internalPartner.id,
      p_label: 'Live browser smoke',
      p_allowed_origins: [browserOrigin],
      p_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      p_quota_per_minute: 5,
    });
    if (issueError || !issued?.client_token || !issued?.api_key_id) {
      throw issueError ?? new Error('Publishable smoke token issuance failed');
    }

    browserTokenId = String(issued.api_key_id);
    browserAllowed = await callBrowserToken(
      String(issued.client_token),
      browserOrigin,
      '/v1/recommendations/nearby',
      { location: { latitude: 38.627, longitude: -90.1994 }, radiusMeters: 16093, limit: 1 },
    );
    browserDenied = await callBrowserToken(
      String(issued.client_token),
      'https://wrong-origin.kleenest.invalid',
      '/v1/recommendations/nearby',
      { location: { latitude: 38.627, longitude: -90.1994 }, radiusMeters: 16093, limit: 1 },
    );
  } catch (error) {
    console.error('Publishable client-token smoke failed', error instanceof Error ? error.name : 'unknown_error');
  } finally {
    if (browserTokenId) {
      const { error: cleanupError } = await db.from('platform_api_keys').delete().eq('id', browserTokenId);
      if (cleanupError) console.error('Publishable smoke cleanup failed', cleanupError.code ?? 'delete_error');
    }
  }

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
    browserClientPreflight: preflight.status === 204
      && preflight.allowOrigin === browserOrigin
      && preflight.allowHeaders.toLowerCase().includes('x-kleenest-client-token'),
    browserClientAllowed: browserAllowed.ok
      && browserAllowed.status === 200
      && browserAllowed.allowOrigin === browserOrigin
      && browserAllowed.credentialType === 'publishable',
    browserClientOriginDenied: browserDenied.status === 403
      && (browserDenied.payload as any)?.code === 'origin_not_allowed',
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
      browserPreflight: preflight.status,
      browserAllowed: browserAllowed.status,
      browserDenied: browserDenied.status,
    },
    sample: {
      nearby: nearbyRecommendations.slice(0, 1),
      routeNextStop: routeRecommendations[0] ?? null,
      portalLocation,
    },
  }, Object.values(checks).every(Boolean) ? 200 : 502);
});
