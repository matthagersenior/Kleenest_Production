import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const seoScript=path.join(root,'scripts/prepare-consumer-web-seo.mjs');
const files=[
  'index.html',
  'about/index.html',
  'for-you/index.html',
  'for-business/index.html',
  'trust/index.html',
  'install/index.html',
  'contact/index.html',
  'support/index.html',
  'privacy/index.html',
  'terms/index.html',
  'community-guidelines/index.html',
  'account-deletion/index.html',
  'developer/index.html',
];

test('every public Kleenest page shares the actual PNG app icon on X and Open Graph',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'kleenest-share-preview-'));
  try{
    const dist=path.join(tmp,'apps/consumer-mobile/dist');
    for(const file of files){
      const target=path.join(dist,file);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,`<!doctype html><html><head><title>Stale</title><meta name="description" content="Stale" /><meta property="og:image" content="https://wrong.example/old.png" /><meta name="twitter:image" content="https://wrong.example/old.png" /></head><body>Public page</body></html>`);
    }
    const encoded=fs.readFileSync(path.join(root,'scripts/app-icon.base64'),'utf8').trim();
    const png=Buffer.from(encoded,'base64');
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16),192);
    assert.equal(png.readUInt32BE(20),192);
    fs.writeFileSync(path.join(dist,'app-icon.png'),png);
    // Re-running publication metadata generation must not duplicate tags.
    for(let run=0;run<2;run++)execFileSync(process.execPath,[seoScript],{cwd:tmp,stdio:'pipe'});
    for(const file of files){
      const html=fs.readFileSync(path.join(dist,file),'utf8');
      const image='https://kleenest.us/app-icon.png';
      const tags=[
        `<meta property="og:image" content="${image}" />`,
        `<meta property="og:image:secure_url" content="${image}" />`,
        '<meta property="og:image:type" content="image/png" />',
        '<meta property="og:image:width" content="192" />',
        '<meta property="og:image:height" content="192" />',
        '<meta property="og:image:alt" content="Kleenest app logo" />',
        '<meta name="twitter:card" content="summary" />',
        `<meta name="twitter:image" content="${image}" />`,
        '<meta name="twitter:image:alt" content="Kleenest app logo" />',
      ];
      for(const tag of tags){
        assert.equal(html.split(tag).length-1,1,`${file}: expected exactly one ${tag}`);
      }
      assert.doesNotMatch(html,/wrong\.example/);
      assert.match(html,/<meta property="og:title" content="[^"]+" \/>/);
      assert.match(html,/<link rel="canonical" href="https:\/\/kleenest\.us\//);
    }
    assert.ok(fs.existsSync(path.join(dist,'sitemap.xml')));
    assert.ok(fs.existsSync(path.join(dist,'robots.txt')));
  }finally{
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});


test('public marketing identifies the founder without exposing their precise hometown',()=>{
  const marketing=fs.readFileSync(path.join(root,'apps/consumer-mobile/components/MarketingSitePro.tsx'),'utf8');
  const entry=fs.readFileSync(path.join(root,'apps/consumer-mobile/components/MarketingSite.tsx'),'utf8');
  const page=fs.readFileSync(path.join(root,'apps/consumer-mobile/app/about.tsx'),'utf8');
  const publisher=fs.readFileSync(path.join(root,'.github/workflows/publish-standalone-installer.yml'),'utf8');
  assert.match(marketing,/export function MarketingAboutPage\(\)/);
  assert.match(marketing,/MEET THE FOUNDER/);
  assert.match(marketing,/Matthew Hager/);
  assert.match(marketing,/St\. Louis-area/);
  assert.doesNotMatch(marketing,/Sparta,? Illinois/i);
  assert.match(marketing,/go\('\/about'\)/);
  assert.match(entry,/MarketingAboutPage/);
  assert.match(page,/MarketingAboutPage/);
  assert.match(publisher,/public_routes="[^"]*\babout\b/);
});
