import fs from 'node:fs';

const packageDirs = ['platform-core','sdk-js','widget','map-layer','route-sdk','webhook-types'];
for (const dir of packageDirs) {
  const path = `packages/${dir}/package.json`;
  if (!fs.existsSync(path)) throw new Error(`Missing package metadata: ${path}`);
  const pkg = JSON.parse(fs.readFileSync(path,'utf8'));
  if (pkg.private === true) throw new Error(`${pkg.name} must be distributable, not private.`);
  if (pkg.main !== 'dist/index.js') throw new Error(`${pkg.name} must publish dist/index.js.`);
  if (pkg.types !== 'dist/index.d.ts') throw new Error(`${pkg.name} must publish dist/index.d.ts.`);
  if (!pkg.exports?.['.']) throw new Error(`${pkg.name} must define an exports map.`);
}

for (const required of [
  'scripts/build-platform-distribution.mjs',
  'tsconfig.platform-distribution.json',
  'docs/platform/openapi-v1.yaml',
  'supabase/functions/platform-assets/index.ts',
  '.github/workflows/platform-distribution.yml',
]) {
  if (!fs.existsSync(required)) throw new Error(`Missing distribution artifact: ${required}`);
}

const openapi = fs.readFileSync('docs/platform/openapi-v1.yaml','utf8');
for (const path of ['/health','/v1/recommendations/nearby','/v1/recommendations/route']) {
  if (!openapi.includes(path+':')) throw new Error(`OpenAPI contract missing ${path}.`);
}

const assets = fs.readFileSync('supabase/functions/platform-assets/index.ts','utf8');
for (const asset of ['kleenest-sdk.js','kleenest-widget.js','kleenest-map-layer.js','kleenest-route-sdk.js','openapi-v1.yaml']) {
  if (!assets.includes(asset)) throw new Error(`Platform assets function must serve ${asset}.`);
}

const workflow = fs.readFileSync('.github/workflows/platform-distribution.yml','utf8');
if (!/actions\/upload-artifact@v4/.test(workflow)) throw new Error('Distribution workflow must upload a versioned artifact.');
if (!/build-platform-distribution/.test(workflow)) throw new Error('Distribution workflow must run the canonical build script.');

console.log('Kleenest platform distribution audit passed.');
