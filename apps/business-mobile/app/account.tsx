import * as Linking from 'expo-linking';
import { getKleenestSupabaseClient, KLEENEST_THEME_OPTIONS, loadKleenestThemeMode, resolveKleenestTheme, setKleenestThemeMode, subscribeKleenestTheme, type KleenestThemeMode } from '@kleenest/mobile-core';
import { useEffect,useState } from 'react';
import { Pressable,ScrollView,StyleSheet,Text,TextInput,useColorScheme,View } from 'react-native';

function authUrlValue(url:string,key:string){
  const match=url.match(new RegExp(`[?#&]${key}=([^&#]+)`));
  return match?.[1]?decodeURIComponent(match[1].replace(/\+/g,' ')):'';
}

export default function Account(){
  const systemScheme=useColorScheme();
  const[themeMode,setThemeModeState]=useState<KleenestThemeMode>('default');
  const theme=resolveKleenestTheme(themeMode,systemScheme==='dark','business');
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[signedIn,setSignedIn]=useState(''),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const client=getKleenestSupabaseClient();
  const mobileAuthRedirect=Linking.createURL('/account',{scheme:'kleenest-business'});

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
      setMessage('Signed in with Google. Business workspace selection will resolve automatically.');
      await refresh();
      return true;
    }catch(error:any){
      setMessage(error?.message||'Google sign-in could not be completed.');
      return false;
    }
  }

  useEffect(()=>{let active=true;void loadKleenestThemeMode().then(mode=>{if(active)setThemeModeState(mode)});const unsubscribe=subscribeKleenestTheme(mode=>{if(active)setThemeModeState(mode)});return()=>{active=false;unsubscribe()}},[]);
  async function chooseTheme(mode:KleenestThemeMode){setThemeModeState(mode);await setKleenestThemeMode(mode)}

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
      setMessage('Signed in. Business workspace selection will resolve automatically.');
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

  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page,{backgroundColor:theme.canvas}]}>
    <Text style={[s.title,{color:theme.ink}]}>Account control</Text>
    <Text style={[s.body,{color:theme.muted}]}>{signedIn?`Signed in as ${signedIn}`:'Sign in with the Kleenest account authorized for this Business workspace.'}</Text>
    <View style={[s.themeCard,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.themeHeading,{color:theme.ink}]}>Appearance</Text><Text style={[s.themeCopy,{color:theme.muted}]}>Choose Default, Light, Dark, or follow the device. Business keeps its own workspace accent.</Text><View accessibilityRole="radiogroup" style={s.themeRow}>{KLEENEST_THEME_OPTIONS.map(option=>{const selected=themeMode===option.value;return <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{selected}} onPress={()=>void chooseTheme(option.value)} style={[s.themeButton,{backgroundColor:selected?theme.accent:theme.surfaceRaised,borderColor:selected?theme.accent:theme.line}]}><Text style={[s.themeButtonText,{color:selected?theme.accentText:theme.ink}]}>{option.label}</Text></Pressable>})}</View></View>
    {!signedIn?<View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1}]}>
      <TextInput autoCapitalize="none" keyboardType="email-address" style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]} placeholderTextColor={theme.muted} placeholder="Email" value={email} onChangeText={setEmail}/>
      <View style={[s.passwordRow,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><TextInput secureTextEntry={!showPassword} autoCapitalize="none" style={[s.input,{flex:1,borderWidth:0,backgroundColor:theme.surfaceRaised,color:theme.ink}]} placeholderTextColor={theme.muted} placeholder="Password" value={password} onChangeText={setPassword}/><Pressable accessibilityRole="button" accessibilityLabel={showPassword?'Hide password':'Show password'} onPress={()=>setShowPassword(v=>!v)} style={s.eye}><Text style={[s.eyeText,{color:theme.accent}]}>{showPassword?'Hide':'Show'}</Text></Pressable></View>
      <Pressable style={[s.primary,{backgroundColor:theme.accent},busy&&s.disabled]} disabled={busy} onPress={signIn}><Text style={[s.primaryText,{color:theme.accentText}]}>{busy?'Working…':'Sign in'}</Text></Pressable>
      <Text style={[s.or,{color:theme.muted}]}>or</Text>
      <Pressable style={[s.secondary,{backgroundColor:theme.accentSoft,borderColor:theme.line,borderWidth:1},busy&&s.disabled]} disabled={busy} onPress={googleSignIn}><Text style={[s.secondaryText,{color:theme.accent}]}>Continue with Google</Text></Pressable>
    </View>:<Pressable style={[s.secondary,{backgroundColor:theme.accentSoft,borderColor:theme.line,borderWidth:1}]} onPress={signOut}><Text style={[s.secondaryText,{color:theme.accent}]}>Sign out</Text></Pressable>}
    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line,borderWidth:1}]}><Text style={[s.body,{color:theme.muted}]}>Request deletion of your Kleenest identity and associated eligible data.</Text><TextInput style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]} placeholderTextColor={theme.muted} placeholder="Optional reason" value={reason} onChangeText={setReason}/><Pressable style={[s.danger,{backgroundColor:theme.danger}]} onPress={deletion}><Text style={s.dangerText}>Request account deletion</Text></Pressable></View>
    {message?<Text accessibilityLiveRegion="polite" style={[s.body,{color:theme.muted}]}>{message}</Text>:null}
  </ScrollView>
}

const s=StyleSheet.create({themeCard:{padding:14,borderRadius:18,borderWidth:1,gap:8},themeHeading:{fontSize:16,fontWeight:'900'},themeCopy:{fontSize:12,lineHeight:18},themeRow:{flexDirection:'row',flexWrap:'wrap',gap:7},themeButton:{paddingHorizontal:11,paddingVertical:9,borderRadius:999,borderWidth:1},themeButtonText:{fontSize:11,fontWeight:'900'},page:{padding:20,gap:12,backgroundColor:'#f3f6f4'},title:{fontSize:28,fontWeight:'900',color:'#102218'},body:{fontSize:14,lineHeight:21,color:'#56665d'},card:{backgroundColor:'#fff',padding:16,borderRadius:18,gap:9},input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,padding:12},passwordRow:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,flexDirection:'row',alignItems:'center',overflow:'hidden'},eye:{paddingHorizontal:13,paddingVertical:12},eyeText:{fontWeight:'900',color:'#173d2b'},primary:{backgroundColor:'#173d2b',padding:12,borderRadius:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},secondary:{backgroundColor:'#edf3ef',padding:12,borderRadius:12,alignItems:'center'},secondaryText:{color:'#173d2b',fontWeight:'900'},or:{textAlign:'center',color:'#7a8a80',fontSize:12,fontWeight:'700'},disabled:{opacity:.55},danger:{backgroundColor:'#7b2f2f',padding:12,borderRadius:12,alignItems:'center'},dangerText:{color:'#fff',fontWeight:'900'}});
