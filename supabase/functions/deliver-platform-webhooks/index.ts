import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const secretKeys = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); }
  catch { return {}; }
})();
const SERVICE_KEY = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WORKER_SECRET = Deno.env.get('KLEENEST_PLATFORM_WEBHOOK_WORKER_SECRET') ?? '';
const WEBHOOK_MASTER_KEY = Deno.env.get('KLEENEST_PLATFORM_WEBHOOK_MASTER_KEY') ?? '';

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ClaimedDelivery = {
  delivery_id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  event_created_at: string;
  url: string;
  signing_secret: string;
  payload: Record<string, unknown>;
  attempt: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function signature(secret: string, timestamp: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return `v1=${hex(digest)}`;
}

async function complete(deliveryId: string, success: boolean, httpStatus: number | null, error: string | null) {
  const { error: rpcError } = await db.rpc('complete_platform_webhook_delivery', {
    p_delivery_id: deliveryId,
    p_success: success,
    p_http_status: httpStatus,
    p_error: error,
  });
  if (rpcError) console.error('Webhook completion update failed', rpcError.code ?? 'rpc_error');
}

async function deliver(item: ClaimedDelivery) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const envelope = JSON.stringify({
    id: item.event_id,
    type: item.event_type,
    createdAt: item.event_created_at,
    data: item.payload ?? {},
  });
  const signed = await signature(item.signing_secret, timestamp, envelope);

  try {
    const response = await fetch(item.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Kleenest-Webhooks/1.0',
        'Kleenest-Webhook-Id': item.event_id,
        'Kleenest-Webhook-Timestamp': timestamp,
        'Kleenest-Webhook-Signature': signed,
        'Kleenest-Webhook-Event': item.event_type,
        'Kleenest-Webhook-Attempt': String(item.attempt),
      },
      body: envelope,
      signal: AbortSignal.timeout(10000),
    });
    const success = response.status >= 200 && response.status < 300;
    await complete(
      item.delivery_id,
      success,
      response.status,
      success ? null : `HTTP ${response.status}`,
    );
    return { deliveryId: item.delivery_id, success, status: response.status };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'network_error';
    await complete(item.delivery_id, false, null, name);
    return { deliveryId: item.delivery_id, success: false, status: null };
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SERVICE_KEY || !WEBHOOK_MASTER_KEY || !WORKER_SECRET) return json({ error: 'Service unavailable' }, 503);
  if ((req.headers.get('x-kleenest-worker-secret') ?? '') !== WORKER_SECRET) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const requested = Math.round(Number(body?.limit ?? 20));
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(requested, 50)) : 20;

  const { data, error } = await db.rpc('claim_platform_webhook_deliveries', {
    p_master_key: WEBHOOK_MASTER_KEY,
    p_limit: limit,
  });
  if (error) {
    console.error('Webhook claim failed', error.code ?? 'rpc_error');
    return json({ error: 'Delivery claim failed' }, 500);
  }

  const deliveries = (Array.isArray(data) ? data : []) as ClaimedDelivery[];
  const results = await Promise.all(deliveries.map(deliver));
  return json({
    claimed: deliveries.length,
    delivered: results.filter(item => item.success).length,
    failed: results.filter(item => !item.success).length,
  });
});
