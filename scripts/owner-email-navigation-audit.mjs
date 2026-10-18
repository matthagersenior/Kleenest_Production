import fs from 'node:fs';
import assert from 'node:assert/strict';

const layout=fs.readFileSync(new URL('../apps/platform-mobile/app/_layout.tsx',import.meta.url),'utf8');
const home=fs.readFileSync(new URL('../apps/platform-mobile/app/index.tsx',import.meta.url),'utf8');

const emailTab=layout.split(/\r?\n/).find(line=>line.includes('<Tabs.Screen name="communications" '));
assert.ok(emailTab,'Owner Email must have a declared bottom tab');
assert.match(emailTab,/title:'Email'/,'Owner Email must be labeled Email in the bottom navigation');
assert.doesNotMatch(emailTab,/href\s*:\s*null/,'Owner Email route must not be hidden from the tab bar');
assert.match(home,/href="\/communications"[\s\S]{0,700}Open Email Inbox/,'Owner Home must expose a prominent Open Email Inbox shortcut');

console.log('owner email navigation audit passed');
