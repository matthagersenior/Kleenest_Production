import fs from 'node:fs';
import path from 'node:path';

const dist=path.resolve('apps/consumer-mobile/dist');
const indexPath=path.resolve('apps/consumer-mobile/dist/index.html');
const manifestSource=path.resolve('public/manifest.webmanifest');
const workerSource=path.resolve('public/sw.js');
const consentSource=path.resolve('public/kleenest-ad-consent.js');
const iconSource=path.resolve('apps/consumer-mobile/assets/app-icon.png');
const icon512Source=path.resolve('public/app-icon-512.svg');
const marketingSource=path.resolve('public/marketing');

function normalizePagesBasePath(value){
  if(value===undefined)return '/Kleenest_Production';
  const trimmed=String(value).trim();
  if(!trimmed||trimmed==='/')return '';
  return `/${trimmed.replace(/^\/+|\/+$/g,'')}`;
}
const pagesBasePath=normalizePagesBasePath(process.env.EXPO_PUBLIC_PAGES_BASE_PATH);
const pagesScope=`${pagesBasePath}/`||'/';
const pagesAsset=name=>`${pagesBasePath}/${name}`;

for(const required of [indexPath,manifestSource,workerSource,consentSource,iconSource,icon512Source,marketingSource]){
  if(!fs.existsSync(required))throw new Error(`Consumer PWA input missing: ${required}`);
}

const manifest=JSON.parse(fs.readFileSync(manifestSource,'utf8'));
manifest.id=pagesScope;
manifest.start_url=`${pagesScope}?app=1`;
manifest.scope=pagesScope;
manifest.icons=(manifest.icons||[]).map(icon=>({...icon,src:pagesAsset(String(icon.src||'').split('/').filter(Boolean).pop()||'')}));
manifest.shortcuts=(manifest.shortcuts||[]).map(shortcut=>{
  const leaf=String(shortcut.url||'').split('/').filter(Boolean).pop()||'';
  return {...shortcut,url:pagesAsset(leaf)};
});
fs.writeFileSync(path.join(dist,'manifest.webmanifest'),JSON.stringify(manifest,null,2)+'\n');
fs.copyFileSync(workerSource,path.join(dist,'sw.js'));
fs.copyFileSync(consentSource,path.join(dist,'kleenest-ad-consent.js'));
fs.copyFileSync(iconSource,path.join(dist,'app-icon.png'));
fs.copyFileSync(icon512Source,path.join(dist,'app-icon-512.svg'));
fs.cpSync(marketingSource,path.join(dist,'marketing'),{recursive:true});

let html=fs.readFileSync(indexPath,'utf8');
const headMarker='<!-- kleenest-consumer-pwa-head -->';
const bodyMarker='<!-- kleenest-consumer-pwa-worker -->';
const adsenseClient=String(process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID||'ca-pub-6958734306376288').trim();

if(!html.includes(headMarker)){
  const pwaHead=`${headMarker}
<meta name="theme-color" content="#173d2b" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="manifest" href="${pagesAsset('manifest.webmanifest')}" />
<link rel="icon" type="image/png" href="${pagesAsset('app-icon.png')}" />
<link rel="apple-touch-icon" href="${pagesAsset('app-icon.png')}" />`;
  if(!html.includes('</head>'))throw new Error('Consumer web export is missing </head>.');
  html=html.replace('</head>',`${pwaHead}\n</head>`);
}

if(adsenseClient&&!/^ca-pub-\d+$/.test(adsenseClient)){
  throw new Error('EXPO_PUBLIC_ADSENSE_CLIENT_ID must use the ca-pub-######## format.');
}

function addAdsenseLoader(file){
  let page=fs.readFileSync(file,'utf8');
  page=page.replace(/<!-- kleenest-consumer-adsense-head -->[\s\S]*?<!-- kleenest-consumer-adsense-head:end -->\s*/g,'');
  page=page.replace(/<script\b(?=[^>]*src=[\"'][^\"']*adsbygoogle\.js[^\"']*[\"'])[^>]*>\s*<\/script>\s*/gi,'');
  if(!page.includes('</head>'))throw new Error('Consumer HTML export is missing </head>: '+file);
  // Do not request Google's ad code until the visitor opts in.
  const adsenseHead='<!-- kleenest-consumer-adsense-head -->\\n'+
    '<script defer src="'+pagesAsset('kleenest-ad-consent.js')+'" data-adsense-client="'+adsenseClient+'"></script>\\n'+
    '<!-- kleenest-consumer-adsense-head:end -->';
  page=page.replace('</head>',adsenseHead+'\n</head>');
  fs.writeFileSync(file,page);
}

function addAdsenseToHtmlPages(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())addAdsenseToHtmlPages(file);
    else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.html'))addAdsenseLoader(file);
  }
}

if(!html.includes(bodyMarker)){
  const worker=`${bodyMarker}
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('${pagesAsset('sw.js')}', { scope: '${pagesScope}' })
      .catch(function (error) { console.warn('Kleenest service worker registration failed.', error); });
  }, { once: true });
}
</script>`;
  if(!html.includes('</body>'))throw new Error('Consumer web export is missing </body>.');
  html=html.replace('</body>',`${worker}\n</body>`);
}

fs.writeFileSync(indexPath,html);

const authCallbackDir=path.join(dist,'profile');
fs.mkdirSync(authCallbackDir,{recursive:true});
fs.writeFileSync(path.join(authCallbackDir,'index.html'),html);
addAdsenseToHtmlPages(dist);

console.log('Prepared installable Kleenest Consumer Web PWA with AdSense on every exported HTML page and a direct /profile/ auth callback.');
