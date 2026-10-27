import fs from 'node:fs';
import path from 'node:path';

const dist=path.resolve('apps/consumer-mobile/dist');
const ORIGIN='https://kleenest.us';
const SHARE_IMAGE_URL=`${ORIGIN}/app-icon.png`;

const pages=[
  {route:'/',file:'index.html',title:'Kleenest | Clean Restroom Finder You Can Trust',description:'Find clean, accessible restrooms with fresh community evidence, trusted amenities, routing, and verified location details from Kleenest.'},
  {route:'/about/',file:'about/index.html',title:'About Kleenest | Matthew Hager, Founder',description:'Meet Matthew Hager, founder of Kleenest, a St. Louis-area restroom discovery project built around a basic public need.'},
  {route:'/for-you/',file:'for-you/index.html',title:'Kleenest for You | Find Clean Restrooms Nearby',description:'Use Kleenest to find clean restrooms nearby, compare freshness and amenities, build routes, and make restroom stops with more confidence.'},
  {route:'/for-business/',file:'for-business/index.html',title:'Kleenest for Business | Restroom Trust and Visibility',description:'Help customers understand restroom access, amenities, freshness, and trust signals with Kleenest business tools.'},
  {route:'/trust/',file:'trust/index.html',title:'Kleenest Trust + Freshness | Better Restroom Information',description:'Learn how Kleenest combines freshness, verification, community evidence, and amenity details to make restroom information more useful.'},
  {route:'/install/',file:'install/index.html',title:'Install Kleenest | Clean Restroom Finder',description:'Install Kleenest on Android or the web and get fast access to trusted restroom discovery, routing, amenities, and community freshness.'},
  {route:'/contact/',file:'contact/index.html',title:'Contact Kleenest | Help, Support, Information and Feedback',description:'Official Kleenest contact addresses for support, general information, feedback, business, fleet and privacy.'},
  {route:'/support/',file:'support/index.html',title:'Kleenest Support | Help, Contact, Privacy and Account Control',description:'Get official Kleenest support, contact information, privacy resources, account controls, and help with the Kleenest app and services.'},
  {route:'/privacy/',file:'privacy/index.html',title:'Kleenest Privacy Policy',description:'Read the Kleenest Privacy Policy and learn how account, location, community, support, and service information is handled.'},
  {route:'/terms/',file:'terms/index.html',title:'Kleenest Terms of Use',description:'Read the Kleenest Terms of Use for consumer, community, business, fleet, and platform services.'},
  {route:'/community-guidelines/',file:'community-guidelines/index.html',title:'Kleenest Community Guidelines',description:'Read the Kleenest Community Guidelines for truthful, safe, respectful restroom reviews, photos, profiles, and community contributions.'},
  {route:'/account-deletion/',file:'account-deletion/index.html',title:'Delete a Kleenest Account | Account Control',description:'Official instructions for requesting deletion of a Kleenest consumer account and understanding the account-deletion process.'},
  {route:'/developer/',file:'developer/index.html',title:'Kleenest Developer Portal',description:'Build with Kleenest restroom discovery, map, route, webhook, widget, deep-link, and AI platform capabilities.'},
];

function escapeAttr(value){
  return String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function canonical(route){
  return new URL(route,ORIGIN).toString();
}

function seoBlock(page){
  const url=canonical(page.route);
  const structured={
    '@context':'https://schema.org',
    '@graph':[
      {
        '@type':'Organization',
        '@id':`${ORIGIN}/#organization`,
        name:'Kleenest',
        url:`${ORIGIN}/`,
        founder:{'@id':`${ORIGIN}/about/#founder`},
        contactPoint:{'@type':'ContactPoint',url:`${ORIGIN}/contact/`,email:'support@kleenest.us',contactType:'customer support'},
        description:'Kleenest helps people find clean restrooms with freshness, trust, amenity, routing, and community evidence.'
      },
      {
        '@type':'Person',
        '@id':`${ORIGIN}/about/#founder`,
        name:'Matthew Hager',
        jobTitle:'Founder',
        worksFor:{'@id':`${ORIGIN}/#organization`},
        url:`${ORIGIN}/about/`
      },
      {
        '@type':'WebSite',
        '@id':`${ORIGIN}/#website`,
        url:`${ORIGIN}/`,
        name:'Kleenest',
        publisher:{'@id':`${ORIGIN}/#organization`}
      },
      {
        '@type':'WebPage',
        '@id':`${url}#webpage`,
        url,
        name:page.title,
        description:page.description,
        isPartOf:{'@id':`${ORIGIN}/#website`},
        about:{'@id':`${ORIGIN}/#organization`}
      }
    ]
  };
  return `<!-- kleenest-public-seo:start -->
<meta name="description" content="${escapeAttr(page.description)}" />
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
<meta name="googlebot" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Kleenest" />
<meta property="og:title" content="${escapeAttr(page.title)}" />
<meta property="og:description" content="${escapeAttr(page.description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${SHARE_IMAGE_URL}" />
<meta property="og:image:secure_url" content="${SHARE_IMAGE_URL}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="192" />
<meta property="og:image:height" content="192" />
<meta property="og:image:alt" content="Kleenest app logo" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${escapeAttr(page.title)}" />
<meta name="twitter:description" content="${escapeAttr(page.description)}" />
<meta name="twitter:image" content="${SHARE_IMAGE_URL}" />
<meta name="twitter:image:alt" content="Kleenest app logo" />
<script type="application/ld+json">${JSON.stringify(structured)}</script>
<!-- kleenest-public-seo:end -->`;
}

function applySeo(file,page){
  if(!fs.existsSync(file))throw new Error(`SEO target missing: ${file}`);
  let html=fs.readFileSync(file,'utf8');
  html=html.replace(/<!-- kleenest-public-seo:start -->[\s\S]*?<!-- kleenest-public-seo:end -->\s*/g,'');
  html=html.replace(/<meta\s+name=["']description["'][^>]*>\s*/gi,'');
  html=html.replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi,'');
  html=html.replace(/<meta\s+name=["']googlebot["'][^>]*>\s*/gi,'');
  html=html.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi,'');
  html=html.replace(/<meta\s+property=["']og:(?:type|site_name|title|description|url|image(?::(?:secure_url|type|width|height|alt))?)["'][^>]*>\s*/gi,'');
  html=html.replace(/<meta\s+name=["']twitter:(?:card|title|description|image(?::alt)?)["'][^>]*>\s*/gi,'');
  if(/<title>[\s\S]*?<\/title>/i.test(html))html=html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${escapeAttr(page.title)}</title>`);
  else html=html.replace(/<head([^>]*)>/i,`<head$1><title>${escapeAttr(page.title)}</title>`);
  if(!/<\/head>/i.test(html))throw new Error(`SEO target lacks </head>: ${file}`);
  html=html.replace(/<\/head>/i,`${seoBlock(page)}\n</head>`);
  // DailyLaunch checks the original HTML, not content injected by client-side JavaScript.
  if(page.route==='/'){
    const badge='<footer id="dailylaunch-badge" style="background:#0A291C;padding:20px;text-align:center"><a href="https://dailylaunch.io/" target="_blank" rel="noopener"><img src="https://dailylaunch.io/badge/light.svg?v=a6cc2b9b" alt="Featured on DailyLaunch" width="200" height="54" loading="lazy" /></a></footer>';
    html=html.replace(/<footer id="dailylaunch-badge"[\\s\\S]*?<\\/footer>/g,'');
    if(!/<\\/body>/i.test(html))throw new Error('DailyLaunch badge target lacks </body>');
    html=html.replace(/<\\/body>/i,`${badge}\\n</body>`);
  }
  fs.writeFileSync(file,html);
}

const shareImageFile=path.join(dist,'app-icon.png');
if(!fs.existsSync(shareImageFile)||fs.statSync(shareImageFile).size<100){
  throw new Error('Public Kleenest share image is missing or empty: app-icon.png');
}

for(const page of pages)applySeo(path.join(dist,page.file),page);

const sitemap=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page=>`  <url><loc>${canonical(page.route)}</loc></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(dist,'sitemap.xml'),sitemap);

const robots=`User-agent: *
Allow: /
Disallow: /owner/
Disallow: /business/
Disallow: /fleet/
Disallow: /profile/
Disallow: /home/
Disallow: /route/
Disallow: /explore/
Disallow: /Kleenest-Consumer.apk
Sitemap: ${ORIGIN}/sitemap.xml
`;
fs.writeFileSync(path.join(dist,'robots.txt'),robots);

console.log(`Prepared Kleenest public SEO metadata for ${pages.length} canonical pages at ${ORIGIN}.`);
