import fs from 'node:fs';

const failures=[];
const read=p=>fs.readFileSync(p,'utf8');
const progress=read('apps/consumer-mobile/app/progress.tsx');
const social=read('apps/consumer-mobile/app/social.tsx');
const service=read('apps/consumer-mobile/services/discoveryProgression.ts');
const meta=read('apps/consumer-mobile/services/engagementMetaGame.ts');
const migrations=fs.readdirSync('supabase/migrations').sort().map(n=>read('supabase/migrations/'+n)).join('\n');

const expect=(value,pattern,label)=>{if(!pattern.test(value))failures.push(label);};
expect(migrations,/create table if not exists public\.progression_seasons/i,'Progression World requires canonical seasons.');
expect(migrations,/create table if not exists public\.progression_badge_collections/i,'Progression World requires badge collections.');
expect(migrations,/freshness_run_2026/i,'Season 01: The Freshness Run must exist in source control.');
expect(migrations,/create or replace function public\.consumer_progression_world\(\)/i,'Progression World requires a consumer read RPC.');
expect(migrations,/community_target/i,'Campaigns must support community-wide meters.');
expect(migrations,/chapters/i,'Journeys/seasons must support chaptered progression.');
expect(migrations,/catalog_hidden/i,'Legacy/duplicate badge cleanup must remain explicit.');
expect(migrations,/status='completed'.*ends_at<now\(\)/is,'Expired active legacy contests must be retired instead of lingering active.');
expect(service,/getProgressionWorld\(\)/,'Consumer service must expose Progression World.');
expect(progress,/getProgressionWorld/,'Progress screen must load Progression World.');
for(const token of ['SEASON 01','THE FRESHNESS RUN','NEXT REVEAL','CHAPTERS','COMMUNITY METER','BADGE COLLECTIONS','PRIZE LADDER','RIVAL LADDER'])if(!progress.includes(token))failures.push('Progress screen missing '+token+' presentation.');
expect(progress,/ObjectiveWorldCard/,'Objectives must use distinct world-aware presentation instead of only generic XP cards.');
for(const kind of ['quest','mission','challenge','journey','campaign','contest'])if(!progress.includes("kind==='"+kind+"'"))failures.push('Progress screen must differentiate '+kind+' mechanics.');
expect(social,/SEASON RIVALS/,'Community must surface seasonal competition and rivals.');
expect(meta,/ENGAGEMENT_SPONSOR_SURFACES=\['game_center','progress','community'\]/,'Sponsor eligibility must remain limited to engagement surfaces.');
if(failures.length){console.error('Progression World engagement audit failed:');failures.forEach(f=>console.error('- '+f));process.exit(1)}
console.log('Progression World engagement audit passed: seasons, chapters, collections, community goals, contests and rivals are distinct and canonical.');