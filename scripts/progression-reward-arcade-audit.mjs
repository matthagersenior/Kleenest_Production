import fs from 'node:fs';

const files={
 theme:fs.readFileSync('packages/mobile-core/src/theme.ts','utf8'),
 prefs:fs.readFileSync('apps/consumer-mobile/app/preferences.tsx','utf8'),
 progress:fs.readFileSync('apps/consumer-mobile/app/progress.tsx','utf8'),
 modes:fs.readFileSync('apps/consumer-mobile/services/gameModes.ts','utf8'),
 arena:fs.readFileSync('apps/consumer-mobile/app/game/[code].tsx','utf8'),
 ownerMigration:fs.readFileSync('supabase/migrations/20260915154500_enable_seasonal_theme_progression.sql','utf8'),
};

const requiredThemes=[
 'clean-slate','midnight-transit','neon-city','trailblazer','founders','verified-gold',
 'civic-atlas','road-warrior','community-builder','data-guardian','spring-renewal','summer-roadtrip',
 'stl-edition','chicago-edition'
];
for(const value of requiredThemes){
 if(!files.theme.includes(`'${value}'`)) throw new Error(`Missing theme mode ${value}`);
 if(!files.prefs.includes(value)) throw new Error(`Preferences does not expose ${value}`);
}

for(const token of [
 'profile_frame','profile_background','map_flair','checkin_animation','reaction_pack','collection_slot',
 'mission_reroll','quest_slot','streak_shield','map_filter','community_challenge','community_vote',
 'beta_access','stats_pack','verification_privilege'
]){
 if(!files.ownerMigration.includes(token)) throw new Error(`Reward catalog missing ${token}`);
}

for(const game of ['freshness_flow','signal_stack','trust_tower','route_rush']){
 if(!files.modes.includes(game)) throw new Error(`Missing advanced game ${game}`);
}
for(const mode of ['flow_builder','stack_sort','tower_defense','route_rush']){
 if(!files.modes.includes(`'${mode}'`)) throw new Error(`Missing advanced game mode ${mode}`);
 if(!files.arena.includes(`game.mode==='${mode}'`)) throw new Error(`Arena does not render mode ${mode}`);
}

if(!files.progress.includes('REWARD LOCKER')) throw new Error('Progress screen missing Reward Locker');
if(!files.ownerMigration.includes('owner_grant_progression_reward')) throw new Error('Owner grant authority missing');
if(!files.ownerMigration.includes('owner_revoke_progression_reward')) throw new Error('Owner revoke authority missing');

console.log('progression rewards and advanced arcade audit passed');
