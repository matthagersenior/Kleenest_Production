import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '../components/ConsumerUI';
import { useConsumerTheme } from '../services/theme';
import { markConsumerAppSession } from '../services/webExperience';

type SignupIntent='individual'|'family';
type AccessMode='signin'|'signup';

function authRedirect(){
 if(Platform.OS!=='web'||typeof window==='undefined')return Linking.createURL('profile',{scheme:'kleenest',isTripleSlashed:false});
 const base=window.location.pathname.startsWith('/Kleenest_Production')?'/Kleenest_Production':'';
 return `${window.location.origin}${base}/profile/`;
}
function authUrlValue(url:string,key:string){const match=url.match(new RegExp(`[?#&]${key}=([^&#]+)`));return match?.[1]?decodeURIComponent(match[1].replace(/\+/g,' ')):''}

export default function SignupScreen(){
 const theme=useConsumerTheme();
 const params=useLocalSearchParams<{mode?:string}>();
 const[mode,setMode]=useState<AccessMode>(params.mode==='signup'?'signup':'signin');
 const[intent,setIntent]=useState<SignupIntent>('individual');
 const[email,setEmail]=useState('');
 const[password,setPassword]=useState('');
 const[showPassword,setShowPassword]=useState(false);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState('');
 const[needsConfirmation,setNeedsConfirmation]=useState(false);
 const client=getKleenestSupabaseClient();
 const redirectTo=authRedirect();

 async function handleAuthUrl(url:string|null){
  if(!url)return false;
  const parsed=Linking.parse(url);
  const code=typeof parsed.queryParams?.code==='string'?parsed.queryParams.code:authUrlValue(url,'code');
  const accessToken=authUrlValue(url,'access_token');
  const refreshToken=authUrlValue(url,'refresh_token');
  if(code){const{error}=await client.auth.exchangeCodeForSession(code);if(error)throw error}
  else if(accessToken&&refreshToken){const{error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});if(error)throw error}
  else return false;
  markConsumerAppSession();
  router.replace('/home' as any);
  return true;
 }

 function continueGuest(){
  markConsumerAppSession();
  router.replace('/explore' as any);
 }

 async function googleSignIn(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const{data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:Platform.OS!=='web'}});
   if(error)throw error;
   if(!data.url)throw new Error('Google sign-in could not be started.');
   if(Platform.OS==='web'&&typeof window!=='undefined')window.location.assign(data.url);
   else {
    const authResult=await WebBrowser.openAuthSessionAsync(data.url,redirectTo);
    if(authResult.type==='success'){
     const accepted=await handleAuthUrl(authResult.url);
     if(!accepted)throw new Error('Google sign-in returned without a usable Kleenest session.');
    }else if(authResult.type==='cancel'||authResult.type==='dismiss')setMessage('Google sign-in was cancelled.');
   }
  }catch(error:any){setMessage(error?.message||'Google sign-in could not be started.')}finally{setBusy(false)}
 }

 async function signIn(){
  if(busy)return;
  setBusy(true);setMessage('');setNeedsConfirmation(false);
  try{
   const normalized=email.trim().toLowerCase();
   if(!normalized||!normalized.includes('@'))throw new Error('Enter your email address.');
   if(!password)throw new Error('Enter your password.');
   const{error}=await client.auth.signInWithPassword({email:normalized,password});
   if(error)throw error;
   markConsumerAppSession();
   router.replace('/' as any);
  }catch(error:any){
   const text=String(error?.message||'Sign in failed.');
   if(/email.*not.*confirm|not.*confirm.*email/i.test(text)){
    setNeedsConfirmation(true);
    setMessage('Your account exists, but the email still needs to be confirmed. Resend the confirmation below.');
   }else if(/invalid login credentials/i.test(text)){
    setMessage('That email and password did not match. You can retry, reset your password from Profile, or create an account.');
   }else setMessage(text);
  }finally{setBusy(false)}
 }

 async function signUp(){
  if(busy)return;
  setBusy(true);setMessage('');setNeedsConfirmation(false);
  try{
   const normalized=email.trim().toLowerCase();
   if(!normalized||!normalized.includes('@'))throw new Error('Enter a valid email address.');
   if(password.length<8)throw new Error('Use a password with at least 8 characters.');
   const signup_intent=intent==='family'?'family':'individual';
   const{data,error}=await client.auth.signUp({email:normalized,password,options:{emailRedirectTo:redirectTo,data:{signup_intent}}});
   if(error)throw error;
   if(data.session){
    markConsumerAppSession();
    router.replace((intent==='family'?'/family':'/') as any);
    return;
   }
   setNeedsConfirmation(true);
   setMessage('Almost done — check your email to confirm the account. You can keep using Kleenest as a guest while you do that.');
  }catch(error:any){
   const text=String(error?.message||'Account could not be created.');
   if(/already.*registered|already.*exists|user.*exists/i.test(text)){
    setMode('signin');
    setMessage('You already have a Kleenest account. Sign in below instead.');
   }else setMessage(text);
  }finally{setBusy(false)}
 }

 async function resendConfirmation(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const normalized=email.trim().toLowerCase();
   if(!normalized||!normalized.includes('@'))throw new Error('Enter the email address for the account first.');
   const{error}=await client.auth.resend({type:'signup',email:normalized,options:{emailRedirectTo:redirectTo}});
   if(error)throw error;
   setNeedsConfirmation(true);
   setMessage('Confirmation email sent. You can continue as a guest while you check your inbox.');
  }catch(error:any){setMessage(error?.message||'Confirmation email could not be sent.')}finally{setBusy(false)}
 }

 return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <View style={s.header}>
   <Text style={[s.eyebrow,{color:theme.accent}]}>KLEENEST</Text>
   <Text style={[s.title,{color:theme.ink}]}>Get in quickly.</Text>
   <Text style={[s.copy,{color:theme.muted}]}>Find a bathroom now. Create an account only when you want saved places, trust history, progression and community to follow you.</Text>
  </View>

  <Pressable accessibilityRole="button" onPress={continueGuest} style={[s.guest,{backgroundColor:theme.accent}]}>
   <Text style={[s.guestTitle,{color:theme.accentText}]}>CONTINUE AS GUEST</Text>
   <Text style={[s.guestBody,{color:theme.accentText}]}>Open the map now · no account required</Text>
  </Pressable>

  <Pressable disabled={busy} accessibilityRole="button" onPress={googleSignIn} style={[s.google,{backgroundColor:theme.surface,borderColor:theme.line},busy&&s.disabled]}>
   <Text style={[s.googleTitle,{color:theme.ink}]}>Continue with Google</Text>
  </Pressable>

  <View style={s.orRow}><View style={[s.line,{backgroundColor:theme.line}]}/><Text style={[s.orText,{color:theme.muted}]}>OR USE EMAIL</Text><View style={[s.line,{backgroundColor:theme.line}]}/></View>

  <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
   <View style={[s.modeRow,{backgroundColor:theme.surfaceRaised}]}>
    <Pressable accessibilityRole="tab" accessibilityState={{selected:mode==='signin'}} accessibilityLabel="Sign in" onPress={()=>{setMode('signin');setMessage('');setNeedsConfirmation(false)}} style={[s.mode,mode==='signin'&&{backgroundColor:theme.surface}]}><Text style={[s.modeText,{color:mode==='signin'?theme.accent:theme.muted}]}>SIGN IN</Text></Pressable>
    <Pressable accessibilityRole="tab" accessibilityState={{selected:mode==='signup'}} accessibilityLabel="Create account" onPress={()=>{setMode('signup');setMessage('');setNeedsConfirmation(false)}} style={[s.mode,mode==='signup'&&{backgroundColor:theme.surface}]}><Text style={[s.modeText,{color:mode==='signup'?theme.accent:theme.muted}]}>CREATE ACCOUNT</Text></Pressable>
   </View>

   {mode==='signup'?<>
    <View style={s.intentRow}>
     <Pressable accessibilityRole="radio" accessibilityState={{selected:intent==='individual'}} accessibilityLabel="Just me, free consumer account" onPress={()=>setIntent('individual')} style={[s.intent,{borderColor:intent==='individual'?theme.accent:theme.line,backgroundColor:intent==='individual'?theme.accentSoft:theme.surfaceRaised}]}><Text style={[s.intentTitle,{color:theme.ink}]}>Just me</Text><Text style={[s.intentBody,{color:theme.muted}]}>Free consumer account</Text></Pressable>
     <Pressable accessibilityRole="radio" accessibilityState={{selected:intent==='family'}} accessibilityLabel="Family, set up Family after joining" onPress={()=>setIntent('family')} style={[s.intent,{borderColor:intent==='family'?theme.accent:theme.line,backgroundColor:intent==='family'?theme.accentSoft:theme.surfaceRaised}]}><Text style={[s.intentTitle,{color:theme.ink}]}>Family</Text><Text style={[s.intentBody,{color:theme.muted}]}>Set up Family after joining</Text></Pressable>
    </View>
    {intent==='family'?<Text style={[s.intentDisclosure,{color:theme.muted}]}>Choosing Family here does not charge you and does not change your subscription tier. Family benefits activate only through the approved membership purchase path.</Text>:null}
   </>:null}

   <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="Email" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
   <View style={[s.passwordRow,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} autoComplete={mode==='signin'?'password':'new-password'} secureTextEntry={!showPassword} placeholder={mode==='signin'?'Password':'Password · 8+ characters'} placeholderTextColor={theme.muted} style={[s.passwordInput,{color:theme.ink}]}/>
    <Pressable accessibilityRole="button" accessibilityLabel={showPassword?'Hide password':'Show password'} onPress={()=>setShowPassword(v=>!v)} style={[s.show,{backgroundColor:theme.accentSoft}]}><Text style={[s.showText,{color:theme.accent}]}>{showPassword?'HIDE':'SHOW'}</Text></Pressable>
   </View>

   <Pressable accessibilityRole="button" accessibilityLabel={mode==='signin'?'Sign in':'Create account'} accessibilityState={{disabled:busy}} disabled={busy} onPress={mode==='signin'?signIn:signUp} style={[s.primary,{backgroundColor:theme.accent},busy&&s.disabled]}><Text style={[s.primaryText,{color:theme.accentText}]}>{busy?'PLEASE WAIT…':mode==='signin'?'SIGN IN':'CREATE ACCOUNT'}</Text></Pressable>

   {needsConfirmation?<Pressable accessibilityRole="button" accessibilityLabel="Resend confirmation email" accessibilityState={{disabled:busy}} disabled={busy} onPress={resendConfirmation} style={[s.resend,{backgroundColor:theme.accentSoft,borderColor:theme.line},busy&&s.disabled]}><Text style={[s.resendText,{color:theme.accent}]}>RESEND CONFIRMATION EMAIL</Text></Pressable>:null}
   {message?<Text accessibilityLiveRegion="polite" style={[s.message,{color:theme.muted}]}>{message}</Text>:null}
  </View>

  <Text style={[s.guestNote,{color:theme.muted}]}>Guest access stays useful: discovery, map browsing and restroom details remain available. Kleenest asks you to join only when an action needs an identity, sync, trust attribution or rewards.</Text>
  <Pressable accessibilityRole="link" accessibilityLabel="Terms, privacy and community guidelines" onPress={()=>router.push('/legal')}><Text style={[s.legal,{color:theme.accent}]}>Terms · Privacy · Community Guidelines</Text></Pressable>
 </ScrollView></SafeAreaView>
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:palette.canvas},
 page:{padding:20,paddingBottom:50,gap:14},
 header:{gap:5,marginBottom:2},
 eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.8},
 title:{fontSize:34,lineHeight:39,fontWeight:'900'},
 copy:{fontSize:14,lineHeight:21},
 guest:{borderRadius:18,padding:17,alignItems:'center',gap:3},
 guestTitle:{fontSize:14,fontWeight:'900',letterSpacing:.8},
 guestBody:{fontSize:12,fontWeight:'700',opacity:.9},
 google:{borderWidth:1,borderRadius:16,padding:15,alignItems:'center'},
 googleTitle:{fontSize:14,fontWeight:'900'},
 orRow:{flexDirection:'row',alignItems:'center',gap:9},
 line:{height:1,flex:1},
 orText:{fontSize:9,fontWeight:'900',letterSpacing:1},
 card:{borderWidth:1,borderRadius:20,padding:15,gap:11},
 modeRow:{flexDirection:'row',borderRadius:13,padding:4},
 mode:{flex:1,paddingVertical:10,borderRadius:10,alignItems:'center'},
 modeText:{fontSize:10,fontWeight:'900',letterSpacing:.7},
 intentRow:{flexDirection:'row',gap:8},
 intent:{flex:1,borderWidth:1,borderRadius:13,padding:11},
 intentTitle:{fontSize:14,fontWeight:'900'},
 intentBody:{fontSize:10,lineHeight:14,marginTop:2},
 intentDisclosure:{fontSize:10,lineHeight:15,fontWeight:'700'},
 input:{borderWidth:1,borderRadius:13,paddingHorizontal:12,paddingVertical:13,fontSize:16},
 passwordRow:{flexDirection:'row',alignItems:'center',borderWidth:1,borderRadius:13,overflow:'hidden'},
 passwordInput:{flex:1,paddingHorizontal:12,paddingVertical:13,fontSize:16},
 show:{alignSelf:'stretch',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},
 showText:{fontSize:10,fontWeight:'900'},
 primary:{borderRadius:13,padding:14,alignItems:'center'},
 primaryText:{fontWeight:'900',fontSize:11,letterSpacing:.7},
 resend:{borderWidth:1,borderRadius:13,padding:12,alignItems:'center'},
 resendText:{fontSize:10,fontWeight:'900',letterSpacing:.5},
 message:{fontSize:12,lineHeight:18,fontWeight:'700'},
 guestNote:{fontSize:12,lineHeight:18,textAlign:'center',paddingHorizontal:5},
 legal:{fontSize:11,fontWeight:'900',textAlign:'center'},
 disabled:{opacity:.55},
});
