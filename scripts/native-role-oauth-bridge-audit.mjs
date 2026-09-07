import fs from 'node:fs';

const failures=[];
const read=path=>fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const must=(ok,message)=>{if(!ok)failures.push(message)};
const requireAll=(path,label,tokens)=>{const source=read(path);if(!source)failures.push(`${label}: missing ${path}`);for(const token of tokens)if(!source.includes(token))failures.push(`${label}: missing ${token}`);return source;};

const helper=requireAll('packages/mobile-core/src/index.ts','shared native OAuth bridge helper',[
  'getHostedNativeGoogleSignInUrl',
  'business',
  'fleet',
  'owner',
  'native-auth',
]);

for(const [role,authPath,accountPath] of [
  ['business','apps/business-mobile/app/auth.tsx','apps/business-mobile/app/account.tsx'],
  ['fleet','apps/fleet-mobile/app/auth.tsx','apps/fleet-mobile/app/account.tsx'],
  ['owner','apps/platform-mobile/app/auth.tsx','apps/platform-mobile/app/account.tsx'],
]){
  for(const path of [authPath,accountPath]){
    const source=requireAll(path,`${role} Google auth bridge`,[
      'getHostedNativeGoogleSignInUrl',
      `getHostedNativeGoogleSignInUrl('${role}')`,
      'Linking.openURL',
      'Continue with Google',
    ]);
    must(!source.includes("signInWithOAuth({provider:'google'"),`${role}: ${path} must not ask Supabase to redirect directly into a custom native scheme.`);
  }
}

const starter=requireAll('apps/consumer-mobile/app/native-auth.tsx','deployed web OAuth starter',[
  'kleenest.native_oauth_target.v1',
  "provider:'google'",
  'signInWithOAuth',
  'sessionStorage.setItem',
  'window.location.assign',
  'business',
  'fleet',
  'owner',
]);

const profile=requireAll('apps/consumer-mobile/app/profile.tsx','deployed web-to-native OAuth handoff',[
  'kleenest.native_oauth_target.v1',
  'kleenest-business://auth',
  'kleenest-fleet://auth',
  'kleenest-owner://auth',
  'access_token',
  'refresh_token',
  'sessionStorage.removeItem',
  'window.location.replace',
  'Open ',
]);
const consumeIndex=profile.indexOf('sessionStorage.removeItem');
const autoOpenIndex=profile.indexOf('window.location.replace');
must(consumeIndex>=0&&autoOpenIndex>=0&&consumeIndex<autoOpenIndex,'web-to-native OAuth handoff must consume the pending app target before auto-opening the native app so dismiss cannot recreate the loop.');

if(failures.length){console.error(`Native role OAuth bridge audit failed with ${failures.length} gap(s):`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1);}
console.log('Native role OAuth bridge audit passed: Business, Fleet and KleenestOS use a one-shot hosted Google callback bridge with dismiss-safe native handoff.');
