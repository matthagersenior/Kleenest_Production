import fs from 'node:fs';

const failures=[];
const experiencePath='apps/consumer-mobile/services/webExperience.ts';
const homePath='apps/consumer-mobile/app/index.tsx';

for(const file of [experiencePath,homePath]){
  if(!fs.existsSync(file))failures.push(`Missing native auth regression file: ${file}`);
}

if(!failures.length){
  const experience=fs.readFileSync(experiencePath,'utf8');
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
    if(!home.includes(token))failures.push(`Consumer app-entry auth handoff missing ${token}.`);
  }
  if(home.includes('buildConsumerHomeHeroes(signedIn)')||home.includes("signedIn?'PROFILE':'GET STARTED'")){
    failures.push('Consumer app entry must not retain a stale sign-in-dependent Home surface before Explore.');
  }
}

if(failures.length){
  console.error('Consumer native Home auth reactivity audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Consumer native Home auth reactivity audit passed.');
