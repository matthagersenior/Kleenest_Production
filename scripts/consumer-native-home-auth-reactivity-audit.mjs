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
    'const[heroItems,setHeroItems]=useState<OrganicHeroItem[]>([])',
    'const[heroReady,setHeroReady]=useState(false)',
    'if(!experienceReady)return <SafeAreaView',
    'if(!heroReady)return <SafeAreaView',
    'buildConsumerHomeHeroes(signedIn)',
    'setHeroReady(true)',
  ]){
    if(!home.includes(token))failures.push(`Consumer Home hydration guard missing ${token}.`);
  }
  const experienceGate=home.indexOf('if(!experienceReady)return <SafeAreaView');
  const heroGate=home.indexOf('if(!heroReady)return <SafeAreaView');
  const heroRender=home.indexOf('<RelevanceHeroCarousel');
  if(!(experienceGate>=0&&heroGate>experienceGate&&heroRender>heroGate)){
    failures.push('Consumer Home must resolve auth and hero state before rendering the relevance hero.');
  }
}

if(failures.length){
  console.error('Consumer native Home auth reactivity audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Consumer native Home auth reactivity audit passed.');
