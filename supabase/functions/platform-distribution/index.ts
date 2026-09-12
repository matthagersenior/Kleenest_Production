import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import openapi from "./openapi.json" with { type: "json" };

const VERSION = "0.1.0";

const SDK = `export class KleenestClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || '').replace(/\\/$/, '');
    if (!this.baseUrl) throw new Error('baseUrl is required');
    this.apiKey = options.apiKey;
    this.clientToken = options.clientToken;
    if (this.apiKey && this.clientToken) throw new Error('Use either apiKey or clientToken, not both');
    this.fetchImpl = options.fetch || globalThis.fetch;
    if (!this.fetchImpl) throw new Error('A fetch implementation is required');
  }
  async request(path, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('accept', 'application/json');
    if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    if (this.clientToken) headers.set('x-kleenest-client-token', this.clientToken);
    else if (this.apiKey) headers.set('x-kleenest-api-key', this.apiKey);
    const response = await this.fetchImpl(this.baseUrl + path, { ...init, headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error) : 'Kleenest API request failed with status ' + response.status;
      throw new Error(message);
    }
    return payload;
  }
  health() { return this.request('/health'); }
  getPlace(kleenestPlaceId) {
    const id = String(kleenestPlaceId || '').trim();
    if (!id) throw new Error('kleenestPlaceId is required');
    return this.request('/v1/places/' + encodeURIComponent(id));
  }
  recommendNearby(input) { return this.request('/v1/recommendations/nearby', { method: 'POST', body: JSON.stringify(input) }); }
  recommendRoute(input) { return this.request('/v1/recommendations/route', { method: 'POST', body: JSON.stringify(input) }); }
}
export const KLEENEST_SDK_VERSION = '${VERSION}';
`;

const WIDGET = `export function mountKleenestFinder(element, options) {
  if (!element) throw new Error('element is required');
  if (!options?.client) throw new Error('options.client is required');
  const radiusMeters = options.radiusMeters ?? 16093;
  const limit = options.limit ?? 5;
  let disposed = false;
  element.replaceChildren();
  const root = document.createElement('section');
  root.dataset.kleenestWidget = 'finder';
  const heading = document.createElement('h3');
  heading.textContent = options.title ?? 'Find a restroom';
  root.appendChild(heading);
  const status = document.createElement('p');
  status.textContent = 'Finding Kleenest recommendations…';
  root.appendChild(status);
  const list = document.createElement('ol');
  root.appendChild(list);
  element.appendChild(root);
  options.client.recommendNearby({
    location: { latitude: options.latitude, longitude: options.longitude },
    radiusMeters, limit
  }).then(result => {
    if (disposed) return;
    list.replaceChildren();
    const recommendations = result?.recommendations ?? [];
    status.textContent = recommendations.length
      ? recommendations.length + ' Kleenest recommendation' + (recommendations.length === 1 ? '' : 's')
      : 'No Kleenest restroom recommendations found in this area.';
    for (const recommendation of recommendations) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = recommendation.deepLink;
      link.textContent = recommendation.place.name + ' — ' + recommendation.score + '/100';
      item.appendChild(link);
      const explanation = document.createElement('div');
      explanation.textContent = recommendation.explanation;
      item.appendChild(explanation);
      list.appendChild(item);
    }
  }).catch(error => {
    if (!disposed) status.textContent = error instanceof Error ? error.message : 'Kleenest recommendation failed.';
  });
  return () => { disposed = true; element.replaceChildren(); };
}
export const KLEENEST_WIDGET_VERSION = '${VERSION}';
`;

const MAP = `export function recommendationsToGeoJSON(recommendations = []) {
  return {
    type: 'FeatureCollection',
    features: recommendations
      .filter(item => item?.place?.latitude != null && item?.place?.longitude != null)
      .map(item => ({
        type: 'Feature',
        id: item.place.kleenestPlaceId,
        geometry: { type: 'Point', coordinates: [item.place.longitude, item.place.latitude] },
        properties: {
          kleenestPlaceId: item.place.kleenestPlaceId,
          name: item.place.name,
          score: item.score,
          verificationStatus: item.trust?.verificationStatus,
          confidence: item.trust?.confidence ?? null,
          explanation: item.explanation,
          deepLink: item.deepLink
        }
      }))
  };
}
export const KLEENEST_MAP_VERSION = '${VERSION}';
`;

const ROUTE = `export class KleenestRouteClient {
  constructor(transport) {
    if (!transport?.recommendRoute) throw new Error('A recommendRoute transport is required');
    this.transport = transport;
  }
  findStops(options) {
    return this.transport.recommendRoute({
      route: options.route,
      corridorMeters: options.corridorMeters ?? 8047,
      requirements: options.requirements,
      maxDetourMinutes: options.maxDetourMinutes,
      limit: options.limit ?? 10
    });
  }
  async nextStop(options) {
    const result = await this.findStops({ ...options, limit: Math.max(1, options.limit ?? 1) });
    return result.recommendations?.[0] ?? null;
  }
}
export function lineStringFromCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('A route requires at least two coordinates');
  }
  return { type: 'LineString', coordinates };
}
export const KLEENEST_ROUTE_VERSION = '${VERSION}';
`;

function response(body: BodyInit | null, contentType: string, cache = true) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "cache-control": cache ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    }
  });
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return response("", "text/plain; charset=utf-8", false);
  if (req.method !== "GET") return response(JSON.stringify({ error: "Method not allowed" }), "application/json; charset=utf-8", false);

  const url = new URL(req.url);
  const configuredOrigin = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const publicOrigin = configuredOrigin || url.origin;
  const base = publicOrigin + "/functions/v1/platform-distribution/v1";
  if (url.pathname.endsWith("/v1/manifest.json")) {
    return response(JSON.stringify({
      version: VERSION,
      status: "beta",
      apiBaseUrl: publicOrigin + "/functions/v1/platform-api",
      openapi: base + "/openapi.json",
      modules: {
        sdk: base + "/sdk.js",
        widget: base + "/widget.js",
        map: base + "/map.js",
        route: base + "/route.js"
      },
      packages: {
        core: "@kleenest/platform-core@0.1.0",
        sdk: "@kleenest/sdk-js@0.1.0",
        widget: "@kleenest/widget@0.1.0",
        map: "@kleenest/map-layer@0.1.0",
        route: "@kleenest/route-sdk@0.1.0"
      }
    }, null, 2), "application/json; charset=utf-8", false);
  }
  if (url.pathname.endsWith("/v1/openapi.json")) return response(JSON.stringify(openapi, null, 2), "application/json; charset=utf-8");
  if (url.pathname.endsWith("/v1/sdk.js")) return response(SDK, "text/javascript; charset=utf-8");
  if (url.pathname.endsWith("/v1/widget.js")) return response(WIDGET, "text/javascript; charset=utf-8");
  if (url.pathname.endsWith("/v1/map.js")) return response(MAP, "text/javascript; charset=utf-8");
  if (url.pathname.endsWith("/v1/route.js")) return response(ROUTE, "text/javascript; charset=utf-8");

  return response(JSON.stringify({
    name: "Kleenest Platform Distribution",
    version: VERSION,
    manifest: base + "/manifest.json"
  }, null, 2), "application/json; charset=utf-8", false);
});
