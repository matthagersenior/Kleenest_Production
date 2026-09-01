import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const requireAll=(path,tokens)=>{const source=read(path);for(const token of tokens){if(!source.includes(token))throw new Error(`${path} missing presentation contract: ${token}`)}return source};

const ui=requireAll('apps/consumer-mobile/components/ConsumerUI.tsx',['HeroCard','FeatureCard','SectionHeader','TrustStrip','MetricTile','palette']);
const layout=requireAll('apps/consumer-mobile/app/_layout.tsx',["title:'Home'","title:'Explore'","title:'Play'","title:'Community'","title:'Profile'","name=\"preferences\"",'tabBarActiveTintColor']);
const home=requireAll('apps/consumer-mobile/app/index.tsx',['Find a better bathroom. Make the next visit count.','THE KLEENEST LOOP','YOUR NETWORK','PLAY + PROGRESS','Membership','Game Center','Support']);
const explore=requireAll('apps/consumer-mobile/app/explore.tsx',['Find your best nearby bathroom.','BEST NEXT DECISION','What matters on this stop?','Start directions →','TrustStrip','listLocationTrustSummaries','listNearbyRestrooms']);
const profile=requireAll('apps/consumer-mobile/app/profile.tsx',['Your restroom network','Your progress and people','Control your Kleenest','Privacy & preferences','Scan a Kleenest code','Contribution-backed standing','update_my_public_profile']);
const prefs=requireAll('apps/consumer-mobile/app/preferences.tsx',['Privacy & preferences','profile_visibility','show_activity','show_checkins','show_reviews','allow_followers','discoverable','preferred_units','home_region','get_my_profile_preferences','update_my_profile_preferences']);
const play=requireAll('apps/consumer-mobile/app/play.tsx',['PLAY + PROGRESS','Active trust mission','Active quests','Available quests','Challenges','Contests','Community leaderboard']);
const social=requireAll('apps/consumer-mobile/app/social.tsx',['COMMUNITY','People helping people.','Find people','Following','Followers','Community pulse','VISIT EVIDENCE']);

for(const [name,source] of Object.entries({layout,home,explore,profile,prefs,play,social,ui})){
  if(/business_|fleet_|enterprise_|admin_/i.test(source.replace(/business_reply/g,'')))throw new Error(`${name} presentation surface leaked Operations authority into consumer UI`);
}
if(!home.includes("router.push('/explore')"))throw new Error('Home must keep bathroom discovery as a primary action');
if(!profile.includes("router.push('/preferences')")&&!profile.includes('route="/preferences"'))throw new Error('Profile must expose privacy/preferences from the consumer hub');
if(!explore.includes('captureConsumerDiscovery')||!explore.includes('captureConsumerRouteIntent'))throw new Error('Rich discovery must preserve lightweight backend data production');

console.log('Native consumer presentation convergence audit passed.');
