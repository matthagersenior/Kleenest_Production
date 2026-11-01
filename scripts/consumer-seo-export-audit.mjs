import fs from 'node:fs';
import path from 'node:path';

const dist=path.resolve('apps/consumer-mobile/dist');
const read=relative=>fs.readFileSync(path.join(dist,relative),'utf8');
const requireFile=relative=>{
  if(!fs.existsSync(path.join(dist,relative)))throw new Error('Missing SEO output: '+relative);
};
for(const route of ['explore','qr','home','games']){
  requireFile(route+'/index.html');
  if(!read(route+'/index.html').includes('</html>'))throw new Error('Invalid app route HTML: '+route);
}
const home=read('index.html');
for(const route of ['about','for-you','for-business','trust','install','contact']){
  requireFile(route+'/index.html');
  if(!home.includes('href="/'+route+'/"'))throw new Error('Missing crawlable homepage link: '+route);
  if(!read(route+'/index.html').includes('https://kleenest.us/'+route+'/'))throw new Error('Missing canonical metadata: '+route);
}
requireFile('kleenest-ad-consent.js');
if(!home.includes('kleenest-ad-consent.js'))throw new Error('Consent controller not loaded on homepage');
if(home.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'))throw new Error('AdSense must not load before visitor choice');
// Ensure the public landing page provides real, crawlable value without JS.
for(const phrase of ['id="kleenest-public-guide"','How to find a restroom','What cleanliness and freshness signals mean','Do I have to register?','Does Kleenest guarantee restroom access?']){
  if(!home.includes(phrase))throw new Error('Missing substantive public homepage content: '+phrase);
}
for(const route of ['explore','qr','home','games']){
  if(read(route+'/index.html').includes('kleenest-public-guide'))throw new Error('Public guide leaked into app shell: '+route);
}
const sitemap=read('sitemap.xml');
for(const route of ['about','for-you','for-business','trust','install','contact']){
  if(!sitemap.includes('<loc>https://kleenest.us/'+route+'/</loc>'))throw new Error('Missing sitemap URL: '+route);
}
const headers=read('_headers');
for(const header of ['X-Content-Type-Options: nosniff','Referrer-Policy: strict-origin-when-cross-origin','Strict-Transport-Security: max-age=31536000']){
  if(!headers.includes(header))throw new Error('Missing response header declaration: '+header);
}
console.log('SEO export regression audit passed.');
