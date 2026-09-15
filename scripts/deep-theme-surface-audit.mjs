import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const requireTokens=(label,path,tokens)=>{
  const source=read(path);
  for(const token of tokens)if(!source.includes(token))failures.push(label+' missing '+token+' in '+path);
};

for(const [label,path,hook] of [
  ['Consumer hook','apps/consumer-mobile/services/theme.ts','useConsumerTheme'],
  ['Business hook','apps/business-mobile/services/theme.ts','useBusinessTheme'],
  ['Fleet hook','apps/fleet-mobile/services/theme.ts','useFleetTheme'],
  ['Platform hook','apps/platform-mobile/services/theme.ts','usePlatformTheme'],
]){
  requireTokens(label,path,[hook,'loadKleenestThemeMode','subscribeKleenestTheme','resolveKleenestTheme']);
}

for(const [label,path,hook] of [
  ['Consumer primitives','apps/consumer-mobile/components/ConsumerUI.tsx','useConsumerTheme'],
  ['Business primitives','apps/business-mobile/components/BusinessOS.tsx','useBusinessTheme'],
  ['Fleet map surfaces','apps/fleet-mobile/components/FleetMap.tsx','useFleetTheme'],
  ['KleenestOS primitives','apps/platform-mobile/components/KleenestOS.tsx','usePlatformTheme'],
]){
  requireTokens(label,path,[hook,'theme.surface','theme.line','theme.accent']);
}

const screenGroups=[
  ['Consumer Home','apps/consumer-mobile/app/index.tsx','useConsumerTheme'],
  ['Consumer Explore','apps/consumer-mobile/features/AdaptiveExploreScreen.tsx','useConsumerTheme'],
  ['Consumer Location','apps/consumer-mobile/app/location/[id].tsx','useConsumerTheme'],
  ['Consumer Profile','apps/consumer-mobile/app/profile.tsx','useConsumerTheme'],
  ['Consumer Route','apps/consumer-mobile/app/route.tsx','useConsumerTheme'],
  ['Business Home','apps/business-mobile/app/index.tsx','useBusinessTheme'],
  ['Business Locations','apps/business-mobile/app/locations.tsx','useBusinessTheme'],
  ['Business Operations','apps/business-mobile/app/operations.tsx','useBusinessTheme'],
  ['Fleet Home','apps/fleet-mobile/app/index.tsx','useFleetTheme'],
  ['Fleet Planner','apps/fleet-mobile/app/planner.tsx','useFleetTheme'],
  ['Fleet Dispatch','apps/fleet-mobile/app/dispatch.tsx','useFleetTheme'],
  ['Fleet Member','apps/fleet-mobile/app/member.tsx','useFleetTheme'],
  ['Fleet Nearby','apps/fleet-mobile/app/nearby.tsx','useFleetTheme'],
  ['KleenestOS Home','apps/platform-mobile/app/index.tsx','usePlatformTheme'],
  ['KleenestOS Businesses','apps/platform-mobile/app/businesses.tsx','usePlatformTheme'],
  ['KleenestOS Control','apps/platform-mobile/app/control.tsx','usePlatformTheme'],
  ['KleenestOS Operations','apps/platform-mobile/app/operations.tsx','usePlatformTheme'],
  ['KleenestOS Moderation','apps/platform-mobile/app/moderation.tsx','usePlatformTheme'],
];
for(const [label,path,hook] of screenGroups){
  requireTokens(label,path,[hook,'theme.canvas']);
}

for(const [label,path] of [
  ['Consumer Explore forms','apps/consumer-mobile/features/AdaptiveExploreScreen.tsx'],
  ['Consumer Location forms','apps/consumer-mobile/app/location/[id].tsx'],
  ['Consumer Profile forms','apps/consumer-mobile/app/profile.tsx'],
  ['Business Location forms','apps/business-mobile/app/locations.tsx'],
  ['Fleet Planner forms','apps/fleet-mobile/app/planner.tsx'],
  ['Fleet Dispatch forms','apps/fleet-mobile/app/dispatch.tsx'],
  ['Fleet Nearby forms','apps/fleet-mobile/app/nearby.tsx'],
  ['KleenestOS Business forms','apps/platform-mobile/app/businesses.tsx'],
  ['KleenestOS Operations forms','apps/platform-mobile/app/operations.tsx'],
]){
  requireTokens(label,path,['theme.surfaceRaised','theme.line','theme.ink']);
}

requireTokens('Consumer Explore modal','apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',['advancedModalCard','theme.surface','theme.line']);
requireTokens('Consumer review cards','apps/consumer-mobile/app/location/[id].tsx',['reviewCard','theme.surface','theme.muted']);
requireTokens('Business operational cards','apps/business-mobile/app/operations.tsx',['theme.surface','theme.warning']);
requireTokens('Fleet low-light field surfaces','apps/fleet-mobile/app/member.tsx',['theme.surface','theme.accentSoft']);
requireTokens('KleenestOS control cards','apps/platform-mobile/app/control.tsx',['useOSCardStyle','theme.surface']);


const consumerThemeCompleteness=[
  ['Consumer Signup','apps/consumer-mobile/app/signup.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised','placeholderTextColor={theme.muted}']],
  ['Consumer Family','apps/consumer-mobile/app/family.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.accentSoft']],
  ['Consumer Activity','apps/consumer-mobile/app/activity.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer AI','apps/consumer-mobile/app/assistant.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Access','apps/consumer-mobile/app/access.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Account deletion','apps/consumer-mobile/app/account-deletion.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Public deletion','apps/consumer-mobile/app/delete-account.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Blocked users','apps/consumer-mobile/app/blocked-users.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Contributor','apps/consumer-mobile/app/contributor/[id].tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Discovery','apps/consumer-mobile/app/discover.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised','placeholderTextColor={theme.muted}']],
  ['Consumer Install','apps/consumer-mobile/app/install.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Legal center','apps/consumer-mobile/app/legal.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Live Network','apps/consumer-mobile/app/live-network.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Membership','apps/consumer-mobile/app/membership.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Messages','apps/consumer-mobile/app/messages.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Notifications','apps/consumer-mobile/app/notifications.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Offline','apps/consumer-mobile/app/offline.tsx',['useConsumerTheme','theme.canvas','theme.surface']],
  ['Consumer Play','apps/consumer-mobile/app/play.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer QR','apps/consumer-mobile/app/qr.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Safety','apps/consumer-mobile/app/safety.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Saved','apps/consumer-mobile/app/saved.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Support','apps/consumer-mobile/app/support.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Week review','apps/consumer-mobile/app/week-in-review.tsx',['useConsumerTheme','theme.canvas','theme.surface']],
  ['Consumer Game arena','apps/consumer-mobile/app/game/[code].tsx',['useConsumerTheme','ui.canvas','ui.surface','ui.surfaceRaised']],
];
for(const [label,path,tokens] of consumerThemeCompleteness)requireTokens(label,path,tokens);

for(const [label,path,tokens] of [
  ['Consumer Legal documents','apps/consumer-mobile/components/LegalDocument.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Policy gate','apps/consumer-mobile/components/PolicyAcceptanceGate.tsx',['useConsumerTheme','theme.canvas','theme.surface','theme.surfaceRaised']],
  ['Consumer Restroom signals','apps/consumer-mobile/components/RestroomSignals.tsx',['useConsumerTheme','theme.surface','theme.surfaceRaised','theme.line']],
  ['Consumer Review photos','apps/consumer-mobile/components/ReviewPhotoStrip.tsx',['useConsumerTheme','theme.accentSoft','theme.surfaceRaised']],
  ['Consumer Photo trust actions','apps/consumer-mobile/components/PhotoTrustActions.tsx',['useConsumerTheme','theme.surfaceRaised','theme.danger']],
  ['Consumer Recovery history','apps/consumer-mobile/components/LocationRecoveryHistory.tsx',['useConsumerTheme','theme.surface','theme.surfaceRaised']],
  ['Consumer Amenity inventory','apps/consumer-mobile/components/LocationAmenityInventory.tsx',['useConsumerTheme','theme.surface','theme.surfaceRaised','theme.accentSoft']],
  ['Consumer Preventive verification','apps/consumer-mobile/components/PreventiveVerificationCard.tsx',['useConsumerTheme','theme.surface','theme.surfaceRaised']],
  ['Consumer Review reporting','apps/consumer-mobile/components/ReviewReportAction.tsx',['useConsumerTheme','theme.surface','theme.surfaceRaised']],
])requireTokens(label,path,tokens);

requireTokens('Consumer web-app navigation persistence','apps/consumer-mobile/app/_layout.tsx',[
  'useConsumerWebExperience',
  'appActive',
  "const publicWeb=Platform.OS==='web'&&!appActive",
]);
requireTokens('Consumer web-app session persistence','apps/consumer-mobile/services/webExperience.ts',[
  'APP_SESSION_KEY',
  'sessionStorage',
  'appSession',
  'markConsumerAppSession',
]);
requireTokens('Consumer Profile dark contrast','apps/consumer-mobile/app/profile.tsx',[
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.metricValue,{color:theme.ink}]}',
  'style={[s.metricLabel,{color:theme.muted}]}',
  'style={[s.hubLink,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.hubTitle,{color:theme.ink}]}',
  'style={[s.hubBody,{color:theme.muted}]}',
]);
requireTokens('Consumer app entry dark handoff','apps/consumer-mobile/app/index.tsx',[
  'useConsumerTheme',
  'backgroundColor:theme.canvas',
  'Redirect',
  '/explore',
]);
requireTokens('Consumer Explore functional-home dark surfaces','apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',[
  'style={[s.searchPanel,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.nearbySummary,{backgroundColor:theme.surface,borderColor:theme.line}]}',
]);
requireTokens('Consumer Explore dark controls','apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',[
  'style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}',
  'style={[s.filterLauncher,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.advancedModalCard,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'placeholderTextColor={theme.muted}',
]);
requireTokens('Consumer Preferences dark forms','apps/consumer-mobile/app/preferences.tsx',[
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}',
  'placeholderTextColor={theme.muted}',
]);

requireTokens('Early Access theme core','packages/mobile-core/src/theme.ts',[
  "'early-access'",
  "canvas:'#030712'",
  "accent:'#5de2c2'",
  "earlyAccessAccents",
]);
requireTokens('Consumer Early Access theme selector','apps/consumer-mobile/app/preferences.tsx',[
  "option.value==='early-access'",
  'BETA · EARLY ACCESS',
  'earlyAccessChoice',
  "backgroundColor:preview?.background||(earlyAccess?'#0f172a'",
]);

requireTokens('Seasonal progression theme core','packages/mobile-core/src/theme.ts',[
  "'fall'","'halloween'","'thanksgiving'","'christmas'",
  'KLEENEST_SEASONAL_THEME_MODES','seasonalEditions',
  "canvas:'#050208'","canvas:'#07130f'",
]);
requireTokens('Consumer seasonal entitlement selector','apps/consumer-mobile/app/preferences.tsx',[
  'getProgressionRewards','allowedSeasonal','visibleThemeOptions','isKleenestSeasonalThemeMode','UNLOCKED ·',
]);
requireTokens('Consumer seasonal runtime enforcement','apps/consumer-mobile/app/_layout.tsx',[
  'isKleenestSeasonalThemeMode','getProgressionRewards',"setKleenestThemeMode('default')",'enforceRewardTheme',
]);
requireTokens('Consumer seasonal reward vault','apps/consumer-mobile/app/progress.tsx',[
  'SEASONAL REWARD VAULT','TRUST DISCOVERY','PUBLIC SHOWCASE','showcaseSlots',
]);
requireTokens('Community public trust identity','apps/consumer-mobile/app/social.tsx',[
  'listProgressionIdentities','TRUST ·','progressionIdentity',
]);
requireTokens('Location reviewer trust identity','apps/consumer-mobile/app/location/[id].tsx',[
  'listProgressionIdentities','trustDiscoveryXp','item.progressionIdentity?.trust_rank',
]);
requireTokens('Contributor gated showcase','apps/consumer-mobile/app/contributor/[id].tsx',[
  'progression_identity','PUBLIC TRUST IDENTITY','Trust showcase','showcaseSlots',
]);
requireTokens('KleenestOS seasonal reward control','apps/platform-mobile/app/progression.tsx',[
  'SEASONAL REWARD VAULT','grantOwnerProgressionReward','revokeOwnerProgressionReward','OWNER ONLY',
]);
requireTokens('Seasonal reward migrations','supabase/migrations/20260914150017_seasonal_progression_reward_vault.sql',[
  'progression_reward_catalog','review_trust_discovery_awards','consumer_progression_rewards','seasonal-winter-guardian-crest',
]);
requireTokens('Seasonal reward hardening','supabase/migrations/20260914150246_harden_seasonal_progression_reward_vault.sql',[
  'is_actual_platform_owner','progression_reward_catalog_deny_direct','v_daily_cap',
]);
requireTokens('Public progression identity migration','supabase/migrations/20260914150712_community_progression_public_identity.sql',[
  'community_progression_identities','users_have_block_relationship',
]);

requireTokens('Business Home dark surfaces','apps/business-mobile/app/index.tsx',[
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.metricValue,{color:theme.ink}]}',
  'style={[s.metricDetail,{color:theme.muted}]}',
  'style={StyleSheet.flatten([s.actionTile,{backgroundColor:theme.surface,borderColor:theme.line}',
]);
requireTokens('Business Locations dark surfaces','apps/business-mobile/app/locations.tsx',[
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.input,{flex:1,backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}',
  'placeholderTextColor={theme.muted}',
]);
requireTokens('Business Operations dark surfaces','apps/business-mobile/app/operations.tsx',[
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.metricValue,{color:theme.ink}]}',
  'style={[s.factValue,{color:theme.ink}]}',
]);
requireTokens('Fleet Home dark surfaces','apps/fleet-mobile/app/index.tsx',[
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.metricValue,{color:theme.ink}]}',
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}',
]);
requireTokens('Fleet Planner dark surfaces','apps/fleet-mobile/app/planner.tsx',[
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.route,{backgroundColor:theme.surface,borderColor:theme.line}',
  'style={[s.toggle,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}',
]);
requireTokens('Fleet Dispatch dark surfaces','apps/fleet-mobile/app/dispatch.tsx',[
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.routeCard,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}',
]);
requireTokens('Fleet Member dark surfaces','apps/fleet-mobile/app/member.tsx',[
  'style={[s.consumerCard,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.infoCard,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.stop,{backgroundColor:theme.surface,borderColor:theme.line}]}',
]);
requireTokens('Fleet Nearby dark surfaces','apps/fleet-mobile/app/nearby.tsx',[
  'style={[s.searchCard,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.selectedCard,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.result,{backgroundColor:theme.surface,borderColor:theme.line}',
]);

if(failures.length){
  console.error('Deep theme surface audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Deep theme surface audit passed for shared primitives, Consumer theme-completeness routes, forms, modal surfaces, and operator workspaces.');
