import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPullRequestFeatureMetadata } from './pr-feature-lifecycle-lib.mjs';

const registry={
  states:['legacy-unverified','idea','data','backend','wired','discoverable','usable','persistent','verified','live','internal'],
  enforcement:{afterPullRequest:319},
  features:[{id:'consumer.discovery',status:'legacy-unverified'}]
};

test('requires lifecycle metadata for product-changing PRs after cutoff',()=>{
  const failures=auditPullRequestFeatureMetadata({registry,prNumber:320,body:'',changedFiles:['apps/consumer-mobile/app/explore.tsx']});
  assert.ok(failures.some(x=>x.includes('Feature-ID')));
  assert.ok(failures.some(x=>x.includes('Target-State')));
  assert.ok(failures.some(x=>x.includes('User-Flow')));
  assert.ok(failures.some(x=>x.includes('Verification')));
});

test('rejects claiming live when the registry does not certify live',()=>{
  const body='Feature-ID: consumer.discovery\nTarget-State: live\nUser-Flow: Explore > search > results\nVerification: consumer QA';
  const failures=auditPullRequestFeatureMetadata({registry,prNumber:320,body,changedFiles:['apps/consumer-mobile/app/explore.tsx']});
  assert.ok(failures.some(x=>x.includes('does not match registry status')));
});

test('passes maintenance changes tied to a registered feature without overclaiming',()=>{
  const body='Feature-ID: consumer.discovery\nTarget-State: legacy-unverified\nUser-Flow: Explore > search > results\nVerification: node scripts/consumer-qa-regressions.test.mjs';
  assert.deepEqual(auditPullRequestFeatureMetadata({registry,prNumber:320,body,changedFiles:['apps/consumer-mobile/app/explore.tsx']}),[]);
});

test('requires Target-State to match the checked-in registry state',()=>{
  const body='Feature-ID: consumer.discovery\nTarget-State: wired\nUser-Flow: Explore > search > results\nVerification: consumer QA';
  const failures=auditPullRequestFeatureMetadata({registry,prNumber:320,body,changedFiles:['apps/consumer-mobile/app/explore.tsx']});
  assert.ok(failures.some(x=>x.includes('does not match registry status')));
});

test('ignores docs-only PRs',()=>{
  assert.deepEqual(auditPullRequestFeatureMetadata({registry,prNumber:320,body:'',changedFiles:['docs/README.md']}),[]);
});
