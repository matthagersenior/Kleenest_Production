import * as Linking from 'expo-linking';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { useEffect,useState } from 'react';
import { Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';

function authUrlValue(url:string,key:string){
  const match=url.match(new RegExp(`[?#&]${key}=([^&#]+)`));
  return match?.[1]?decodeURIComponent(match[1].replace(/\+/g,' ')):'';
}

export default function Account(){
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[signedIn,setSignedIn]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const client=getKleenestSupabaseClient();
  const mobileAuthRedirect=Linking.createURL('/account',{scheme:'kleenest-fleet'});

  async function refresh(){
    const{data}=await client.auth.getUser();
    setSignedIn(data.user?.email||'');
  }

  async function handleAuthUrl(url:string|null){
    if(!url)return false;
    try{
      const parsed=Linking.parse(url);
      const code=typeof parsed.queryParams?.code==='string'?parsed.queryParams.code:authUrlValue(url,'code');
      const accessToken=authUrlValue(url,'access_token');
      const refreshToken=authUrlValue(url,'refresh_token');
      if(code){
        const{error}=await client.auth.exchangeCodeForSession(code);
        if(error)throw error;
      }else if(accessToken&&refreshToken){
        const{error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
        if(error)throw error;
      }else return false;
      setMessage('Signed in with Google. Fleet workspace selection will resolve automatically.');
      await refresh();
      return true;
    }catch(error:any){
      setMessage(error?.message||'Google sign-in could not be completed.');
      return false;
    }
  }

  useEffect(()=>{
    void refresh();
    void Linking.getInitialURL().then(handleAuthUrl);
    const auth=client.auth.onAuthStateChange(()=>{void refresh()});
    const link=Linking.addEventListener('url',event=>{void handleAuthUrl(event.url)});
    return()=>{auth.data.subscription.unsubscribe();link.remove()};
  },[]);

  async function signIn(){
    if(busy)return;
    setBusy(true);
    try{
      const{error}=await client.auth.signInWithPassword({email:email.trim(),password});
      if(error)throw error;
      setMessage('Signed in. Fleet workspace selection will resolve automatically.');
      await refresh();
    }catch(error:any){setMessage(error?.message||'Sign in failed.')}finally{setBusy(false)}
  }

  async function googleSignIn(){
    if(busy)return;
    setBusy(true);
    try{
      const{data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:mobileAuthRedirect,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
      if(error)throw error;
      if(!data.url)throw new Error('Google sign-in did not return an authorization URL.');
      setMessage('Opening Google sign-in…');
      await Linking.openURL(data.url);
    }catch(error:any){setMessage(error?.message||'Google sign-in could not be started.')}finally{setBusy(false)}
  }

  async function signOut(){await client.auth.signOut({scope:'local'});setMessage('Signed out.');await refresh()}
  async function deletion(){const{error}=await client.rpc('request_account_deletion',{p_reason:reason.trim()||null});setMessage(error?error.message:'Account deletion request submitted.')}

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
    <Text style={s.title}>Account control</Text>
    <Text style={s.body}>{signedIn?`Signed in as ${signedIn}`:'Sign in with a Fleet-enabled Kleenest Business account.'}</Text>
    {!signedIn?<View style={s.card}>
      <TextInput autoCapitalize="none" keyboardType="email-address" style={s.input} placeholder="Email" value={email} onChangeText={setEmail}/>
      <View style={s.passwordRow}><TextInput secureTextEntry={!showPassword} autoCapitalize="none" style={[s.input,{flex:1,borderWidth:0}]} placeholder="Password" value={password} onChangeText={setPassword}/><Pressable accessibilityRole="button" accessibilityLabel={showPassword?'Hide password':'Show password'} onPress={()=>setShowPassword(v=>!v)} style={s.eye}><Text style={s.eyeText}>{showPassword?'Hide':'Show'}</Text></Pressable></View>
      <Pressable style={[s.primary,busy&&s.disabled]} disabled={busy} onPress={signIn}><Text style={s.primaryText}>{busy?'Working…':'Sign in'}</Text></Pressable>
      <Text style={s.or}>or</Text>
      <Pressable style={[s.secondary,busy&&s.disabled]} disabled={busy} onPress={googleSignIn}><Text style={s.secondaryText}>Continue with Google</Text></Pressable>
    </View>:<Pressable style={s.secondary} onPress={signOut}><Text style={s.secondaryText}>Sign out</Text></Pressable>}
    <View style={s.card}><Text style={s.body}>Request deletion of your Kleenest identity and associated eligible data.</Text><TextInput style={s.input} placeholder="Optional reason" value={reason} onChangeText={setReason}/><Pressable style={s.danger} onPress={deletion}><Text style={s.dangerText}>Request account deletion</Text></Pressable></View>
    {message?<Text accessibilityLiveRegion="polite" style={s.body}>{message}</Text>:null}
  </ScrollView>
}

const s=StyleSheet.create({page:{padding:20,gap:12,backgroundColor:'#f3f6f4'},title:{fontSize:28,fontWeight:'900',color:'#102218'},body:{fontSize:14,lineHeight:21,color:'#56665d'},card:{backgroundColor:'#fff',padding:16,borderRadius:18,gap:9},input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,padding:12},passwordRow:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,flexDirection:'row',alignItems:'center',overflow:'hidden'},eye:{paddingHorizontal:13,paddingVertical:12},eyeText:{fontWeight:'900',color:'#173d2b'},primary:{backgroundColor:'#173d2b',padding:12,borderRadius:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},secondary:{backgroundColor:'#edf3ef',padding:12,borderRadius:12,alignItems:'center'},secondaryText:{color:'#173d2b',fontWeight:'900'},or:{textAlign:'center',color:'#7a8a80',fontSize:12,fontWeight:'700'},disabled:{opacity:.55},danger:{backgroundColor:'#7b2f2f',padding:12,borderRadius:12,alignItems:'center'},dangerText:{color:'#fff',fontWeight:'900'}});
