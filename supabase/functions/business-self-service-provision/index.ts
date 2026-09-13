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

async function submitExistingClaim(actor: Actor, businessId: string, locationIdRaw: unknown) {
  const locationId = uuid(locationIdRaw, 'Location');
  const { data: location, error } = await admin
    .from('locations')
    .select('id,business_id,claimed_business_id,is_active')
    .eq('id', locationId)
    .maybeSingle();
  if (error) throw error;
  if (!location || location.is_active === false) throw new ProvisionError('Location not found', 404);

  const direct = location.business_id ? String(location.business_id) : '';
  const claimed = location.claimed_business_id ? String(location.claimed_business_id) : '';
  if ((direct && direct !== businessId) || (claimed && claimed !== businessId)) {
    throw new ProvisionError('That location is already managed by another business.', 409);
  }
  if (direct === businessId || claimed === businessId) {
    return { locationId, action: 'already_owned' };
  }

  const { error: claimError } = await admin.from('location_claims').upsert({
    location_id: locationId,
    business_id: businessId,
    claimed_by: actor.userId,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'location_id,business_id' });
  if (claimError) throw claimError;
  return { locationId, action: 'claim_submitted' };
}

async function createOwnedLocation(actor: Actor, businessId: string, businessName: string, raw: NewLocation) {
  const name = text(raw?.name) || businessName;
  const address = text(raw?.address);
  const { data: owned, error: ownedError } = await admin
    .from('locations')
    .select('id,name,address')
    .eq('business_id', businessId)
    .limit(100);
  if (ownedError) throw ownedError;

  const duplicate = (owned ?? []).find(row =>
    normalized(row.name) === normalized(name) &&
    normalized(row.address) === normalized(address)
  );
  if (duplicate?.id) return { locationId: String(duplicate.id), action: 'already_owned' };

  const { data: location, error } = await admin
    .from('locations')
    .insert({
      business_id: businessId,
      claimed_business_id: businessId,
      name,
      address: address || null,
      city: text(raw?.city) || null,
      state: text(raw?.state) || null,
      postal_code: text(raw?.postalCode) || null,
      country: text(raw?.country) || 'US',
      source: 'business_self_service',
      created_by: actor.userId,
      owner_name: businessName,
      owner_email: actor.email,
    })
    .select('id')
    .single();
  if (error || !location?.id) throw error ?? new Error('Location was not created.');
  return { locationId: String(location.id), action: 'location_created' };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'POST required' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLISHABLE_KEY) return json(req, { error: 'Service unavailable' }, 503);

  const actor = await actorFor(req);
  if (!actor) return json(req, { error: 'Unauthorized' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const businessName = text(body?.businessName);
    if (!businessName) throw new ProvisionError('Business name is required.');

    const workspace = await ensureWorkspace(actor, businessName);
    let location: { locationId: string | null; action: string } = { locationId: null, action: 'none' };

    if (body?.existingLocationId) {
      location = await submitExistingClaim(actor, workspace.businessId, body.existingLocationId);
    } else if (body?.newLocation && typeof body.newLocation === 'object' && !Array.isArray(body.newLocation)) {
      location = await createOwnedLocation(actor, workspace.businessId, businessName, body.newLocation as NewLocation);
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
    if (error instanceof ProvisionError) return json(req, { error: error.message }, error.status);
    console.error('business-self-service-provision failed', error instanceof Error ? error.name : 'unknown_error');
    return json(req, { error: 'Business setup could not be completed.' }, 400);
  }
});
