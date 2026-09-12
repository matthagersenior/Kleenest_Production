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

const portal = file('supabase/functions/platform-developer-portal/index.ts');
for (const phrase of ['SDK module','Widget module','Map module','Route module','OpenAPI']) {
  if (!new RegExp(phrase,'i').test(portal)) throw new Error(`Developer portal must link ${phrase}.`);
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
