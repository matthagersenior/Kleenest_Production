import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function requireText(haystack,needle,label){
  if(!haystack.includes(needle)){
    console.error('FAIL:',label,'missing',JSON.stringify(needle));
    process.exitCode=1;
  }else console.log('PASS:',label);
}

const migration=read('supabase/migrations/20260915154500_enable_seasonal_theme_progression.sql');
const prefs=read('apps/consumer-mobile/app/preferences.tsx');
const progress=read('apps/consumer-mobile/app/progress.tsx');
const owner=read('apps/platform-mobile/app/progression.tsx');

for(const code of ['theme_fall_2026','theme_halloween_2026','theme_thanksgiving_2026','theme_christmas_2026']){
  requireText(migration,code,'migration covers '+code);
}
requireText(migration,'owner_only=false','seasonal rewards are not owner-only');
requireText(migration,'progression_unlock_enabled=true','seasonal rewards unlock through progression');
requireText(migration,'internal.award_progression_theme_rewards','eligible themes are persisted as earned rewards');
requireText(migration,"'progression'",'earned reward grants record progression as their source');
requireText(migration,'progression_earned','consumer reward state distinguishes earned progression access');
requireText(prefs,'const visibleThemeOptions=KLEENEST_THEME_OPTIONS;','locked seasonal themes remain visible');
requireText(prefs,'Earn it at Level','preferences explains earned theme gate');
requireText(prefs,"rewardTheme&&!unlocked",'locked reward theme choice is disabled');
requireText(progress,'REWARD LOCKER','progress screen exposes the live reward inventory');
requireText(progress,'rewardRequirementText','progress screen presents live reward gates');
requireText(owner,'Progression unlocks are live','owner studio reflects live progression');
requireText(owner,'Pause progression unlock','owner can pause seasonal progression');
requireText(owner,'Enable progression unlock','owner can re-enable seasonal progression');

if(process.exitCode) process.exit(process.exitCode);
console.log('Seasonal theme progression contract satisfied.');
