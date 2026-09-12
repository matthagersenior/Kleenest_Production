import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const secretKeys = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); }
  catch { return {}; }
})();
const publishableKeys = (() => {
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'); }
  catch { return {}; }
})();
const SERVICE_KEY = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PUBLISHABLE_KEY = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,authorization,apikey',
      'access-control-allow-methods': 'POST,OPTIONS',
    },
  });
}

async function authorized(req: Request) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ') || !PUBLISHABLE_KEY) return false;

  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return false;

  const { data: allowed, error: ownerError } = await userClient.rpc('is_platform_owner_session');
  return !ownerError && allowed === true;
}

function text(value: unknown, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function uuid(value: unknown, name: string) {
  const normalized = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${name} is invalid`);
  }
  return normalized;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: json({}).headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SERVICE_KEY || !PUBLISHABLE_KEY) return json({ error: 'Service unavailable' }, 503);
  if (!await authorized(req)) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const operation = text(body?.operation, 80);

    if (operation === 'create-partner') {
      const { data, error } = await db.rpc('create_platform_partner', {
        p_slug: text(body?.slug, 64),
        p_name: text(body?.name, 160),
        p_plan: text(body?.plan || 'developer', 24),
        p_quota_per_minute: Number(body?.quotaPerMinute ?? 60),
        p_quota_per_month: Number(body?.quotaPerMonth ?? 10000),
      });
      if (error) throw error;
      return json({ partnerId: data });
    }

    if (operation === 'set-billing') {
      const { error } = await db.rpc('set_platform_partner_billing_state', {
        p_partner_id: uuid(body?.partnerId, 'partnerId'),
        p_provider: text(body?.provider || 'manual', 24),
        p_status: text(body?.status || 'inactive', 24),
        p_plan_code: body?.planCode ? text(body.planCode, 24) : null,
        p_external_customer_id: body?.externalCustomerId ? text(body.externalCustomerId, 200) : null,
        p_external_subscription_id: body?.externalSubscriptionId ? text(body.externalSubscriptionId, 200) : null,
        p_current_period_end: body?.currentPeriodEnd || null,
        p_metadata: body?.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      });
      if (error) throw error;
      return json({ updated: true });
    }

    if (operation === 'issue-key') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      const scopes = Array.isArray(body?.scopes)
        ? body.scopes.map((value: unknown) => text(value, 80)).filter(Boolean).slice(0, 32)
        : ['recommendations:read'];
      const { data, error } = await db.rpc('issue_platform_api_key', {
        p_partner_id: partnerId,
        p_label: text(body?.label || 'Integration key', 120),
        p_scopes: scopes,
        p_expires_at: body?.expiresAt || null,
      });
      if (error) throw error;
      return json({ ...data, warning: 'The API key is shown only once. Store it securely.' });
    }

    if (operation === 'revoke-key') {
      const { data, error } = await db.rpc('revoke_platform_api_key', {
        p_api_key_id: uuid(body?.apiKeyId, 'apiKeyId'),
      });
      if (error) throw error;
      return json({ revoked: Boolean(data) });
    }

    if (operation === 'create-webhook') {
      const eventTypes = Array.isArray(body?.eventTypes)
        ? body.eventTypes.map((value: unknown) => text(value, 120)).filter(Boolean).slice(0, 64)
        : ['*'];
      const { data, error } = await db.rpc('create_platform_webhook_endpoint', {
        p_partner_id: uuid(body?.partnerId, 'partnerId'),
        p_url: text(body?.url, 1000),
        p_label: text(body?.label || 'Default', 120),
        p_event_types: eventTypes,
      });
      if (error) throw error;
      return json({ ...data, warning: 'The signing secret is shown only once. Store it securely.' });
    }

    if (operation === 'disable-webhook') {
      const { data, error } = await db.rpc('disable_platform_webhook_endpoint', {
        p_endpoint_id: uuid(body?.endpointId, 'endpointId'),
      });
      if (error) throw error;
      return json({ disabled: Boolean(data) });
    }

    if (operation === 'summary') {
      const { data, error } = await db.rpc('platform_partner_summary', {
        p_partner_id: uuid(body?.partnerId, 'partnerId'),
      });
      if (error) throw error;
      return json(data ?? {});
    }

    if (operation === 'enqueue-test-webhook') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      const { data, error } = await db.rpc('enqueue_platform_webhook_event', {
        p_partner_id: partnerId,
        p_event_type: 'platform.test',
        p_payload: {
          message: 'Kleenest Platform test webhook',
          sentAt: new Date().toISOString(),
        },
      });
      if (error) throw error;
      return json({ eventId: data });
    }

    return json({ error: 'Unsupported operation' }, 400);
  } catch (error) {
    console.error('Kleenest partner admin operation failed', error instanceof Error ? error.name : 'unknown_error');
    return json({ error: 'Operation failed' }, 400);
  }
});
