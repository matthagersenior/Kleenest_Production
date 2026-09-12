import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const buildRoot = path.join(root, '.platform-build');
const distributionRoot = path.join(root, 'dist', 'platform-distribution');
const packageDirs = ['platform-core','sdk-js','widget','map-layer','route-sdk','webhook-types'];
const platformPackage = JSON.parse(fs.readFileSync(path.join(root,'packages','platform-core','package.json'),'utf8'));
const version = platformPackage.version;
const versionRoot = path.join(distributionRoot, version);
const packagesRoot = path.join(versionRoot, 'packages');
const tarballsRoot = path.join(versionRoot, 'tarballs');
const cdnRoot = path.join(versionRoot, 'cdn');

fs.rmSync(buildRoot, { recursive: true, force: true });
fs.rmSync(distributionRoot, { recursive: true, force: true });
for (const dir of [buildRoot, packagesRoot, tarballsRoot, cdnRoot]) fs.mkdirSync(dir, { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npx, ['tsc','-p','tsconfig.platform-distribution.json'], { stdio: 'inherit' });

function readme(pkgName) {
  const lines = [
    '# ' + pkgName,
    '',
    'Kleenest Platform package v' + version + '.',
    '',
    'Install: npm install ' + pkgName,
    '',
    'This package uses the canonical Kleenest REST recommendation contracts.'
  ];
  if (pkgName === '@kleenest/sdk-js') {
    lines.push('', 'Example:', "import { KleenestClient } from '@kleenest/sdk-js';", "const client = new KleenestClient({ baseUrl: 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api', apiKey: process.env.KLEENEST_API_KEY });");
  }
  if (pkgName === '@kleenest/widget') lines.push('', 'Use mountKleenestFinder() with a configured KleenestClient to render nearby recommendations.');
  if (pkgName === '@kleenest/map-layer') lines.push('', 'Use recommendationsToGeoJSON() to transform recommendation responses into a GeoJSON FeatureCollection.');
  if (pkgName === '@kleenest/route-sdk') lines.push('', 'Use KleenestRouteClient with any transport implementing recommendRoute(); routing-provider choice stays outside Kleenest.');
  if (pkgName === '@kleenest/webhook-types') lines.push('', 'Use verifyKleenestWebhookSignature() to verify HMAC-SHA256 signatures and timestamp tolerance.');
  return lines.join('\n') + '\n';
}

const packed = [];
for (const dir of packageDirs) {
  const sourcePkgPath = path.join(root,'packages',dir,'package.json');
  const pkg = JSON.parse(fs.readFileSync(sourcePkgPath,'utf8'));
  const compiled = path.join(buildRoot,dir,'src');
  if (!fs.existsSync(compiled)) throw new Error('Compiled output missing for ' + pkg.name);

  const outDir = path.join(packagesRoot,dir);
  const outDist = path.join(outDir,'dist');
  fs.mkdirSync(outDist,{recursive:true});
  fs.cpSync(compiled,outDist,{recursive:true});

  const publishPkg = {
    ...pkg,
    private: false,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' } },
    files: ['dist','README.md'],
    sideEffects: false,
    publishConfig: { access: 'public' },
    engines: { node: '>=18' }
  };
  fs.writeFileSync(path.join(outDir,'package.json'),JSON.stringify(publishPkg,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'README.md'),readme(pkg.name));

  const output = execFileSync(npm,['pack',outDir,'--pack-destination',tarballsRoot,'--json'],{encoding:'utf8'});
  const result = JSON.parse(output);
  packed.push({ name: pkg.name, version: pkg.version, filename: result[0]?.filename ?? null });
}

const esbuild = path.join(root,'node_modules','.bin',process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
if (!fs.existsSync(esbuild)) throw new Error('esbuild binary is unavailable after npm install');

const aliases = [
  '--alias:@kleenest/platform-core=./packages/platform-core/src/index.ts',
  '--alias:@kleenest/sdk-js=./packages/sdk-js/src/index.ts'
];
const bundles = [
  ['sdk-js','packages/sdk-js/src/index.ts','kleenest-sdk.js'],
  ['widget','packages/widget/src/index.ts','kleenest-widget.js'],
  ['map-layer','packages/map-layer/src/index.ts','kleenest-map-layer.js'],
  ['route-sdk','packages/route-sdk/src/index.ts','kleenest-route-sdk.js'],
  ['webhook-types','packages/webhook-types/src/index.ts','kleenest-webhook-types.js']
];
for (const bundle of bundles) {
  const entry = bundle[1];
  const filename = bundle[2];
  execFileSync(esbuild,[
    entry,'--bundle','--format=esm','--platform=browser','--target=es2022','--minify',
    ...aliases,'--outfile=' + path.join(cdnRoot,filename)
  ],{stdio:'inherit'});
}

fs.copyFileSync(path.join(root,'docs','platform','openapi-v1.yaml'),path.join(versionRoot,'openapi-v1.yaml'));

const manifest = {
  product: 'Kleenest Platform',
  version,
  generatedAt: new Date().toISOString(),
  apiBaseUrl: 'https://ssgesjzdvdsqacdtasje.supabase.co/functions/v1/platform-api',
  packages: packed,
  browserBundles: bundles.map(item => item[2]),
  openapi: 'openapi-v1.yaml'
};
fs.writeFileSync(path.join(versionRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(distributionRoot,'latest.json'),JSON.stringify({version,path:version+'/'},null,2)+'\n');

for (const file of ['kleenest-sdk.js','kleenest-widget.js','kleenest-map-layer.js','kleenest-route-sdk.js']) {
  const target = path.join(cdnRoot,file);
  if (!fs.existsSync(target) || fs.statSync(target).size < 100) throw new Error('Invalid browser bundle: ' + file);
}
if (packed.some(item => !item.filename)) throw new Error('One or more package tarballs were not created.');

fs.rmSync(buildRoot,{recursive:true,force:true});
console.log(JSON.stringify(manifest,null,2));
