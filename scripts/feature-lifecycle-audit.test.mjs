import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFeatureLifecycle } from './feature-lifecycle-lib.mjs';

const parity={apps:{consumer:{requiredCapabilities:['discovery','new-feature']}}};
const registry={
  version:1,
  states:['legacy-unverified','idea','data','backend','wired','discoverable','usable','persistent','verified','live','internal'],
  grandfatheredUnverified:['consumer.discovery'],
  features:[
    {id:'consumer.discovery',product:'consumer',capability:'discovery',status:'legacy-unverified',kind:'user',gap:'Needs end-to-end certification.'},
    {id:'consumer.new-feature',product:'consumer',capability:'new-feature',status:'live',kind:'user',gap:''}
  ]
};

test('rejects a live feature without complete vertical-slice evidence',()=>{
  const failures=auditFeatureLifecycle({parity,registry,exists:()=>true});
  assert.ok(failures.some(x=>x.includes('consumer.new-feature')&&x.includes('entryPoint')));
  assert.ok(failures.some(x=>x.includes('consumer.new-feature')&&x.includes('automated')));
  assert.ok(failures.some(x=>x.includes('consumer.new-feature')&&x.includes('production')));
});

test('rejects new capabilities hidden behind legacy-unverified',()=>{
  const bad=structuredClone(registry);
  bad.features[1]={id:'consumer.new-feature',product:'consumer',capability:'new-feature',status:'legacy-unverified',kind:'user',gap:'Not checked yet.'};
  const failures=auditFeatureLifecycle({parity,registry:bad,exists:()=>true});
  assert.ok(failures.some(x=>x.includes('consumer.new-feature')&&x.includes('grandfathered')));
});

test('accepts a live feature only with discoverable usable persistent verified evidence',()=>{
  const good=structuredClone(registry);
  good.features[1]={
    id:'consumer.new-feature',product:'consumer',capability:'new-feature',status:'live',kind:'user',gap:'',
    userJourney:{actor:'consumer',entryPoint:'Explore > New feature',successOutcome:'User completes the intended action'},
    evidence:{
      ui:['apps/consumer-mobile/app/new-feature.tsx'],
      logic:['apps/consumer-mobile/services/newFeature.ts'],
      discoverability:['apps/consumer-mobile/app/_layout.tsx'],
      state:{mode:'persistent',proof:['apps/consumer-mobile/services/newFeature.ts']},
      states:['loading','empty','error','success'],
      verification:{automated:['scripts/new-feature-audit.mjs'],production:['Production smoke test documented in PR']}
    }
  };
  const failures=auditFeatureLifecycle({parity,registry:good,exists:()=>true});
  assert.deepEqual(failures,[]);
});


test('live feature requires an understandable value promise and reasonable path to first value',()=>{
  const almost=structuredClone(registry);
  almost.features[1]={
    id:'consumer.new-feature',product:'consumer',capability:'new-feature',status:'live',kind:'user',gap:'',
    userJourney:{actor:'consumer',entryPoint:'Explore > New feature',successOutcome:'User completes the intended action'},
    evidence:{
      ui:['apps/consumer-mobile/app/new-feature.tsx'],
      logic:['apps/consumer-mobile/services/newFeature.ts'],
      discoverability:['apps/consumer-mobile/app/_layout.tsx'],
      state:{mode:'persistent',proof:['apps/consumer-mobile/services/newFeature.ts']},
      states:['loading','empty','error','success'],
      verification:{automated:['scripts/new-feature-audit.mjs'],production:['Production smoke test documented in PR']}
    }
  };
  const failures=auditFeatureLifecycle({parity,registry:almost,exists:()=>true});
  assert.ok(failures.some(x=>x.includes('valuePromise')));
  assert.ok(failures.some(x=>x.includes('primaryAction')));
  assert.ok(failures.some(x=>x.includes('successCue')));
  assert.ok(failures.some(x=>x.includes('firstValueSteps')));
});

test('live feature rejects an unreasonable first-value path',()=>{
  const slow=structuredClone(registry);
  slow.features[1]={
    id:'consumer.new-feature',product:'consumer',capability:'new-feature',status:'live',kind:'user',gap:'',
    userJourney:{
      actor:'consumer',
      entryPoint:'Explore > New feature',
      valuePromise:'Find a useful place you can count on.',
      primaryAction:'Search or choose a nearby result.',
      successOutcome:'User chooses a place.',
      successCue:'The place card clearly shows why it matches.',
      firstValueSteps:8
    },
    evidence:{
      ui:['apps/consumer-mobile/app/new-feature.tsx'],
      logic:['apps/consumer-mobile/services/newFeature.ts'],
      discoverability:['apps/consumer-mobile/app/_layout.tsx'],
      state:{mode:'persistent',proof:['apps/consumer-mobile/services/newFeature.ts']},
      states:['loading','empty','error','success'],
      comprehension:{plainLanguage:['Core value is stated before advanced controls']},
      verification:{automated:['scripts/new-feature-audit.mjs'],production:['Production smoke test documented in PR']}
    }
  };
  const failures=auditFeatureLifecycle({parity,registry:slow,exists:()=>true});
  assert.ok(failures.some(x=>x.includes('firstValueSteps')&&x.includes('7 or fewer')));
});
