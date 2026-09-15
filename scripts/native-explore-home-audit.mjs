import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const index = read('apps/consumer-mobile/app/index.tsx');
const layout = read('apps/consumer-mobile/app/_layout.tsx');
const explore = read('apps/consumer-mobile/features/AdaptiveExploreScreen.tsx');

assert.match(index, /Redirect/);
assert.match(index, /href=["']\/explore["']/);
assert.match(layout, /initialRouteName=\{Platform\.OS==='web'\?'index':'explore'\}/);
assert.match(layout, /name="index" options=\{\{[^}]*href:null/s);

assert.doesNotMatch(explore, /Find a trusted bathroom\./);
assert.match(explore, /useWindowDimensions/);
assert.match(explore, /height:\s*Math\.max\(440,\s*windowHeight\s*-\s*96\)/);
assert.match(explore, /searchPanel:\s*\{[^}]*position:\s*'absolute'/s);
assert.match(explore, /mapSection:\s*\{[^}]*paddingHorizontal:\s*0/s);
assert.match(explore, /void load\(\{ preserveCacheOnEmpty: true \}\)/);
assert.match(explore, /getLastKnownPositionAsync/);
assert.match(explore, /onRegionDidChange/);
assert.match(explore, /Search this area/);
assert.match(explore, /Swipe up for results/);

console.log('native explore-home contract: PASS');
