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

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Actor = { userId: string; email: string };
type NewLocation = {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

class ProvisionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'ProvisionError';
  }
}

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

function text(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function uuid(value: unknown, label: string) {
  const normalized = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ProvisionError(`${label} is invalid`);
  }
  return normalized;
}

function normalized(value: unknown) {
  return text(value).toLocaleLowerCase('en-US');
}

async function actorFor(req: Request): Promise<Actor | null> {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ') || !PUBLISHABLE_KEY) return null;
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user?.id || !data.user.email) return null;
  return { userId: data.user.id, email: data.user.email };
}

async function existingOwnedBusiness(actor: Actor, businessName: string) {
  const { data: memberships, error: membershipError } = await admin
    .from('business_members')
    .select('business_id')
    .eq('user_id', actor.userId)
    .eq('role', 'owner');
  if (membershipError) throw membershipError;
  const ids = (memberships ?? []).map(row => String(row.business_id)).filter(Boolean);
  if (!ids.length) return null;
  const { data: businesses, error: businessError } = await admin
    .from('businesses')
    .select('id,name,is_demo_test')
    .in('id', ids)
    .eq('is_demo_test', false);
  if (businessError) throw businessError;
  return (businesses ?? []).find(row => normalized(row.name) === normalized(businessName)) ?? null;
}

async function ensureWorkspace(actor: Actor, businessName: string) {
  const existing = await existingOwnedBusiness(actor, businessName);
  if (existing?.id) return { businessId: String(existing.id), created: false };

  const { data: business, error: businessError } = await admin
    .from('businesses')
    .insert({ name: businessName, email: actor.email })
    .select('id')
    .single();
  if (businessError || !business?.id) throw businessError ?? new Error('Business workspace was not created.');

  const businessId = String(business.id);
  const { error: memberError } = await admin
    .from('business_members')
    .insert({ business_id: businessId, user_id: actor.userId, role: 'owner' });
  if (memberError) {
    await admin.from('businesses').delete().eq('id', businessId);
    throw memberError;
  }
  return { businessId, created: true };
}

async function cleanupCreatedWorkspace(businessId: string, actor: Actor) {
  const [{ count: claims }, { count: managed }] = await Promise.all([
    admin.from('location_claims').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    admin.from('locations').select('id', { count: 'exact', head: true }).or(`business_id.eq.${businessId},claimed_business_id.eq.${businessId}`),
  ]);
  if (Number(claims || 0) > 0 || Number(managed || 0) > 0) return;
  await admin.from('business_members').delete().eq('business_id', businessId).eq('user_id', actor.userId);
  await admin.from('businesses').delete().eq('id', businessId);
}

async function submitExistingClaim(req: Request, businessId: string, locationIdRaw: unknown) {
  const locationId = uuid(locationIdRaw, 'Location');
  const authHeader = req.headers.get('authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });

  // Delegate all claim authority to the canonical authenticated RPC.
  // Free/self-service claiming changes price and funnel friction, never verification strength.
  const { error } = await userClient.rpc('claim_location_for_business', {
    p_location_id: locationId,
    p_business_id: businessId,
  });
  if (error) throw new ProvisionError(error.message || 'Location claim could not be submitted.', 400);
  return { locationId, action: 'claim_submitted' };
}

async function resolveBusinessLocation(req: Request, raw: NewLocation) {
  const query = [text(raw?.address), text(raw?.city), text(raw?.state), text(raw?.postalCode), text(raw?.country) || 'US'].filter(Boolean).join(', ');
  if (!query) throw new ProvisionError('Location address is required.');
  const authHeader = req.headers.get('authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.functions.invoke('resolve-consumer-location', {
    body: { query },
  });
  if (error) throw new ProvisionError('Kleenest could not locate that address. Check the address and try again.');
  const resolvedLatitude = Number(data?.resolved?.latitude);
  const resolvedLongitude = Number(data?.resolved?.longitude);
  if (!Number.isFinite(resolvedLatitude) || !Number.isFinite(resolvedLongitude)) {
    throw new ProvisionError('Kleenest could not locate that address. Check the address and try again.');
  }
  return {
    resolvedLatitude,
    resolvedLongitude,
    resolvedLabel: text(data?.resolved?.label) || query,
    geocoderProvider: text(data?.provider) || 'configured',
  };
}

async function createOwnedLocation(req: Request, actor: Actor, businessId: string, businessName: string, raw: NewLocation) {
  const name = text(raw?.name) || businessName;
  const address = text(raw?.address);
  const city = text(raw?.city);
  const state = text(raw?.state);
  const postalCode = text(raw?.postalCode);
  const { resolvedLatitude, resolvedLongitude, resolvedLabel, geocoderProvider } = await resolveBusinessLocation(req, raw);

  const { data: brandIdentity, error: brandError } = await admin.rpc('resolve_location_brand_identity', {
    p_brand: null,
    p_name: name,
    p_operator: null,
  });
  if (brandError) throw brandError;
  const brand = text(brandIdentity?.canonical_brand) || null;

  const { data: matchedLocationId, error: matchError } = await admin.rpc('resolve_location_external_identity_v2', {
    p_source_dataset: 'business_self_service',
    p_source_external_id: null,
    p_latitude: resolvedLatitude,
    p_longitude: resolvedLongitude,
    p_name: name,
    p_brand: brand,
    p_operator: null,
    p_address: address || null,
    p_city: city || null,
    p_state: state || null,
  });
  if (matchError) throw matchError;

  let locationId = text(matchedLocationId);
  const duplicate = Boolean(locationId);
  if (!locationId) {
    const { data: location, error } = await admin
      .from('locations')
      .insert({
        name,
        address: address || null,
        city: city || null,
        state: state || null,
        postal_code: postalCode || null,
        country: text(raw?.country) || 'US',
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        source: 'business_self_service',
        source_dataset: 'user_discovery',
        brand_name: brand,
        created_by: actor.userId,
        owner_name: businessName,
        owner_email: actor.email,
        source_metadata: {
          provider: 'user_discovery',
          source_dataset: 'business_self_service',
          brand,
          brand_identity_source: text(brandIdentity?.source) || null,
          brand_identity_confidence: brandIdentity?.confidence ?? null,
          captured_at: new Date().toISOString(),
          geocoder_provider: geocoderProvider,
          geocoder_label: resolvedLabel,
          authority_status: 'unclaimed_pending_verification',
        },
      })
      .select('id')
      .single();
    if (error || !location?.id) throw error ?? new Error('Location was not created.');
    locationId = String(location.id);
  }

  const claim = await submitExistingClaim(req, businessId, locationId);
  return { ...claim, action: duplicate ? claim.action : 'location_created_claim_submitted' };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'POST required' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE_KEY) return json(req, { error: 'Service unavailable' }, 503);

  const actor = await actorFor(req);
  if (!actor) return json(req, { error: 'Unauthorized' }, 401);
  let createdWorkspaceId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const businessName = text(body?.businessName);
    if (!businessName) throw new ProvisionError('Business name is required.');

    const workspace = await ensureWorkspace(actor, businessName);
    if (workspace.created) createdWorkspaceId = workspace.businessId;
    let location: { locationId: string | null; action: string } = { locationId: null, action: 'none' };

    if (body?.existingLocationId) {
      location = await submitExistingClaim(req, workspace.businessId, body.existingLocationId);
    } else if (body?.newLocation && typeof body.newLocation === 'object' && !Array.isArray(body.newLocation)) {
      location = await createOwnedLocation(req, actor, workspace.businessId, businessName, body.newLocation as NewLocation);
    }

    return json(req, {
      businessId: workspace.businessId,
      businessName,
      workspaceCreated: workspace.created,
      locationId: location.locationId,
      locationAction: location.action,
      verificationStatus: 'pending',
    });
  } catch (error) {
    if (createdWorkspaceId) {
      await cleanupCreatedWorkspace(createdWorkspaceId, actor).catch(cleanupError =>
        console.error('business-self-service-provision cleanup failed', cleanupError instanceof Error ? cleanupError.name : 'unknown_error')
      );
    }
    if (error instanceof ProvisionError) return json(req, { error: error.message }, error.status);
    console.error('business-self-service-provision failed', error instanceof Error ? error.name : 'unknown_error');
    return json(req, { error: 'Business setup could not be completed.' }, 400);
  }
});
