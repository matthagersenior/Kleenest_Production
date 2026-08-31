import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function requireToken(text,token,label){if(!text.includes(token))throw new Error(`${label} missing ${token}.`)}

const pages=read('.github/workflows/pages.yml');
const vite=read('vite.config.js');
const main=read('src/main.jsx');
const index=read('index.html');
const fallback=read('public/404.html');
const manifest=read('public/manifest.webmanifest');
const serviceWorkerRegistration=read('src/runtime/registerServiceWorker.js');
if(!fs.existsSync('public/.nojekyll'))throw new Error('Static Pages marker public/.nojekyll is missing.');
if(fs.existsSync('.github/workflows/static.yml'))throw new Error('Competing GitHub-generated static Pages workflow must not exist.');

for(const token of ['workflow_dispatch','workflow_run','Production CI','types: [completed]','conclusion == \'success\'','head_branch == \'main\'','github.event.workflow_run.head_sha','actions/configure-pages@v5','actions/upload-pages-artifact@v3','actions/deploy-pages@v4','path: dist'])requireToken(pages,token,'Pages workflow');
requireToken(vite,"base: '/Kleenest_Production/'",'Vite Pages base');
requireToken(main,'BrowserRouter basename="/Kleenest_Production"','Router Pages base');
for(const token of ['kleenest:pages-route','window.history.replaceState','/Kleenest_Production'])requireToken(index,token,'Pages route restoration');
for(const token of ['kleenest:pages-route','window.sessionStorage.setItem','window.location.replace','/Kleenest_Production'])requireToken(fallback,token,'Pages SPA fallback');
for(const token of ['"start_url": "/Kleenest_Production/"','"scope": "/Kleenest_Production/"','"display": "standalone"'])requireToken(manifest,token,'Pages PWA manifest');
for(const token of ["register('/Kleenest_Production/sw.js'","scope:'/Kleenest_Production/'"])requireToken(serviceWorkerRegistration,token,'Pages service worker scope');

console.log('GitHub Pages deployment convergence audit passed.');
