import fs from 'node:fs';

const file=new URL('../apps/consumer-mobile/app/profile.tsx',import.meta.url);
let source=fs.readFileSync(file,'utf8');

const functionMarker='  async function googleSignIn()';
if(!source.includes(functionMarker)){
  const anchor='  async function signUp()';
  if(!source.includes(anchor))throw new Error('Consumer Google auth patch drifted: signUp anchor missing.');
  const google=`  async function googleSignIn(){if(busy)return;setBusy(true);try{const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:mobileAuthRedirect,skipBrowserRedirect:true}});if(error)throw error;if(!data.url)throw new Error('Google sign-in did not return an authorization URL.');setMessage('Opening Google sign-in…');await Linking.openURL(data.url)}catch(error:any){setMessage(error?.message||'Google sign-in could not be started.')}finally{setBusy(false)}}\n`;
  source=source.replace(anchor,google+anchor);
}

const button='<Pressable style={[s.secondary,busy&&s.disabled]} disabled={busy} onPress={googleSignIn}><Text style={s.secondaryText}>Continue with Google</Text></Pressable>';
if(!source.includes(button)){
  const anchor='      <TextInput style={s.input} value={email}';
  if(!source.includes(anchor))throw new Error('Consumer Google auth patch drifted: signed-out email field anchor missing.');
  source=source.replace(anchor,`      ${button}\n${anchor}`);
}

fs.writeFileSync(file,source);
console.log('Consumer Google OAuth flow patched into native profile sign-in.');
