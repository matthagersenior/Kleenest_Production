import fs from 'node:fs';
import path from 'node:path';

const dist=path.resolve('apps/consumer-mobile/dist');
const indexPath=path.resolve('apps/consumer-mobile/dist/index.html');
const manifestSource=path.resolve('public/manifest.webmanifest');
const workerSource=path.resolve('public/sw.js');
const iconSource=path.resolve('apps/consumer-mobile/assets/app-icon.png');
const icon512Source=path.resolve('public/app-icon-512.svg');

function normalizePagesBasePath(value){
  if(value===undefined)return '/Kleenest_Production';
  const trimmed=String(value).trim();
  if(!trimmed||trimmed==='/')return '';
  return `/${trimmed.replace(/^\/+|\/+$/g,'')}`;
}
const pagesBasePath=normalizePagesBasePath(process.env.EXPO_PUBLIC_PAGES_BASE_PATH);
const pagesScope=`${pagesBasePath}/`||'/';
const pagesAsset=name=>`${pagesBasePath}/${name}`;

for(const required of [indexPath,manifestSource,workerSource,iconSource,icon512Source]){
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
fs.copyFileSync(iconSource,path.join(dist,'app-icon.png'));
fs.copyFileSync(icon512Source,path.join(dist,'app-icon-512.svg'));

let html=fs.readFileSync(indexPath,'utf8');
const headMarker='<!-- kleenest-consumer-pwa-head -->';
const bodyMarker='<!-- kleenest-consumer-pwa-worker -->';
const adsenseMarker='<!-- kleenest-consumer-adsense-head -->';
const adsenseClient=String(process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID||'ca-pub-6958734306376288').trim();
const publicOrigin=String(process.env.KLEENEST_PUBLIC_ORIGIN||'https://kleenest.us').trim().replace(/\/+$/,'');
const publicSeo={
  '':{
    title:'Kleenest | Find clean restrooms you can trust',
    description:'Kleenest helps you find nearby restrooms using fresh reviews, trusted community evidence, amenities, routes and real-world verification.'
  },
  'for-you':{
    title:'Kleenest for You | Restroom discovery, routes and rewards',
    description:'Find nearby restrooms, compare fresh trust signals and amenities, plan routes, save useful stops and contribute current restroom information with Kleenest.'
  },
  'for-business':{
    title:'Kleenest for Business | Restroom trust and operations',
    description:'Kleenest helps businesses understand restroom experience, respond to fresh community evidence and improve customer trust with practical operational tools.'
  },
  'trust':{
    title:'How Kleenest Trust Works | Fresh restroom evidence',
    description:'Learn how Kleenest uses freshness, repeated verification, community evidence and contradiction signals to make restroom information more useful.'
  },
  'install':{
    title:'Install Kleenest | Web and Android',
    description:'Install Kleenest to find nearby restrooms, compare trusted details, plan stops and keep useful restroom information close at hand.'
  },
  'support':{
    title:'Kleenest Support & Contact',
    description:'Contact Kleenest support, get help with your account or app experience, and access privacy, safety and account-control resources.'
  }
};

function escapeHtml(value){
  return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function canonicalFor(route){
  return route?\`${publicOrigin}/${route}/\`:\`${publicOrigin}/\`;
}
function withPublicSeo(source,route,meta){
  const canonical=canonicalFor(route);
  const markerStart='<!-- kleenest-public-seo-start -->';
  const markerEnd='<!-- kleenest-public-seo-end -->';
  const structured=JSON.stringify({
    '@context':'https://schema.org',
    '@type':route==='support'?'ContactPage':'WebApplication',
    name:'Kleenest',
    url:canonical,
    description:meta.description,
    ...(route==='support'?{}:{applicationCategory:'TravelApplication',operatingSystem:'Web, Android, iOS'})
  });
  const block=\`${markerStart}
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:site_name" content="Kleenest" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(meta.title)}" />
<meta property="og:description" content="${escapeHtml(meta.description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeHtml(meta.title)}" />
<meta name="twitter:description" content="${escapeHtml(meta.description)}" />
<script type="application/ld+json">${structured}</script>
${markerEnd}\`;
  let next=source.replace(new RegExp(\`${markerStart}[\\s\\S]*?${markerEnd}\\n?\`,'g'),'');
  next=next.replace(/<title>[\\s\\S]*?<\\/title>/i,\`<title>${escapeHtml(meta.title)}</title>\`);
  if(/<meta\\s+name=["']description["'][^>]*>/i.test(next)){
    next=next.replace(/<meta\\s+name=["']description["'][^>]*>/i,\`<meta name="description" content="${escapeHtml(meta.description)}" />\`);
  }else{
    next=next.replace('</head>',\`<meta name="description" content="${escapeHtml(meta.description)}" />\\n</head>\`);
  }
  if(!next.includes('</head>'))throw new Error('Consumer web export is missing </head> for public SEO.');
  return next.replace('</head>',\`${block}\\n</head>\`);
}


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

if(adsenseClient&&!html.includes(adsenseMarker)){
  if(!/^ca-pub-\d+$/.test(adsenseClient))throw new Error('EXPO_PUBLIC_ADSENSE_CLIENT_ID must use the ca-pub-######## format.');
  const adsenseHead=`${adsenseMarker}
<script id="kleenest-adsense-loader" async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}"></script>`;
  if(!html.includes('</head>'))throw new Error('Consumer web export is missing </head>.');
  html=html.replace('</head>',`${adsenseHead}\n</head>`);
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

const rootHtml=withPublicSeo(html,'',publicSeo['']);
fs.writeFileSync(indexPath,rootHtml);

for(const [route,meta] of Object.entries(publicSeo)){
  if(!route)continue;
  const routeDir=path.join(dist,route);
  fs.mkdirSync(routeDir,{recursive:true});
  fs.writeFileSync(path.join(routeDir,'index.html'),withPublicSeo(rootHtml,route,meta));
}

const authCallbackDir=path.join(dist,'profile');
fs.mkdirSync(authCallbackDir,{recursive:true});
const authHtml=rootHtml.replace('</head>','<meta name="robots" content="noindex,nofollow" />\\n</head>');
fs.writeFileSync(path.join(authCallbackDir,'index.html'),authHtml);

const sitemapUrls=[
  ...Object.keys(publicSeo).map(route=>canonicalFor(route)),
  \`${publicOrigin}/legal/privacy.html\`,
  \`${publicOrigin}/legal/terms.html\`,
  \`${publicOrigin}/legal/account-deletion.html\`,
  \`${publicOrigin}/legal/community-guidelines.html\`,
];
const sitemap=\`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url=>\`  <url><loc>${escapeHtml(url)}</loc></url>\`).join('\\n')}
</urlset>
\`;
fs.writeFileSync(path.join(dist,'sitemap.xml'),sitemap);
fs.writeFileSync(path.join(dist,'robots.txt'),\`User-agent: *
Allow: /
Disallow: /profile/
Disallow: /owner/
Disallow: /business/
Disallow: /fleet/
Disallow: /developer/
Sitemap: ${publicOrigin}/sitemap.xml
\`);

console.log('Prepared installable Kleenest Consumer Web PWA with kleenest.us public SEO, sitemap, robots policy, and direct /profile/ auth callback.');
