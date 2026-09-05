import fs from 'node:fs';
const profile=fs.readFileSync('apps/consumer-mobile/app/profile.tsx','utf8');
const compact=profile.replace(/\s+/g,'');
const failures=[];
if(!profile.includes('Continue with Google'))failures.push('Consumer must expose a visible Continue with Google action.');
if(!compact.includes("provider:'google'")&&!compact.includes('provider:"google"'))failures.push('Consumer must authenticate with the canonical Supabase Google provider.');
if(!profile.includes('signInWithOAuth'))failures.push('Consumer must initiate Google authentication through Supabase OAuth.');
if(!profile.includes('skipBrowserRedirect:true'))failures.push('Consumer native OAuth must hand browser navigation to the app.');
if(!profile.includes('mobileAuthRedirect')||!profile.includes('Linking.openURL'))failures.push('Consumer Google OAuth must return through the Kleenest mobile deep link.');
if(!profile.includes('exchangeCodeForSession'))failures.push('Consumer must exchange the OAuth callback code for a Supabase session.');
if(failures.length){console.error('Native Google auth audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native Google auth audit passed.');
