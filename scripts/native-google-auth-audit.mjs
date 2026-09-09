import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const compact=source=>source.replace(/\s+/g,'');

const consumer=read('apps/consumer-mobile/app/profile.tsx');
const consumerCompact=compact(consumer);
if(!consumer.includes('Continue with Google'))failures.push('Consumer must expose a visible Continue with Google action.');
if(!consumerCompact.includes("provider:'google'")&&!consumerCompact.includes('provider:"google"'))failures.push('Consumer must authenticate with the canonical Supabase Google provider.');
if(!consumer.includes('signInWithOAuth'))failures.push('Consumer must initiate Google authentication through Supabase OAuth.');
if(!consumer.includes('skipBrowserRedirect:true'))failures.push('Consumer native OAuth must hand browser navigation to the app.');
if(!consumer.includes('mobileAuthRedirect')||!consumer.includes('Linking.openURL'))failures.push('Consumer Google OAuth must return through the Kleenest mobile deep link.');
if(!consumer.includes('exchangeCodeForSession'))failures.push('Consumer must exchange the OAuth callback code for a Supabase session.');

const operatorAuth=[
  ['Owner','apps/platform-mobile/app/auth.tsx','kleenest-owner'],
  ['Business','apps/business-mobile/app/auth.tsx','kleenest-business'],
  ['Fleet','apps/fleet-mobile/app/auth.tsx','kleenest-fleet'],
];
for(const [label,path,scheme] of operatorAuth){
  const source=read(path);
  const sourceCompact=compact(source);
  if(!source.includes('Continue with Google'))failures.push(`${label} must expose a visible Continue with Google action.`);
  if(!sourceCompact.includes("provider:'google'")&&!sourceCompact.includes('provider:"google"'))failures.push(`${label} must authenticate with the canonical Supabase Google provider.`);
  if(!source.includes('signInWithOAuth')||!source.includes('skipBrowserRedirect'))failures.push(`${label} native OAuth must use Supabase OAuth with app-controlled browser navigation.`);
  if(!source.includes('exchangeCodeForSession')||!source.includes('Linking.openURL'))failures.push(`${label} must exchange the OAuth callback and return through its native deep link.`);
  if(!source.includes(`scheme: '${scheme}'`)&&!sourceCompact.includes(`scheme:'${scheme}'`))failures.push(`${label} OAuth must use the ${scheme} native scheme.`);
  if(source.includes("Linking.createURL('/auth'")||source.includes('Linking.createURL("/auth"'))failures.push(`${label} OAuth callback must use the repaired native auth path without a leading slash.`);
  if(!source.includes("Linking.createURL('auth'")&&!source.includes('Linking.createURL("auth"'))failures.push(`${label} OAuth callback must use Linking.createURL('auth', ...).`);
}

const owner=read('apps/platform-mobile/app/auth.tsx');
if(!owner.includes('isTripleSlashed: false'))failures.push('Owner OAuth callback must preserve the verified non-triple-slashed KleenestOS callback contract.');

if(failures.length){
  console.error('Native Google auth audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Native Google auth audit passed for Consumer, Owner, Business and Fleet.');
