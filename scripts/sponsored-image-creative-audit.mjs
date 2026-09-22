import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260922113000_sponsored_ad_image_creatives.sql',import.meta.url),'utf8');
const consumer=fs.readFileSync(new URL('../apps/consumer-mobile/components/SponsoredSlot.tsx',import.meta.url),'utf8');
const consumerService=fs.readFileSync(new URL('../apps/consumer-mobile/services/sponsorship.ts',import.meta.url),'utf8');
const business=fs.readFileSync(new URL('../apps/business-mobile/app/advertising.tsx',import.meta.url),'utf8');
const businessService=fs.readFileSync(new URL('../apps/business-mobile/services/advertising.ts',import.meta.url),'utf8');
const owner=fs.readFileSync(new URL('../apps/platform-mobile/app/relevance.tsx',import.meta.url),'utf8');
const ownerService=fs.readFileSync(new URL('../apps/platform-mobile/services/ownerAdmin.ts',import.meta.url),'utf8');

assert.match(migration,/creative_mode text not null default 'text_only'/);
assert.match(migration,/image_url text/);
assert.match(migration,/image_alt text/);
assert.match(migration,/sponsored-ad-creatives/);
assert.match(migration,/5242880/);
assert.match(migration,/image\/jpeg/);
assert.match(migration,/Image alt text is required/);
assert.match(migration,/'creative_mode',c\.creative_mode/);
assert.match(migration,/'image_url',c\.image_url/);

assert.match(consumer,/import \{ Image,/);
assert.match(consumer,/card\.image_url&&card\.creative_mode!=='text_only'/);
assert.match(consumer,/aspectRatio:16\/9/);
assert.match(consumerService,/creative_mode:'text_only'\|'image_text'\|'image_only'/);

assert.match(business,/Choose & crop image/);
assert.match(business,/Image alt text/);
assert.match(business,/creativeMode/);
assert.match(businessService,/uploadBusinessSponsoredCreative/);
assert.match(businessService,/sponsored-ad-creatives/);

assert.match(owner,/Choose & crop image/);
assert.match(owner,/Image alt text/);
assert.match(ownerService,/uploadOwnerSponsoredCreative/);
assert.match(ownerService,/p_creative_mode/);

console.log('sponsored image creative audit passed');
