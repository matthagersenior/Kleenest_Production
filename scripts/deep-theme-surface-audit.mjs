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
requireTokens('Consumer Home dark surfaces','apps/consumer-mobile/app/index.tsx',[
  'style={[s.joinBanner,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.installFeature,{backgroundColor:theme.surface,borderColor:theme.line}]}',
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

requireTokens('Business Home dark surfaces','apps/business-mobile/app/index.tsx',[
  'style={[s.metric,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.metricValue,{color:theme.ink}]}',
  'style={[s.metricDetail,{color:theme.muted}]}',
  'style={[s.actionTile,{backgroundColor:theme.surface,borderColor:theme.line}',
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
  'style={[s.route,{backgroundColor:theme.surface,borderColor:theme.line}]}',
  'style={[s.toggle,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}',
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
  'style={[s.result,{backgroundColor:theme.surface,borderColor:theme.line}]}',
]);

if(failures.length){
  console.error('Deep theme surface audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Deep theme surface audit passed for shared primitives, high-traffic routes, forms, modal surfaces, and operator workspaces.');
