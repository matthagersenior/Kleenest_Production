import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const layout=read('apps/consumer-mobile/app/_layout.tsx');
const home=read('apps/consumer-mobile/app/home.tsx');
const social=read('apps/consumer-mobile/app/social.tsx');

assert.match(layout,/initialRouteName=\{Platform\.OS==='web'\?'index':'explore'\}/,'Explore remains the native launch destination.');
for(const token of ['name="explore"','name="qr"','name="home"','name="games"','name="profile"'])assert.match(layout,new RegExp(token));
const order=['name="explore"','name="qr"','name="home"','name="games"','name="profile"'].map(token=>layout.indexOf(token));
assert.ok(order.every((value,index)=>index===0||value>order[index-1]),'Bottom navigation order must be Explore → Check In → Home → Games → Profile.');
assert.match(layout,/name="social" options=\{\{ href:null,title:'Community'/,'Legacy Community route remains hidden from bottom navigation.');

assert.match(social,/Redirect/,'Legacy Community route must redirect.');
assert.match(social,/href=["']\/home["']/,'Legacy Community deep links must land on Home.');

assert.match(home,/type HomeView='feed'\|'people'\|'league'/,'Merged Home must expose Feed, People and League views.');
assert.match(home,/useState<HomeView>\('feed'\)/,'Feed must be the default Home view.');
for(const label of ['Feed','People','League'])assert.match(home,new RegExp(`accessibilityLabel="${label}"`));
assert.match(home,/COMMUNITY PULSE/,'Home Feed must surface Community Pulse directly.');
assert.match(home,/route:'\/saved'/);
assert.match(home,/route:'\/route'/);
assert.match(home,/route:'\/progress'/);
assert.match(home,/route:'\/assistant'/);
assert.doesNotMatch(home,/RelevanceHeroCarousel/,'Merged Home must not retain the old promotional hero carousel.');
assert.doesNotMatch(home,/WHERE DO YOU NEED TO GO\?/,'Merged Home must not duplicate Explore primary discovery UI.');
assert.doesNotMatch(home,/People helping people find better bathrooms\./,'Permanent onboarding-style Community hero copy should be removed.');

console.log('consumer Home + Community information architecture audit passed');
