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

type Actor = {
  userId: string;
  email: string;
  platformOwner: boolean;
};

class PartnerAdminError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'PartnerAdminError';
  }
}

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

async function actorFor(req: Request): Promise<Actor | null> {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ') || !PUBLISHABLE_KEY) return null;

  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user?.id || !user.email) return null;

  const { data: ownerAllowed, error: ownerError } = await userClient.rpc('is_platform_owner_session');
  return {
    userId: user.id,
    email: user.email,
    platformOwner: !ownerError && ownerAllowed === true,
  };
}

function requirePlatformOwner(actor: Actor) {
  if (!actor.platformOwner) throw new PartnerAdminError('Platform owner permission required', 403);
}

function text(value: unknown, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function uuid(value: unknown, name: string) {
  const normalized = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new PartnerAdminError(`${name} is invalid`);
  }
  return normalized;
}

async function memberRole(actor: Actor, partnerId: string): Promise<string | null> {
  if (actor.platformOwner) return 'platform_owner';
  const { data, error } = await db.rpc('platform_partner_member_role', {
    p_user_id: actor.userId,
    p_partner_id: partnerId,
  });
  if (error) throw error;
  return typeof data === 'string' && data ? data : null;
}

async function internalDiagnostics() {
  const { data: apiKey, error: keyError } = await db.rpc('platform_internal_development_api_key');
  if (keyError || !apiKey) throw keyError ?? new Error('Internal development API key is unavailable.');

  const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/platform-api`;
  const callApi = async (path: string, body: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-kleenest-api-key': String(apiKey),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  };

  const nearby = await callApi('/v1/recommendations/nearby', {
    location: { latitude: 38.627, longitude: -90.1994 },
    radiusMeters: 16093,
    limit: 3,
  });
  const route = await callApi('/v1/recommendations/route', {
    route: {
      type: 'LineString',
      coordinates: [[-90.1994, 38.627], [-89.6501, 39.7817]],
    },
    corridorMeters: 8047,
    limit: 3,
  });

  const recommendations = Array.isArray((nearby.payload as any)?.recommendations)
    ? (nearby.payload as any).recommendations : [];
  const routeRecommendations = Array.isArray((route.payload as any)?.recommendations)
    ? (route.payload as any).recommendations : [];
  const mapFeatureCount = recommendations.filter((item: any) =>
    Number.isFinite(Number(item?.place?.latitude)) &&
    Number.isFinite(Number(item?.place?.longitude))
  ).length;
  const widgetRenderable = recommendations.every((item: any) =>
    typeof item?.place?.name === 'string' &&
    Number.isFinite(Number(item?.score)) &&
    typeof item?.deepLink === 'string'
  );

  return {
    checkedAt: new Date().toISOString(),
    partner: 'kleenest-internal-development',
    surfaces: {
      restNearby: { ok: nearby.ok, status: nearby.status, resultCount: recommendations.length },
      sdk: { ok: nearby.ok, transport: 'REST v1', contract: 'RecommendationResponse' },
      widget: { ok: nearby.ok && widgetRenderable, renderableRecommendations: recommendations.length },
      mapLayer: { ok: nearby.ok, geoJsonFeatureCount: mapFeatureCount },
      restRoute: { ok: route.ok, status: route.status, resultCount: routeRecommendations.length },
      routeSdk: { ok: route.ok, nextStopAvailable: Boolean(routeRecommendations[0]) },
      mcp: {
        ok: nearby.ok && route.ok,
        delegation: 'find_nearby_restrooms + find_restrooms_along_route -> REST v1',
      },
    },
    sample: {
      nearby: recommendations.slice(0, 2),
      routeNextStop: routeRecommendations[0] ?? null,
    },
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: json({}).headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SERVICE_KEY || !PUBLISHABLE_KEY) return json({ error: 'Service unavailable' }, 503);

  const actor = await actorFor(req);
  if (!actor) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const operation = text(body?.operation, 80);

    if (operation === 'actor') {
      return json({ userId: actor.userId, email: actor.email, platformOwner: actor.platformOwner });
    }

    if (operation === 'create-partner') {
      requirePlatformOwner(actor);
      const { data, error } = await db.rpc('create_platform_partner', {
        p_slug: text(body?.slug, 64),
        p_name: text(body?.name, 160),
        p_plan: text(body?.plan || 'developer', 24),
        p_quota_per_minute: Number(body?.quotaPerMinute ?? 60),
        p_quota_per_month: Number(body?.quotaPerMonth ?? 10000),
      });
      if (error) throw error;
      const bundleKey = text(body?.bundleKey || 'starter_api', 80);
      const { error: bundleError } = await db.rpc('apply_platform_product_bundle', {
        p_partner_id: data,
        p_bundle_key: bundleKey,
        p_reason: 'Developer Portal partner creation',
      });
      if (bundleError) throw bundleError;
      return json({ partnerId: data, bundleKey });
    }

    if (operation === 'set-billing') {
      requirePlatformOwner(actor);
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

    if (operation === 'create-invite') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      const role = text(body?.role || 'developer', 24);
      const expiresAt = body?.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString();
      const { data, error } = await db.rpc('create_platform_partner_invite', {
        p_actor_user_id: actor.userId,
        p_partner_id: partnerId,
        p_email: text(body?.email, 320),
        p_role: role,
        p_platform_owner: actor.platformOwner,
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      return json({ ...data, warning: 'The invitation token is shown only once.' });
    }

    if (operation === 'claim-invite') {
      const { data, error } = await db.rpc('claim_platform_partner_invite', {
        p_raw_token: text(body?.inviteToken, 160),
        p_user_id: actor.userId,
        p_user_email: actor.email,
      });
      if (error) throw error;
      return json(data ?? {});
    }

    if (operation === 'my-partners') {
      if (actor.platformOwner) {
        const { data, error } = await db
          .from('platform_partners')
          .select('id,slug,name,status,plan,quota_per_minute,quota_per_month,created_at')
          .order('created_at', { ascending: true })
          .limit(250);
        if (error) throw error;
        return json({
          platformOwner: true,
          memberships: (data ?? []).map(partner => ({ ...partner, partner_id: partner.id, role: 'platform_owner' })),
        });
      }
      const { data, error } = await db.rpc('platform_user_partner_memberships', {
        p_user_id: actor.userId,
      });
      if (error) throw error;
      return json({ platformOwner: false, memberships: data ?? [] });
    }

    if (operation === 'summary') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      if (actor.platformOwner) {
        const { data, error } = await db.rpc('platform_partner_summary', {
          p_partner_id: partnerId,
        });
        if (error) throw error;
        return json({ ...(data ?? {}), membership_role: 'platform_owner', product_access: data?.product_access ?? null });
      }
      const { data, error } = await db.rpc('platform_member_partner_summary', {
        p_user_id: actor.userId,
        p_partner_id: partnerId,
      });
      if (error) throw error;
      return json({ ...(data ?? {}), product_access: data?.product_access ?? null });
    }

    if (operation === 'issue-key') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      if (actor.platformOwner) {
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
      const { data, error } = await db.rpc('issue_platform_member_api_key', {
        p_user_id: actor.userId,
        p_partner_id: partnerId,
        p_label: text(body?.label || 'Integration key', 120),
        p_expires_at: body?.expiresAt || null,
      });
      if (error) throw error;
      return json({ ...data, warning: 'The API key is shown only once. Store it securely.' });
    }

    if (operation === 'issue-public-token') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      const allowedOrigins = Array.isArray(body?.allowedOrigins)
        ? body.allowedOrigins.map((value: unknown) => text(value, 300)).filter(Boolean).slice(0, 20)
        : [];
      const expiresAt = body?.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString();
      const quotaPerMinute = Math.max(1, Math.min(Number(body?.quotaPerMinute ?? 30), 120));

      if (actor.platformOwner) {
        const { data, error } = await db.rpc('issue_platform_publishable_token', {
          p_partner_id: partnerId,
          p_label: text(body?.label || 'Browser token', 120),
          p_allowed_origins: allowedOrigins,
          p_expires_at: expiresAt,
          p_quota_per_minute: quotaPerMinute,
        });
        if (error) throw error;
        return json({ ...data, warning: 'This browser token is publishable but origin-restricted and shown only once.' });
      }

      const { data, error } = await db.rpc('issue_platform_member_publishable_token', {
        p_user_id: actor.userId,
        p_partner_id: partnerId,
        p_label: text(body?.label || 'Browser token', 120),
        p_allowed_origins: allowedOrigins,
        p_expires_at: expiresAt,
        p_quota_per_minute: quotaPerMinute,
      });
      if (error) throw error;
      return json({ ...data, warning: 'This browser token is publishable but origin-restricted and shown only once.' });
    }

    if (operation === 'revoke-key') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      const apiKeyId = uuid(body?.apiKeyId, 'apiKeyId');
      if (actor.platformOwner) {
        const { data, error } = await db.rpc('revoke_platform_api_key', { p_api_key_id: apiKeyId });
        if (error) throw error;
        return json({ revoked: Boolean(data) });
      }
      const { data, error } = await db.rpc('revoke_platform_member_api_key', {
        p_user_id: actor.userId,
        p_partner_id: partnerId,
        p_api_key_id: apiKeyId,
      });
      if (error) throw error;
      return json({ revoked: Boolean(data) });
    }

    if (operation === 'create-webhook') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      const eventTypes = Array.isArray(body?.eventTypes)
        ? body.eventTypes.map((value: unknown) => text(value, 120)).filter(Boolean).slice(0, 64)
        : ['*'];
      if (actor.platformOwner) {
        const { data, error } = await db.rpc('create_platform_webhook_endpoint', {
          p_partner_id: partnerId,
          p_url: text(body?.url, 1000),
          p_label: text(body?.label || 'Default', 120),
          p_event_types: eventTypes,
        });
        if (error) throw error;
        return json({ ...data, warning: 'The signing secret is shown only once. Store it securely.' });
      }
      const { data, error } = await db.rpc('create_platform_member_webhook_endpoint', {
        p_user_id: actor.userId,
        p_partner_id: partnerId,
        p_url: text(body?.url, 1000),
        p_label: text(body?.label || 'Default', 120),
        p_event_types: eventTypes,
      });
      if (error) throw error;
      return json({ ...data, warning: 'The signing secret is shown only once. Store it securely.' });
    }

    if (operation === 'disable-webhook') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      const endpointId = uuid(body?.endpointId, 'endpointId');
      if (actor.platformOwner) {
        const { data, error } = await db.rpc('disable_platform_webhook_endpoint', {
          p_endpoint_id: endpointId,
        });
        if (error) throw error;
        return json({ disabled: Boolean(data) });
      }
      const { data, error } = await db.rpc('disable_platform_member_webhook_endpoint', {
        p_user_id: actor.userId,
        p_partner_id: partnerId,
        p_endpoint_id: endpointId,
      });
      if (error) throw error;
      return json({ disabled: Boolean(data) });
    }

    if (operation === 'enqueue-test-webhook') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      if (actor.platformOwner) {
        const { data, error } = await db.rpc('enqueue_platform_webhook_event', {
          p_partner_id: partnerId,
          p_event_type: 'platform.test',
          p_payload: { message: 'Kleenest Platform test webhook', sentAt: new Date().toISOString() },
        });
        if (error) throw error;
        return json({ eventId: data });
      }
      const { data, error } = await db.rpc('enqueue_platform_member_test_webhook', {
        p_user_id: actor.userId,
        p_partner_id: partnerId,
      });
      if (error) throw error;
      return json({ eventId: data });
    }

    if (operation === 'member-role') {
      const partnerId = uuid(body?.partnerId, 'partnerId');
      return json({ role: await memberRole(actor, partnerId) });
    }

    if (operation === 'diagnostics') {
      requirePlatformOwner(actor);
      return json(await internalDiagnostics());
    }

    return json({ error: 'Unsupported operation' }, 400);
  } catch (error) {
    if (error instanceof PartnerAdminError) return json({ error: error.message }, error.status);
    console.error('Kleenest partner admin operation failed', error instanceof Error ? error.name : 'unknown_error');
    return json({ error: 'Operation failed' }, 400);
  }
});
