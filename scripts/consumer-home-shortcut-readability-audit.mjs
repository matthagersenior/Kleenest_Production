import fs from 'node:fs';
import assert from 'node:assert/strict';

const home=fs.readFileSync(new URL('../apps/consumer-mobile/app/home.tsx',import.meta.url),'utf8');

assert.doesNotMatch(home,/numberOfLines=\{1\}[^>]*style=\{\[s\.shortcutText/,'Home shortcut titles must not be single-line ellipsized.');
assert.doesNotMatch(home,/numberOfLines=\{1\}[^>]*style=\{\[s\.shortcutDetail/,'Home shortcut details must not be single-line ellipsized.');
assert.match(home,/shortcut:\{[^}]*minHeight:9[0-9]/s,'Home shortcut cards need enough height for wrapped labels.');
assert.match(home,/shortcutArrow:\{[^}]*position:'absolute'/s,'Shortcut chevrons must not consume label width.');
assert.match(home,/shortcutCopy:\{[^}]*paddingRight:/s,'Shortcut copy reserves room for the overlaid chevron.');

console.log('consumer home shortcut readability audit passed');
