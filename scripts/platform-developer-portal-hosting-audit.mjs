import fs from 'node:fs';

function file(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing developer-portal hosting file: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const html = file('apps/developer-portal/static/index.html');
for (const phrase of [
  'Kleenest Developer Portal',
  'Claim invite',
  'My partner workspaces',
  'Browser token',
  'Allowed origin',
  'issue-public-token',
  'SDK module',
  'OpenAPI',
  'Get your first result',
  'Launch sandbox',
  'API Playground',
  'Sample gallery',
  'Where will this run?',
  'Use in my workspace',
]) {
  if (!html.includes(phrase)) throw new Error(`Static developer portal missing: ${phrase}`);
}
if (!/Content-Security-Policy/i.test(html)) throw new Error('Static portal must include a CSP.');
if (!/connect-src[^;]*ssgesjzdvdsqacdtasje\.supabase\.co/i.test(html)) {
  throw new Error('Static portal CSP must allow the Kleenest Supabase backend.');
}
if (!/location\.origin\+location\.pathname\+'#invite='/.test(html)) {
  throw new Error('Invite links must preserve the static host and keep invite tokens in the URL fragment.');
}
if (!/allowedOrigins:\s*\[location\.origin\]/.test(html)) {
  throw new Error('Portal sandbox must bind its publishable token to the exact portal origin.');
}
if (!/Date\.now\(\)\s*\+\s*60\s*\*\s*60\s*\*\s*1000/.test(html)) {
  throw new Error('Portal sandbox must expire after one hour.');
}
if (!/x-kleenest-client-token/i.test(html) || !/runPlayground/.test(html)) {
  throw new Error('Live API Playground must execute with the browser-safe Kleenest client token.');
}
if (!/renderPlaygroundMap/.test(html)) {
  throw new Error('Playground must render a visual result surface.');
}
if (/sessionStorage\.setItem\([^)]*sandbox/i.test(html)) {
  throw new Error('Raw sandbox tokens must remain memory-only and must not be persisted in sessionStorage.');
}
if (/storage\/v1\/object\/public\/platform-public\/developer-portal/i.test(html)) {
  throw new Error('Portal must not depend on Supabase Storage HTML hosting.');
}

const ownerApp = file('apps/platform-mobile/app/developers.tsx');
for (const phrase of ['Launch Demo Workspace', 'Open Developer Portal', 'Developer experience']) {
  if (!ownerApp.includes(phrase)) throw new Error(`KleenestOS developer controls missing: ${phrase}`);
}

const workflow = file('.github/workflows/platform-developer-portal-pages.yml');
for (const phrase of [
  'pull_request:',
  'actions/configure-pages@v5',
  "github.event_name != 'pull_request'",
  'actions/upload-pages-artifact@v4',
  'actions/deploy-pages@v4',
  'pages: write',
  'id-token: write',
]) {
  if (!workflow.includes(phrase)) throw new Error(`Pages workflow missing: ${phrase}`);
}
if (!/apps\/developer-portal\/static\/index\.html/.test(workflow)) {
  throw new Error('Pages workflow must publish the canonical static developer portal.');
}
if (!/_site\/developer\/index\.html/.test(workflow)) {
  throw new Error('Pages workflow must publish the portal at /developer/.');
}
const edgePortal = file('supabase/functions/platform-developer-portal/index.ts');
if (!/github\.io\/Kleenest_Production\/developer\//.test(edgePortal)) {
  throw new Error('Supabase compatibility redirect must target the GitHub Pages /developer/ portal.');
}

console.log('Kleenest Developer Portal hosting and developer experience audit passed.');