import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing distribution file: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const openapi = file('docs/platform/openapi-v1.json');
const spec = JSON.parse(openapi);
if (spec.openapi !== '3.1.0') throw new Error('OpenAPI contract must use 3.1.0.');
for (const path of ['/v1/recommendations/nearby','/v1/recommendations/route']) {
  if (!spec.paths?.[path]?.post) throw new Error(`OpenAPI missing POST ${path}.`);
}
if (!spec.components?.securitySchemes?.KleenestApiKey) throw new Error('OpenAPI must define KleenestApiKey auth.');

const dist = file('supabase/functions/platform-distribution/index.ts');
for (const route of ['/v1/manifest.json','/v1/openapi.json','/v1/sdk.js','/v1/widget.js','/v1/map.js','/v1/route.js']) {
  if (!dist.includes(route)) throw new Error(`Distribution function must serve ${route}.`);
}
if (!/Access-Control-Allow-Origin/i.test(dist)) throw new Error('Distribution assets must be cross-origin consumable.');
if (!/immutable/i.test(dist)) throw new Error('Versioned assets must be cacheable as immutable.');
if (!/publicOrigin/.test(dist) || !/https:\/\//.test(dist)) throw new Error('Distribution manifest must construct public HTTPS URLs.');
if (/apiBaseUrl:\s*url\.origin/.test(dist)) throw new Error('Distribution manifest must not publish the Edge runtime internal origin.');

const portal = file('supabase/functions/platform-developer-portal/index.ts');
for (const phrase of ['SDK module','Widget module','Map module','Route module','OpenAPI']) {
  if (!new RegExp(phrase,'i').test(portal)) throw new Error(`Developer portal must link ${phrase}.`);
}
if (!/db\.storage|storage\.createBucket|storage\.from/.test(portal)) throw new Error('Developer portal must publish its HTML through Supabase Storage.');
if (!/authorize_platform_webhook_worker/.test(portal)) throw new Error('Developer portal publishing must require Vault-backed worker authorization.');
if (!/status:\s*302/.test(portal) || !/location:\s*publicPortalUrl/.test(portal)) throw new Error('Developer portal Edge function must redirect browsers to the static HTML object.');

const migrations = fs.readdirSync('supabase/migrations').filter(name => /platform_developer_portal_publish_trigger/.test(name));
if (migrations.length !== 1) throw new Error('Expected exactly one developer portal publish trigger migration.');
const publishSql = file(`supabase/migrations/${migrations[0]}`);
if (!/trigger_platform_developer_portal_publish/.test(publishSql)) throw new Error('Portal publish trigger function is required.');
if (!/kleenest_platform_webhook_worker_secret/.test(publishSql)) throw new Error('Portal publish trigger must keep the worker credential inside Vault-backed Postgres.');

const smoke = file('supabase/functions/platform-integration-smoke/index.ts');
for (const check of ['distributionManifest','distributionSdk','distributionWidget','distributionMap','distributionRoute','portalRedirect','portalHtml']) {
  if (!smoke.includes(check)) throw new Error(`Live smoke must cover ${check}.`);
}

for (const pkg of ['platform-core','sdk-js','widget','map-layer','route-sdk']) {
  const path = `packages/${pkg}/package.json`;
  const parsed = JSON.parse(file(path));
  if (parsed.private === true) throw new Error(`${parsed.name} must be packable/distributable.`);
  if (parsed.version !== '0.1.0') throw new Error(`${parsed.name} version must be 0.1.0 for v1 beta distribution.`);
  if (!parsed.scripts?.build) throw new Error(`${parsed.name} must expose a build script.`);
  if (!parsed.files?.includes('dist')) throw new Error(`${parsed.name} must publish only dist artifacts.`);
  if (!parsed.exports?.['.']) throw new Error(`${parsed.name} must define package exports.`);
}

const workflow = file('.github/workflows/platform-package-build.yml');
if (!/upload-artifact@v4/.test(workflow)) throw new Error('Package build workflow must retain downloadable artifacts.');
for (const pkg of ['platform-core','sdk-js','widget','map-layer','route-sdk']) {
  if (!workflow.includes(pkg)) throw new Error(`Package build workflow must include ${pkg}.`);
}

console.log('Kleenest distribution v1 audit passed.');
