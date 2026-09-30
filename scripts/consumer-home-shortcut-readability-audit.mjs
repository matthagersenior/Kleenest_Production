import fs from 'node:fs';
import assert from 'node:assert/strict';

const home=fs.readFileSync(new URL('../apps/consumer-mobile/app/home.tsx',import.meta.url),'utf8');

assert.match(home,/const homeActions=\[/,'Home must keep a compact quick-action layer.');
for(const label of ['Saved','Routes','Progress','Kleenest AI','Add place','Messages'])assert.match(home,new RegExp(`label:['"]${label}['"]`));
assert.match(home,/quickAction:\{[^}]*minHeight:46/s,'Home quick actions must remain compact but comfortably tappable.');
assert.match(home,/quickAction:\{[^}]*width:'48%'/s,'Home quick actions must use a dense two-column layout.');
assert.doesNotMatch(home,/shortcut:\{/,'Legacy large shortcut cards must not return.');
assert.doesNotMatch(home,/shortcutDetail/,'Quick actions should not spend vertical space on permanent explanatory copy.');

console.log('consumer Home quick-action readability audit passed');
