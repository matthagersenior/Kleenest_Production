import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing public-client-token file: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function requireText(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

const migrations = fs.readdirSync('supabase/migrations').filter(name => /platform_publishable_client_tokens/.test(name));
if (migrations.length !== 1) throw new Error('Expected exactly one publishable client-token migration.');
const sql = file(`supabase/migrations/${migrations[0]}`);

for (const column of ['credential_type','allowed_origins','credential_quota_per_minute']) {
  requireText(sql, new RegExp(column), `Publishable credential migration must define ${column}.`);
}
requireText(sql, /platform_api_key_rate_buckets/i, 'Publishable credentials need independent minute buckets.');
for (const fn of [
  'issue_platform_publishable_token',
  'issue_platform_member_publishable_token',
  'authorize_platform_request',
]) {
  requireText(sql, new RegExp(`function public\\.${fn}`, 'i'), `Missing ${fn}.`);
}
requireText(sql, /kln_pub_/i, 'Publishable tokens must use a distinct prefix.');
requireText(sql, /digest\(/i, 'Publishable tokens must be hashed at rest.');
requireText(sql, /origin_required/i, 'Publishable authorization must reject missing Origin.');
requireText(sql, /origin_not_allowed/i, 'Publishable authorization must reject non-allowlisted Origin.');
requireText(sql, /credential_minute_quota_exceeded/i, 'Publishable tokens need independent minute quotas.');

const api = file('supabase/functions/platform-api/index.ts');
requireText(api, /x-kleenest-client-token/i, 'REST API must accept the publishable client-token header.');
requireText(api, /p_origin/i, 'REST API must pass Origin to database authorization.');
requireText(api, /Access-Control-Allow-Origin/i, 'REST API must implement CORS for browser integrations.');
requireText(api, /credential_minute_quota_exceeded/i, 'REST API must map publishable-token quota failures.');

const admin = file('supabase/functions/platform-partner-admin/index.ts');
requireText(admin, /issue-public-token/i, 'Partner admin must issue publishable browser tokens.');
requireText(admin, /issue_platform_member_publishable_token/i, 'External partner members must use scoped publishable-token issuance.');

const sdk = file('packages/sdk-js/src/index.ts');
requireText(sdk, /clientToken/i, 'JavaScript SDK must accept a publishable client token.');
requireText(sdk, /x-kleenest-client-token/i, 'JavaScript SDK must send the publishable client-token header.');

const dist = file('supabase/functions/platform-distribution/index.ts');
requireText(dist, /clientToken/i, 'Browser ESM SDK must accept publishable client tokens.');
requireText(dist, /x-kleenest-client-token/i, 'Browser ESM SDK must send the publishable client-token header.');

const openapi = JSON.parse(file('docs/platform/openapi-v1.json'));
if (!openapi.components?.securitySchemes?.KleenestClientToken) {
  throw new Error('OpenAPI must define KleenestClientToken auth.');
}
for (const path of ['/v1/recommendations/nearby','/v1/recommendations/route']) {
  const security = openapi.paths?.[path]?.post?.security ?? [];
  if (!security.some(entry => Object.hasOwn(entry,'KleenestClientToken'))) {
    throw new Error(`OpenAPI ${path} must allow KleenestClientToken.`);
  }
}

const portal = file('supabase/functions/platform-developer-portal/index.ts');
for (const phrase of ['Browser token','Allowed origin','issue-public-token']) {
  requireText(portal, new RegExp(phrase,'i'), `Developer Portal must expose ${phrase}.`);
}

const quickstart = file('docs/platform/QUICKSTART.md');
requireText(quickstart, /client token/i, 'Quickstart must explain publishable client tokens.');
requireText(quickstart, /never embed.*server.*key/i, 'Quickstart must prohibit embedding server keys in browser code.');

console.log('Kleenest publishable client-token audit passed.');
