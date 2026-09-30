import fs from 'node:fs';

const failures=[];
const experiencePath='apps/consumer-mobile/services/webExperience.ts';
const entryPath='apps/consumer-mobile/app/index.tsx';
const homePath='apps/consumer-mobile/app/home.tsx';

for(const file of [experiencePath,entryPath,homePath]){
  if(!fs.existsSync(file))failures.push(`Missing native auth regression file: ${file}`);
}

if(!failures.length){
  const experience=fs.readFileSync(experiencePath,'utf8');
  const entry=fs.readFileSync(entryPath,'utf8');
  const home=fs.readFileSync(homePath,'utf8');

  if(/useEffect\(\(\)=>\{\s*if\(native\)return;\s*let active=true;\s*const client=getKleenestSupabaseClient\(\)/s.test(experience)){
    failures.push('Native consumer auth must not return before subscribing to the Supabase session.');
  }

  for(const token of [
    'const client=getKleenestSupabaseClient()',
    'client.auth.getSession()',
    'client.auth.onAuthStateChange',
    'setSignedIn(Boolean(session))',
  ]){
    if(!experience.includes(token))failures.push(`Consumer auth experience missing ${token}.`);
  }

  for(const token of [
    'useConsumerWebExperience()',
    'appActive',
    'Redirect',
    '/explore',
  ]){
    if(!entry.includes(token))failures.push(`Consumer app-entry auth handoff missing ${token}.`);
  }
  if(entry.includes('buildConsumerHomeHeroes(signedIn)')||entry.includes("signedIn?'PROFILE':'GET STARTED'")){
    failures.push('Consumer app entry must not retain a stale sign-in-dependent Home surface before Explore.');
  }

  if(!experience.includes('const[ready,setReady]=useState(false)')){
    failures.push('Consumer experience readiness must begin false until persisted auth hydration completes.');
  }
  for(const token of [
    'ready:experienceReady',
    'signedIn',
    'if(!experienceReady)return <SafeAreaView',
    'useEffect(()=>{if(signedIn)void refresh()},[signedIn])',
    '!signedIn?<>',
    'MarketingHome',
  ]){
    if(!home.includes(token))failures.push(`Consumer Home hydration guard missing ${token}.`);
  }
  const experienceGate=home.indexOf('if(!experienceReady)return <SafeAreaView');
  const signedInBranch=home.indexOf('!signedIn?<>');
  const communityLoad=home.indexOf('useEffect(()=>{if(signedIn)void refresh()},[signedIn])');
  if(!(communityLoad>=0&&experienceGate>communityLoad&&signedInBranch>experienceGate)){
    failures.push('Consumer Home must resolve auth readiness before rendering signed-in or guest Home content.');
  }
}

if(failures.length){
  console.error('Consumer native Home auth reactivity audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Consumer native Home auth reactivity audit passed.');
