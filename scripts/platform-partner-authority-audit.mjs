import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing partner-platform file: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function requireText(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

const migrations = fs.readdirSync('supabase/migrations').filter(name => /platform_partner/.test(name));
if (migrations.length !== 1) throw new Error('Expected exactly one platform partner authority migration.');
const sql = file(`supabase/migrations/${migrations[0]}`);

for (const table of [
  'platform_partners',
  'platform_partner_billing',
  'platform_api_keys',
  'platform_api_rate_buckets',
  'platform_api_usage_monthly',
  'platform_api_usage_daily',
  'platform_webhook_endpoints',
  'platform_webhook_events',
  'platform_webhook_deliveries',
]) {
  requireText(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'), `Missing ${table} authority table.`);
}
for (const fn of [
  'set_platform_partner_billing_state',
  'issue_platform_api_key',
  'authorize_platform_request',
  'record_platform_request_outcome',
  'create_platform_webhook_endpoint',
  'enqueue_platform_webhook_event',
  'claim_platform_webhook_deliveries',
  'complete_platform_webhook_delivery',
]) {
  requireText(sql, new RegExp(`function public\\.${fn}`, 'i'), `Missing ${fn} authority function.`);
}
requireText(sql, /digest\(/i, 'API keys must be hashed at rest.');
requireText(sql, /pgp_sym_encrypt/i, 'Webhook signing secrets must be encrypted at rest.');
requireText(sql, /revoke all on table public\.platform_api_keys from public,anon,authenticated/i, 'Partner secrets must be service-role only.');

const api = file('supabase/functions/platform-api/index.ts');
requireText(api, /authorize_platform_request/, 'REST API must authorize through durable database authority.');
requireText(api, /record_platform_request_outcome/, 'REST API must record usage outcomes.');
if (/KLEENEST_PLATFORM_API_KEYS/.test(api)) throw new Error('Bootstrap environment API-key map must be removed.');

const admin = file('supabase/functions/platform-partner-admin/index.ts');
for (const op of ['set-billing', 'issue-key', 'revoke-key', 'create-webhook', 'disable-webhook', 'summary']) {
  requireText(admin, new RegExp(op), `Partner admin must support ${op}.`);
}

const worker = file('supabase/functions/deliver-platform-webhooks/index.ts');
requireText(worker, /claim_platform_webhook_deliveries/, 'Webhook worker must claim durable deliveries.');
requireText(worker, /Kleenest-Webhook-Signature/, 'Webhook worker must sign partner deliveries.');
requireText(worker, /complete_platform_webhook_delivery/, 'Webhook worker must record delivery outcomes.');

const portal = file('apps/developer-portal/src/App.tsx');
for (const surface of ['API keys', 'Usage', 'Webhooks', 'Integration']) {
  requireText(portal, new RegExp(surface, 'i'), `Developer portal must expose ${surface}.`);
}

console.log('Kleenest partner-platform authority audit passed.');
