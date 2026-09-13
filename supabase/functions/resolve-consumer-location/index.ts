import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const KLEENEST_GEOCODER_BASE_URL = Deno.env.get('KLEENEST_GEOCODER_BASE_URL') || DEFAULT_BASE_URL;
const USER_AGENT = Deno.env.get('KLEENEST_GEOCODER_USER_AGENT') || 'Kleenest/1.0 (https://matthagersenior.github.io/Kleenest_Production/)';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PROVIDER_INTERVAL_MS = 1100;
const MAX_CACHE_ENTRIES = 500;

type Candidate = {
  latitude: number;
  longitude: number;
  label: string;
  category: string | null;
  type: string | null;
  importance: number | null;
};

type CacheEntry = {
  expiresAt: number;
  value: Candidate[];
};

const cache = new Map<string, CacheEntry>();
let lastProviderCallAt = 0;
let providerQueue: Promise<void> = Promise.resolve();

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info',
    'access-control-max-age': '600',
    'vary': origin === '*' ? '' : 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeQuery(value: unknown) {
  const query = String(value || '').trim().replace(/\s+/g, ' ');
  if (query.length < 2) return '';
  if (new TextEncoder().encode(query).length > 320) throw new Error('Location search is too long.');
  return query;
}

function normalizeCandidate(row: any): Candidate | null {
  const latitude = Number(row?.lat);
  const longitude = Number(row?.lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const label = String(row?.display_name || '').trim();
  if (!label) return null;
  const importance = Number(row?.importance);
  return {
    latitude,
    longitude,
    label,
    category: row?.category == null && row?.class == null ? null : String(row?.category ?? row?.class),
    type: row?.addresstype == null && row?.type == null ? null : String(row?.addresstype ?? row?.type),
    importance: Number.isFinite(importance) ? importance : null,
  };
}

function pruneCache(now: number) {
  for (const [key, entry] of cache) if (entry.expiresAt <= now) cache.delete(key);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

async function waitForProviderSlot() {
  let release!: () => void;
  const previous = providerQueue;
  providerQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const delay = Math.max(0, PROVIDER_INTERVAL_MS - (Date.now() - lastProviderCallAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastProviderCallAt = Date.now();
  return release;
}

async function lookup(query: string): Promise<Candidate[]> {
  const key = query.toLocaleLowerCase('en-US');
  const now = Date.now();
  pruneCache(now);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const release = await waitForProviderSlot();
  try {
    const url = new URL(KLEENEST_GEOCODER_BASE_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('dedupe', '1');
    url.searchParams.set('limit', '5');
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        Referer: 'https://matthagersenior.github.io/Kleenest_Production/',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status}`);
    const payload = await response.json();
    const candidates = (Array.isArray(payload) ? payload : [])
      .map(normalizeCandidate)
      .filter((value): value is Candidate => Boolean(value))
      .slice(0, 5);
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: candidates });
    pruneCache(Date.now());
    return candidates;
  } finally {
    release();
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'POST required' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const query = normalizeQuery(body?.query);
    if (!query) return json(req, { resolved: null, candidates: [] });

    const candidates = await lookup(query);
    return json(req, {
      resolved: candidates[0] || null,
      candidates,
      provider: KLEENEST_GEOCODER_BASE_URL.includes('nominatim.openstreetmap.org') ? 'nominatim' : 'configured',
      attribution: '© OpenStreetMap contributors',
    });
  } catch (error) {
    console.error('resolve-consumer-location failed', error instanceof Error ? error.message : 'unknown');
    return json(req, { error: 'Location search is temporarily unavailable.' }, 502);
  }
});
