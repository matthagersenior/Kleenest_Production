import fs from 'node:fs';
import path from 'node:path';

const dist=path.resolve('apps/consumer-mobile/dist');
const indexPath=path.resolve('apps/consumer-mobile/dist/index.html');
const manifestSource=path.resolve('public/manifest.webmanifest');
const workerSource=path.resolve('public/sw.js');
const iconSource=path.resolve('apps/consumer-mobile/assets/app-icon.png');
const icon512Source=path.resolve('public/app-icon-512.svg');

for(const required of [indexPath,manifestSource,workerSource,iconSource,icon512Source]){
  if(!fs.existsSync(required))throw new Error(`Consumer PWA input missing: ${required}`);
}

fs.copyFileSync(manifestSource,path.join(dist,'manifest.webmanifest'));
fs.copyFileSync(workerSource,path.join(dist,'sw.js'));
fs.copyFileSync(iconSource,path.join(dist,'app-icon.png'));
fs.copyFileSync(icon512Source,path.join(dist,'app-icon-512.svg'));

let html=fs.readFileSync(indexPath,'utf8');
const headMarker='<!-- kleenest-consumer-pwa-head -->';
const bodyMarker='<!-- kleenest-consumer-pwa-worker -->';

if(!html.includes(headMarker)){
  const pwaHead=`${headMarker}
<meta name="theme-color" content="#173d2b" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="manifest" href="/Kleenest_Production/manifest.webmanifest" />
<link rel="icon" type="image/png" href="/Kleenest_Production/app-icon.png" />
<link rel="apple-touch-icon" href="/Kleenest_Production/app-icon.png" />`;
  if(!html.includes('</head>'))throw new Error('Consumer web export is missing </head>.');
  html=html.replace('</head>',`${pwaHead}\n</head>`);
}

if(!html.includes(bodyMarker)){
  const worker=`${bodyMarker}
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/Kleenest_Production/sw.js', { scope: '/Kleenest_Production/' })
      .catch(function (error) { console.warn('Kleenest service worker registration failed.', error); });
  }, { once: true });
}
</script>`;
  if(!html.includes('</body>'))throw new Error('Consumer web export is missing </body>.');
  html=html.replace('</body>',`${worker}\n</body>`);
}

fs.writeFileSync(indexPath,html);
console.log('Prepared installable Kleenest Consumer Web PWA.');
