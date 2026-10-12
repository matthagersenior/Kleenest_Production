import test from 'node:test';
import assert from 'node:assert/strict';
import {safeLink,textParts} from './message-links.mjs';
test('Reddit bracketed links and query strings remain clickable',()=>{
  const parts=textParts('[https://reddit.com/a?x=1&y=2]');
  assert.equal(parts[1].href,'https://reddit.com/a?x=1&y=2');
  assert.equal(parts.map(p=>p.text).join(''),'[https://reddit.com/a?x=1&y=2]');
});
test('sentence punctuation stays outside the URL',()=>{
  const parts=textParts('Visit https://reddit.com.');
  assert.equal(parts[1].href,'https://reddit.com/');
  assert.equal(parts[2].text,'.');
});
test('active content and relative destinations are rejected',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','/relative']) assert.equal(safeLink(url),null);
  assert.equal(safeLink('mailto:support@kleenest.us'),'mailto:support@kleenest.us');
});
