import * as SecureStore from 'expo-secure-store';

export type AppSearchScope='consumer'|'business'|'fleet'|'owner';
export type AppSearchEntry={
  id:string;
  title:string;
  subtitle:string;
  category:'Page'|'Action'|'Settings'|'Community'|'Progression'|'Operations'|'Data'|'Knowledge';
  detail?:string;
  route:string;
  keywords:string[];
};

const INDEX:Record<AppSearchScope,AppSearchEntry[]>={
  consumer:[
    {id:'home',title:'Home',subtitle:'Your Kleenest home and personalized shortcuts',category:'Page',route:'/home',keywords:['dashboard','start','homepage']},
    {id:'explore',title:'Explore bathrooms',subtitle:'Map, nearby results, freshness and amenities',category:'Page',route:'/explore',keywords:['map','bathroom','restroom','nearby','search','places']},
    {id:'check-in',title:'Check in',subtitle:'Verify a real visit and strengthen trust',category:'Action',route:'/explore',keywords:['checkin','check-in','visit','verify','arrival']},
    {id:'review',title:'Review a place',subtitle:'Add a restroom review or update',category:'Action',route:'/activity',keywords:['review','rate','rating','feedback','cleanliness']},
    {id:'prior-knowledge',title:'Share prior knowledge',subtitle:'Contribute useful information from a previous visit',category:'Action',route:'/knowledge',keywords:['old visit','previous visit','later','knowledge','update']},
    {id:'saved',title:'Saved bathrooms',subtitle:'Your saved Kleenest places',category:'Page',route:'/saved',keywords:['favorite','favorites','bookmarks','saved']},
    {id:'routes',title:'Routes',subtitle:'Build and manage restroom-aware routes',category:'Page',route:'/route',keywords:['route','trip','drive','stops','navigation']},
    {id:'qr',title:'Scan QR',subtitle:'Open Kleenest QR experiences',category:'Action',route:'/qr',keywords:['qr','scan','code','check in']},
    {id:'progress',title:'Progression',subtitle:'XP, missions, rewards, badges and levels',category:'Progression',route:'/progress',keywords:['xp','mission','missions','quest','quests','badge','badges','level','rewards','themes']},
    {id:'games',title:'Game Center',subtitle:'Kleenest arcade and progression games',category:'Progression',route:'/games',keywords:['game','games','arcade','play']},
    {id:'reward-tools',title:'Reward Toolkit',subtitle:'Unlocked themes, filters and progression tools',category:'Progression',route:'/reward-tools',keywords:['reward','theme','themes','filter','filters','toolkit']},
    {id:'community',title:'Community',subtitle:'Contributors, activity and social discovery',category:'Community',route:'/social',keywords:['community','people','followers','following','contributors','friends']},
    {id:'messages',title:'Messages',subtitle:'Kleenest messages and conversations',category:'Community',route:'/messages',keywords:['message','messages','chat']},
    {id:'notifications',title:'Notifications',subtitle:'Your Kleenest notifications',category:'Page',route:'/notifications',keywords:['alert','alerts','notification','notifications']},
    {id:'week-review',title:'Week in review',subtitle:'Places visited and reviews still worth adding',category:'Page',route:'/week-in-review',keywords:['week','review later','visited','history']},
    {id:'activity',title:'Your activity',subtitle:'Check-ins, reviews and recent contributions',category:'Page',route:'/activity',keywords:['history','activity','checkins','reviews']},
    {id:'membership',title:'Membership',subtitle:'Free, remove ads, Family and account entitlements',category:'Settings',route:'/membership',keywords:['membership','premium','remove ads','family','billing','plan']},
    {id:'family',title:'Kleenest Family',subtitle:'Family membership and linked users',category:'Settings',route:'/family',keywords:['family','household','members']},
    {id:'profile',title:'Profile',subtitle:'Your public Kleenest identity and account',category:'Settings',route:'/profile',keywords:['profile','name','avatar','account']},
    {id:'preferences',title:'Privacy & preferences',subtitle:'Theme, privacy and app preferences',category:'Settings',route:'/preferences',keywords:['settings','dark mode','theme','privacy','preferences']},
    {id:'offline',title:'Offline Trips',subtitle:'Offline route and trip support',category:'Page',route:'/offline',keywords:['offline','trip','download','no signal']},
    {id:'live-network',title:'Live Network',subtitle:'Nearby Kleenest network activity',category:'Page',route:'/live-network',keywords:['live','network','nearby','push']},
    {id:'assistant',title:'Kleenest AI',subtitle:'Ask Kleenest for help inside the app',category:'Action',route:'/assistant',keywords:['ai','assistant','help','ask']},
    {id:'support',title:'Help & support',subtitle:'Support and troubleshooting',category:'Settings',route:'/support',keywords:['help','support','bug','problem']},
    {id:'knowledge-freshness',title:'Freshness',subtitle:'How recently a restroom has trustworthy evidence',detail:'Freshness favors recent verified observations. Heat rings and freshness signals help you judge how current a place record is before you go.',category:'Knowledge',route:'/explore',keywords:['freshness','fresh','heat ring','ring','recent','trust']},
    {id:'knowledge-trust',title:'Trust & verification',subtitle:'Why one contribution can carry more trust than another',detail:'Kleenest separates XP from evidence confidence. GPS, on-site observations, independent confirmations and business evidence can strengthen trust without blocking normal reviews.',category:'Knowledge',route:'/trust',keywords:['trust','verification','verified','evidence','confidence','gps','dwell']},
    {id:'knowledge-restroom-types',title:'Restroom types',subtitle:'Men’s, women’s, family and other facility-specific records',detail:'A location can contain multiple restroom facilities. Facility type and amenities are stored separately so family, accessibility and other details stay accurate.',category:'Knowledge',route:'/explore',keywords:['mens','men','women','womens','family restroom','bathroom type','facility type']},
    {id:'knowledge-photos-later',title:'Add photos later',subtitle:'Photos can be contributed after the visit',detail:'You can add useful photos from a previous visit without pretending you are still on-site. Live check-in evidence and later knowledge contributions remain distinct.',category:'Knowledge',route:'/knowledge',keywords:['photo','photos','upload later','previous visit','add later']},
    {id:'knowledge-progression',title:'How progression works',subtitle:'XP, trust, badges, missions, levels and permanent rewards',detail:'Progression rewards useful contributions. XP and trust are related but distinct signals; themes, badges and other rewards can unlock as your real contribution history grows.',category:'Knowledge',route:'/progress',keywords:['how xp works','levels','badges','rewards','themes','missions','progression']},
    {id:'knowledge-family',title:'Kleenest Family',subtitle:'One-time family access for linked household users',detail:'Family is the shared household option for up to five users. Search Membership or Family to manage access and linked users.',category:'Knowledge',route:'/family',keywords:['family plan','five users','5 users','household']},
  ],
  business:[
    {id:'home',title:'Business Home',subtitle:'Business workspace overview',category:'Page',route:'/',keywords:['dashboard','home','overview']},
    {id:'actions',title:'Actions',subtitle:'Business quick actions and workflows',category:'Action',route:'/tools',keywords:['actions','tasks','tools']},
    {id:'locations',title:'Locations',subtitle:'Managed locations, claims and restroom facilities',category:'Operations',route:'/locations',keywords:['location','locations','place','claim','claims','restroom','facility']},
    {id:'verification',title:'Verification Center',subtitle:'Claims, evidence and ownership verification',category:'Operations',route:'/verification-center',keywords:['verify','verification','claim','ownership','evidence']},
    {id:'team',title:'People & Roles',subtitle:'Team members, staff and dispatchers',category:'Operations',route:'/members',keywords:['team','people','staff','member','members','role','roles','dispatcher']},
    {id:'reviews',title:'Reviews',subtitle:'Customer reviews and responses',category:'Operations',route:'/reviews',keywords:['review','reviews','reply','response','feedback']},
    {id:'qr-studio',title:'QR Studio',subtitle:'QR library, programs and lifecycle',category:'Action',route:'/qr-studio',keywords:['qr','code','codes','scan','studio']},
    {id:'qr-designer',title:'QR Designer',subtitle:'Design branded QR experiences',category:'Action',route:'/qr-designer',keywords:['qr','designer','brand','branded']},
    {id:'analytics',title:'Analytics',subtitle:'Business performance and restroom signals',category:'Data',route:'/analytics',keywords:['analytics','data','performance','chart','charts','insights']},
    {id:'growth',title:'Growth',subtitle:'Engagement, discovery and growth tools',category:'Data',route:'/engagement',keywords:['growth','engagement','discovery','marketing']},
    {id:'operations',title:'Operations',subtitle:'Operational controls and current state',category:'Operations',route:'/operations',keywords:['operations','ops','status']},
    {id:'prevention',title:'Prevention',subtitle:'Preventive restroom operations',category:'Operations',route:'/prevention',keywords:['prevention','preventive','maintenance']},
    {id:'trust',title:'Trust Operations',subtitle:'Trust, evidence and remediation',category:'Operations',route:'/trust-operations',keywords:['trust','evidence','remediation']},
    {id:'live-network',title:'Live Network',subtitle:'Business live network and geofencing',category:'Operations',route:'/live-network',keywords:['live','network','geofence','geofencing']},
    {id:'devices',title:'Smart Devices',subtitle:'Connected restroom and IoT controls',category:'Operations',route:'/devices',keywords:['device','devices','iot','sensor','sensors','smart']},
    {id:'progression',title:'Progression',subtitle:'Business community progression and engagement',category:'Progression',route:'/progression',keywords:['progression','xp','rewards','community']},
    {id:'intelligence',title:'Intelligence',subtitle:'Advanced business intelligence',category:'Data',route:'/intelligence',keywords:['intelligence','ai','insight','insights']},
    {id:'capabilities',title:'Capabilities',subtitle:'Business capability control plane',category:'Data',route:'/capabilities',keywords:['capability','capabilities','entitlement','feature']},
    {id:'enterprise',title:'Enterprise',subtitle:'Enterprise business controls',category:'Operations',route:'/enterprise',keywords:['enterprise','portfolio']},
    {id:'enterprise-locations',title:'Enterprise Locations',subtitle:'Enterprise location portfolio',category:'Operations',route:'/enterprise-locations',keywords:['enterprise','locations','portfolio']},
    {id:'fleet',title:'Fleet Suite',subtitle:'Fleet capabilities connected to Business',category:'Operations',route:'/fleet',keywords:['fleet','dispatch','driver','vehicle']},
    {id:'notifications',title:'Notifications',subtitle:'Business notifications and messaging',category:'Action',route:'/notifications',keywords:['notification','notifications','message','push']},
    {id:'profile',title:'Business Profile',subtitle:'Public profile and business identity',category:'Settings',route:'/profile',keywords:['profile','brand','business info']},
    {id:'workspaces',title:'Workspaces',subtitle:'Choose a Business workspace',category:'Settings',route:'/workspaces',keywords:['workspace','switch business']},
    {id:'support',title:'Support',subtitle:'Business help and support',category:'Settings',route:'/support',keywords:['help','support']},
    {id:'account',title:'Account',subtitle:'Business account settings',category:'Settings',route:'/account',keywords:['account','settings']},
    {id:'knowledge-claims',title:'How business claims work',subtitle:'Paid access does not automatically prove location ownership',detail:'Claims connect a canonical Kleenest location to the operator after verification. Existing operator authority and community evidence are protected during the claim process.',category:'Knowledge',route:'/verification-center',keywords:['claim','claims','ownership','verification','paid ownership']},
    {id:'knowledge-user-photos',title:'User photos vs business photos',subtitle:'Community photos remain independent evidence',detail:'Businesses can add official media and can flag or dispute community content, but they do not choose which user photos become community evidence.',category:'Knowledge',route:'/reviews',keywords:['user photos','business photos','photo dispute','flag photo']},
    {id:'knowledge-growth-tier',title:'Business Growth',subtitle:'Growth supports up to five locations',detail:'The Growth tier is intended for organizations managing up to five locations before Enterprise-scale controls become the better fit.',category:'Knowledge',route:'/capabilities',keywords:['growth','5 locations','five locations','tier','plan']},
    {id:'knowledge-restroom-signal',title:'Restroom quality as a business signal',subtitle:'Restroom evidence can inform customer experience and operations',detail:'Kleenest treats restroom quality as operational and customer-experience data, not merely an amenity checkbox.',category:'Knowledge',route:'/analytics',keywords:['restroom quality','customer experience','cx','operations signal']},
    {id:'knowledge-qr',title:'Business QR programs',subtitle:'QR can support check-ins, evidence, engagement and access',detail:'QR Studio manages branded QR assets and programs while preserving the canonical location and trust model underneath them.',category:'Knowledge',route:'/qr-studio',keywords:['qr program','qr code','check in qr','branded qr']},
  ],
  fleet:[
    {id:'home',title:'Fleet Home',subtitle:'Fleet workspace overview',category:'Page',route:'/',keywords:['home','dashboard','overview']},
    {id:'planner',title:'Planner',subtitle:'Build routes and restroom-aware stops',category:'Operations',route:'/planner',keywords:['planner','plan','route','routes','stop','stops']},
    {id:'dispatch',title:'Dispatch',subtitle:'Dispatch center and route assignment',category:'Operations',route:'/dispatch',keywords:['dispatch','dispatcher','assign','route']},
    {id:'assets',title:'Assets',subtitle:'Vehicles, drivers and assignments',category:'Operations',route:'/assets',keywords:['asset','assets','vehicle','vehicles','driver','drivers']},
    {id:'operations',title:'Operations',subtitle:'Fleet operations and current state',category:'Operations',route:'/operations',keywords:['operations','ops','status']},
    {id:'execution',title:'Execution',subtitle:'Route execution and active work',category:'Operations',route:'/execution',keywords:['execution','active route','work']},
    {id:'nearby',title:'Nearby',subtitle:'Nearby restroom discovery for Fleet users',category:'Page',route:'/nearby',keywords:['nearby','bathroom','restroom','places']},
    {id:'signals',title:'Live Network',subtitle:'Fleet network signals and geofencing',category:'Data',route:'/signals',keywords:['signals','live network','geofence','geofencing']},
    {id:'metrics',title:'Metrics',subtitle:'Fleet performance metrics and scorecards',category:'Data',route:'/metrics',keywords:['metrics','performance','score','scorecard']},
    {id:'insights',title:'Insights',subtitle:'Fleet insights and operational intelligence',category:'Data',route:'/insights',keywords:['insight','insights','intelligence','ai']},
    {id:'maintenance',title:'Maintenance',subtitle:'Vehicle and preventive maintenance',category:'Operations',route:'/maintenance',keywords:['maintenance','repair','preventive','vehicle']},
    {id:'sync',title:'Offline & Sync',subtitle:'Offline state and synchronization',category:'Operations',route:'/sync',keywords:['offline','sync','synchronization']},
    {id:'progression',title:'Progression',subtitle:'Fleet progression and leaderboards',category:'Progression',route:'/progression',keywords:['progression','leaderboard','xp','score']},
    {id:'premium',title:'Fleet Premium',subtitle:'Premium seats and member access',category:'Settings',route:'/premium',keywords:['premium','seat','seats','75','member access']},
    {id:'enterprise',title:'Enterprise',subtitle:'Fleet Enterprise controls',category:'Operations',route:'/enterprise',keywords:['enterprise']},
    {id:'capabilities',title:'Capabilities',subtitle:'Fleet capability controls',category:'Data',route:'/capabilities',keywords:['capability','capabilities','feature']},
    {id:'notifications',title:'Alerts',subtitle:'Fleet notifications and exception alerts',category:'Action',route:'/notifications',keywords:['alert','alerts','notification','notifications','exception']},
    {id:'workspaces',title:'Workspaces',subtitle:'Choose a Fleet workspace',category:'Settings',route:'/workspaces',keywords:['workspace','switch fleet']},
    {id:'account',title:'Account',subtitle:'Fleet account settings',category:'Settings',route:'/account',keywords:['account','settings']},
    {id:'support',title:'Support',subtitle:'Fleet help and support',category:'Settings',route:'/support',keywords:['help','support']},
    {id:'knowledge-premium-seats',title:'Fleet Premium seats',subtitle:'Premium supports 75 seats',detail:'Fleet Premium is configured around 75 premium seats. Premium access is managed separately from ordinary workspace membership.',category:'Knowledge',route:'/premium',keywords:['75 seats','premium seats','seat limit','members']},
    {id:'knowledge-geofencing',title:'Fleet geofencing',subtitle:'Location-aware arrival, nearby and operational signals',detail:'Geofencing helps Fleet understand proximity and arrival context. It can support dispatch and trust signals without making dwell a hard gate for legitimate activity.',category:'Knowledge',route:'/signals',keywords:['geofence','geofencing','arrival','dwell','nearby']},
    {id:'knowledge-dispatch',title:'Dispatch model',subtitle:'Routes, drivers, vehicles and restroom-aware stops work together',detail:'Fleet links routes, assigned drivers and vehicles with canonical Kleenest locations so dispatch can use restroom quality and freshness as an operating input.',category:'Knowledge',route:'/dispatch',keywords:['dispatch model','route assignment','driver assignment','vehicle assignment']},
    {id:'knowledge-offline',title:'Offline & sync',subtitle:'Fleet work can recover after poor connectivity',detail:'Offline and synchronization controls are designed to keep field workflows usable when connectivity is intermittent and reconcile state when the app reconnects.',category:'Knowledge',route:'/sync',keywords:['offline','sync','no signal','reconnect']},
  ],
  owner:[
    {id:'home',title:'KleenestOS Home',subtitle:'Owner command center',category:'Page',route:'/',keywords:['home','dashboard','command center']},
    {id:'control',title:'Control',subtitle:'Platform operating controls',category:'Operations',route:'/control',keywords:['control','owner','platform']},
    {id:'people',title:'People & Access',subtitle:'Users, roles, subscriptions and permissions',category:'Operations',route:'/access',keywords:['people','users','account','accounts','role','roles','access','permissions']},
    {id:'businesses',title:'Businesses',subtitle:'Businesses, locations, claims and access',category:'Operations',route:'/businesses',keywords:['business','businesses','claims','location','locations']},
    {id:'progression',title:'Progression',subtitle:'XP policy, missions, rewards and objectives',category:'Progression',route:'/progression',keywords:['progression','xp','mission','missions','quest','reward','rewards','theme','themes','objective','objectives']},
    {id:'creator-missions',title:'Creator Missions',subtitle:'Creator assignments, tracking links, QR and activation',category:'Progression',route:'/progression',keywords:['creator','creators','creator mission','tracking','qr','campaign','influencer']},
    {id:'pilots',title:'Pilots',subtitle:'Pilot programs and launch controls',category:'Operations',route:'/pilots',keywords:['pilot','pilots','launch']},
    {id:'developers',title:'Developers',subtitle:'Developer platform, integrations and credentials',category:'Data',route:'/developers',keywords:['developer','developers','api','sdk','integration','integrations','credentials']},
    {id:'operations',title:'Operations',subtitle:'Platform operations and system health',category:'Operations',route:'/operations',keywords:['operations','ops','health']},
    {id:'moderation',title:'Moderation',subtitle:'Trust, safety and moderation queues',category:'Operations',route:'/moderation',keywords:['moderation','trust','safety','reports','flags']},
    {id:'devices',title:'IoT & Smart Devices',subtitle:'Platform device controls',category:'Operations',route:'/devices',keywords:['iot','device','devices','sensor','smart']},
    {id:'intelligence',title:'Intelligence',subtitle:'Platform intelligence and action surfaces',category:'Data',route:'/intelligence',keywords:['intelligence','ai','insights']},
    {id:'reports',title:'Reports',subtitle:'Platform reporting',category:'Data',route:'/reports',keywords:['report','reports','reporting']},
    {id:'audit',title:'Audit',subtitle:'System and control-plane audit history',category:'Data',route:'/audit',keywords:['audit','history','changes','log']},
    {id:'capabilities',title:'Capabilities',subtitle:'Platform capability control plane',category:'Data',route:'/capabilities',keywords:['capability','capabilities','feature','features']},
    {id:'data',title:'Data',subtitle:'Data workbench and canonical resources',category:'Data',route:'/data',keywords:['data','database','workbench','resource','resources']},
    {id:'notifications',title:'Live Network Messaging',subtitle:'Push and live network messaging controls',category:'Action',route:'/notifications',keywords:['notification','notifications','push','message','messaging']},
    {id:'feedback',title:'Tell Kleenest',subtitle:'User feedback inbox',category:'Operations',route:'/feedback-inbox',keywords:['feedback','tell kleenest','inbox']},
    {id:'beta',title:'Beta Incidents',subtitle:'Beta bugs, errors and incident reports',category:'Operations',route:'/beta-incidents',keywords:['beta','bug','bugs','error','errors','incident','incidents']},
    {id:'relevance',title:'Relevance + Sponsorship',subtitle:'Organic relevance and sponsored placements',category:'Data',route:'/relevance',keywords:['relevance','sponsorship','ads','advertising','hero']},
    {id:'account',title:'Account',subtitle:'Owner account settings',category:'Settings',route:'/account',keywords:['account','settings']},
    {id:'support',title:'Support',subtitle:'Owner support',category:'Settings',route:'/support',keywords:['help','support']},
    {id:'knowledge-owner-authority',title:'Owner authority',subtitle:'Platform-wide controls should have an Owner surface',detail:'KleenestOS is the audited control plane for platform-wide policy, access, progression, trust, campaigns and operational features.',category:'Knowledge',route:'/control',keywords:['owner authority','platform wide','global control','control plane']},
    {id:'knowledge-creator-missions',title:'Creator mission lifecycle',subtitle:'Creator missions stay draft until the Owner activates them',detail:'Each creator mission has an Owner-controlled assignment, tracking slug, branded link/QR attribution and lifecycle. Draft links do not become live until activation.',category:'Knowledge',route:'/progression',keywords:['creator mission','creator missions','tracking link','creator qr','activate mission','draft mission']},
    {id:'knowledge-progression-authority',title:'Progression authority',subtitle:'Objectives, XP policy and reward supply are server-authoritative',detail:'KleenestOS controls quests, missions, campaigns, XP issuance, cooldowns, daily caps and progression reward policy through audited backend authority.',category:'Knowledge',route:'/progression',keywords:['xp policy','objective','objectives','reward policy','mission supply']},
    {id:'knowledge-moderation',title:'Trust & moderation',subtitle:'Review reports, photo reports, user safety and AI reports',detail:'Moderation queues preserve evidence and audit history while giving Owner tools to resolve reports, disputes and safety cases.',category:'Knowledge',route:'/moderation',keywords:['trust','moderation','photo report','review report','user report','ai report']},
    {id:'knowledge-sponsorship',title:'Relevance vs sponsorship',subtitle:'Organic relevance and paid placement are separate controls',detail:'Organic hero/relevance policy is independent from sponsored campaign placements so paid promotion does not silently redefine Kleenest relevance.',category:'Knowledge',route:'/relevance',keywords:['ads','sponsored','sponsorship','organic','hero','relevance']},
    {id:'knowledge-developer',title:'Developer platform',subtitle:'API, SDK, widget, map, routes, webhooks and AI integrations',detail:'The developer surface covers external integration capabilities and their platform enablement rather than exposing internal database primitives directly.',category:'Knowledge',route:'/developers',keywords:['api','sdk','widget','map layer','route sdk','deep link','webhook','mcp']},
  ],
};

function normalize(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function score(entry:AppSearchEntry,raw:string){
  const query=normalize(raw);if(!query)return 0;
  const title=normalize(entry.title),subtitle=normalize(entry.subtitle),detail=normalize(entry.detail||''),category=normalize(entry.category);
  const keywords=entry.keywords.map(normalize);
  if(title===query)return 1000;
  let total=0;
  if(title.startsWith(query))total+=600;
  else if(title.includes(query))total+=400;
  if(subtitle.includes(query))total+=180;
  if(detail.includes(query))total+=220;
  if(category.includes(query))total+=120;
  for(const keyword of keywords){
    if(keyword===query)total+=500;
    else if(keyword.startsWith(query))total+=260;
    else if(keyword.includes(query)||query.includes(keyword))total+=120;
  }
  const parts=query.split(' ').filter(Boolean);
  for(const part of parts){
    if(title.split(' ').some(word=>word.startsWith(part)))total+=90;
    if(keywords.some(keyword=>keyword.split(' ').some(word=>word.startsWith(part))))total+=50;
    if(detail.split(' ').some(word=>word.startsWith(part)))total+=35;
  }
  return total;
}

export function appSearchIndex(scope:AppSearchScope){return INDEX[scope].slice();}
export function searchAppIndex(scope:AppSearchScope,query:string,limit=30){
  const q=query.trim();
  if(!q)return INDEX[scope].slice(0,8);
  return INDEX[scope].map(entry=>({entry,score:score(entry,q)})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score||a.entry.title.localeCompare(b.entry.title)).slice(0,limit).map(row=>row.entry);
}

function recentKey(scope:AppSearchScope){return `kleenest.app-search.recents.${scope}.v1`;}
export async function loadAppSearchRecents(scope:AppSearchScope){
  try{const raw=await SecureStore.getItemAsync(recentKey(scope));const parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed.map(String).filter(Boolean).slice(0,8):[]}catch{return[];}
}
export async function rememberAppSearchQuery(scope:AppSearchScope,query:string){
  const value=query.trim().replace(/\s+/g,' ');if(value.length<2)return;
  const current=await loadAppSearchRecents(scope);
  const next=[value,...current.filter(item=>item.toLowerCase()!==value.toLowerCase())].slice(0,8);
  await SecureStore.setItemAsync(recentKey(scope),JSON.stringify(next)).catch(()=>{});
}
export async function clearAppSearchRecents(scope:AppSearchScope){await SecureStore.deleteItemAsync(recentKey(scope)).catch(()=>{});}
