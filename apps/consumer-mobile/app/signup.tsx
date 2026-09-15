import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { palette } from '../components/ConsumerUI';
import { useConsumerTheme } from '../services/theme';

type SignupIntent='individual'|'family';

export default function SignupScreen(){
 const theme=useConsumerTheme();
 const[intent,setIntent]=useState<SignupIntent>('individual'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const client=getKleenestSupabaseClient();
 async function signUp(){
  if(busy)return;setBusy(true);setMessage('');
  try{
   const normalized=email.trim().toLowerCase();
   if(!normalized||!normalized.includes('@'))throw new Error('Enter a valid email address.');
   if(password.length<8)throw new Error('Use a password with at least 8 characters.');
   const signup_intent=intent==='family'?'family':'individual';
   const{data,error}=await client.auth.signUp({email:normalized,password,options:{data:{signup_intent}}});
   if(error)throw error;
   if(data.session){
    setMessage(intent==='family'?'Account created. Continue to Family setup; Family benefits activate only through your eligible membership entitlement.':'Account created.');
    router.replace((intent==='family'?'/family':'/') as any);
   }else setMessage(intent==='family'?'Account created. Confirm your email, then sign in to finish Family setup. Family benefits activate only after the eligible membership entitlement is confirmed.':'Account created. Confirm your email, then sign in.');
  }catch(error:any){setMessage(error?.message||'Account could not be created.')}finally{setBusy(false)}
 }
 return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  <Text style={[s.eyebrow,{color:theme.accent}]}>JOIN KLEENEST</Text><Text style={[s.title,{color:theme.ink}]}>Choose how you want to start</Text><Text style={[s.copy,{color:theme.muted}]}>Create one secure Kleenest identity. Family signup records your intended experience; paid Family benefits are activated only by the authoritative membership entitlement.</Text>
  <View style={s.choiceRow}>
   <Pressable accessibilityRole="radio" accessibilityState={{selected:intent==='individual'}} onPress={()=>setIntent('individual')} style={[s.choice,{backgroundColor:theme.surface,borderColor:theme.line},intent==='individual'&&[s.choiceActive,{borderColor:theme.accent,backgroundColor:theme.accentSoft}]]}><Text style={[s.choiceKicker,{color:theme.accent}]}>INDIVIDUAL</Text><Text style={[s.choiceTitle,{color:theme.ink}]}>My Kleenest</Text><Text style={[s.choiceBody,{color:theme.muted}]}>Discovery, trust contributions, community, progression, saved bathrooms and routes.</Text></Pressable>
   <Pressable accessibilityRole="radio" accessibilityState={{selected:intent==='family'}} onPress={()=>setIntent('family')} style={[s.choice,{backgroundColor:theme.surface,borderColor:theme.line},intent==='family'&&[s.choiceActive,{borderColor:theme.accent,backgroundColor:theme.accentSoft}]]}><Text style={[s.choiceKicker,{color:theme.accent}]}>FAMILY</Text><Text style={[s.choiceTitle,{color:theme.ink}]}>Kleenest Family</Text><Text style={[s.choiceBody,{color:theme.muted}]}>Start with Family intent, then create or join your family group after the account is ready.</Text></Pressable>
  </View>
  <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.cardTitle,{color:theme.ink}]}>{intent==='family'?'Create a Family-ready account':'Create your account'}</Text><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="Email" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/><View style={[s.passwordRow,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><TextInput value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password" secureTextEntry={!showPassword} placeholder="Password (8+ characters)" placeholderTextColor={theme.muted} style={[s.passwordInput,{color:theme.ink}]}/><Pressable accessibilityRole="button" accessibilityLabel={showPassword?'Hide password':'Show password'} onPress={()=>setShowPassword(v=>!v)} style={[s.show,{backgroundColor:theme.accentSoft}]}><Text style={[s.showText,{color:theme.accent}]}>{showPassword?'HIDE':'SHOW'}</Text></Pressable></View><Pressable disabled={busy} onPress={signUp} style={[s.primary,{backgroundColor:theme.accent},busy&&{opacity:.5}]}><Text style={[s.primaryText,{color:theme.accentText}]}>{busy?'CREATING…':intent==='family'?'CREATE + CONTINUE TO FAMILY':'CREATE ACCOUNT'}</Text></Pressable>{message?<Text style={[s.message,{color:theme.muted}]}>{message}</Text>:null}</View>
  <View style={[s.note,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={[s.noteTitle,{color:theme.accent}]}>Membership safety</Text><Text style={[s.noteBody,{color:theme.muted}]}>Choosing Family here does not charge you and does not change your subscription tier. Any eligible digital membership activation remains server-authoritative and uses the approved Google Play purchase path.</Text></View>
  <View style={s.links}><Pressable onPress={()=>router.push('/profile')}><Text style={[s.link,{color:theme.accent}]}>Already have an account? Sign in</Text></Pressable><Pressable onPress={()=>router.push('/legal')}><Text style={[s.link,{color:theme.accent}]}>Terms · Privacy · Community Guidelines</Text></Pressable></View>
 </ScrollView></SafeAreaView>
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:palette.canvas},page:{padding:20,paddingBottom:50,gap:16},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.5,color:'#557060'},title:{fontSize:30,fontWeight:'900',color:palette.ink},copy:{fontSize:14,lineHeight:21,color:palette.muted},choiceRow:{gap:10},choice:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:20,padding:16,gap:5},choiceActive:{borderWidth:2,borderColor:palette.green,backgroundColor:'#eef6f1'},choiceKicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:palette.green},choiceTitle:{fontSize:20,fontWeight:'900',color:palette.ink},choiceBody:{fontSize:13,lineHeight:19,color:palette.muted},card:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:20,padding:16,gap:11},cardTitle:{fontSize:19,fontWeight:'900',color:palette.ink},input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:13,paddingHorizontal:12,paddingVertical:12,color:palette.ink},passwordRow:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#cbd9d0',borderRadius:13,overflow:'hidden'},passwordInput:{flex:1,paddingHorizontal:12,paddingVertical:12,color:palette.ink},show:{paddingHorizontal:12,paddingVertical:12,backgroundColor:'#edf3ef'},showText:{fontSize:10,fontWeight:'900',color:palette.green},primary:{backgroundColor:palette.green,borderRadius:13,padding:13,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900',fontSize:11,letterSpacing:.6},message:{fontSize:12,lineHeight:18,fontWeight:'700',color:'#53645a'},note:{backgroundColor:'#e8f2ec',borderRadius:18,padding:15,gap:4},noteTitle:{fontSize:14,fontWeight:'900',color:palette.green},noteBody:{fontSize:12,lineHeight:18,color:palette.muted},links:{gap:12,alignItems:'center'},link:{fontSize:12,fontWeight:'900',color:palette.green}});
