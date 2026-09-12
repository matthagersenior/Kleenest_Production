import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION = '0.1.0';
const ASSETS: Record<string, { file: string; type: string }> = {
  'kleenest-sdk.js': { file: 'kleenest-sdk.js', type: 'text/javascript; charset=utf-8' },
  'kleenest-widget.js': { file: 'kleenest-widget.js', type: 'text/javascript; charset=utf-8' },
  'kleenest-map-layer.js': { file: 'kleenest-map-layer.js', type: 'text/javascript; charset=utf-8' },
  'kleenest-route-sdk.js': { file: 'kleenest-route-sdk.js', type: 'text/javascript; charset=utf-8' },
  'kleenest-webhook-types.js': { file: 'kleenest-webhook-types.js', type: 'text/javascript; charset=utf-8' },
  'openapi-v1.yaml': { file: 'openapi-v1.yaml', type: 'application/yaml; charset=utf-8' },
  'manifest.json': { file: 'manifest.json', type: 'application/json; charset=utf-8' },
};

function json(body: unknown, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,OPTIONS',
      },
    });
  }
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const pathname = new URL(req.url).pathname;
  const marker = '/platform-assets/';
  const markerIndex = pathname.indexOf(marker);
  const relative = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : '';

  if (!relative) {
    return json({
      product: 'Kleenest Platform',
      version: VERSION,
      assets: Object.keys(ASSETS).map(name => ({
        name,
        url: './v' + VERSION + '/' + name,
      })),
    });
  }

  const prefix = 'v' + VERSION + '/';
  if (!relative.startsWith(prefix)) return json({ error: 'Version not found' }, 404);
  const assetName = relative.slice(prefix.length);
  const asset = ASSETS[assetName];
  if (!asset) return json({ error: 'Asset not found' }, 404);

  try {
    const body = await Deno.readTextFile(new URL('./assets/' + asset.file, import.meta.url));
    return new Response(body, {
      headers: {
        'content-type': asset.type,
        'cache-control': 'public, max-age=31536000, immutable',
        'access-control-allow-origin': '*',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return json({ error: 'Asset unavailable' }, 503);
  }
});
