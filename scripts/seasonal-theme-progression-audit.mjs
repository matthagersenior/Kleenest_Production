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
requireText(prefs,'const visibleThemeOptions=KLEENEST_THEME_OPTIONS;','locked seasonal themes remain visible');
requireText(prefs,'Earn it at Level','preferences explains earned theme gate');
requireText(prefs,"seasonal&&!unlocked",'locked seasonal theme choice is disabled');
requireText(progress,'Seasonal themes unlock automatically','progress screen describes live progression unlocks');
requireText(progress,'Gate · Level','progress screen presents current gate');
requireText(owner,'Progression unlocks are live','owner studio reflects live progression');
requireText(owner,'Pause progression unlock','owner can pause seasonal progression');
requireText(owner,'Enable progression unlock','owner can re-enable seasonal progression');

if(process.exitCode) process.exit(process.exitCode);
console.log('Seasonal theme progression contract satisfied.');
