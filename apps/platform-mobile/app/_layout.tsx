import { useAppActivity } from '@kleenest/mobile-core';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, useColorScheme, View, type ColorValue } from 'react-native';
import { getKleenestSupabaseClient, loadKleenestThemeMode, resolveKleenestTheme, subscribeKleenestTheme, type KleenestThemeMode } from '@kleenest/mobile-core';

// Native Android uses default empty square placeholders unless tabs declare
// an icon. Emoji avoid a native icon-font dependency and work over Expo OTA.
function TabIcon({symbol,color}:{symbol:string;color:ColorValue}) {
  return <Text allowFontScaling={false} accessibilityElementsHidden style={{fontSize:21,lineHeight:25,textAlign:'center',color}}>{symbol}</Text>;
}

export default function Layout(){
  useAppActivity();
  const systemScheme=useColorScheme();
  const[themeMode,setThemeMode]=useState<KleenestThemeMode>('default');
  const theme=resolveKleenestTheme(themeMode,systemScheme==='dark','platform');
  const router=useRouter();
  const segments=useSegments();
  const[ready,setReady]=useState(false);
  const[signedIn,setSignedIn]=useState(false);
  const onAuthRoute=segments[0]==='auth';
  const onSearchRoute=segments[0]==='search';
  const onAccountRoute=segments[0]==='account';

  useEffect(()=>{
    let active=true;
    void loadKleenestThemeMode().then(mode=>{if(active)setThemeMode(mode)});
    const unsubscribe=subscribeKleenestTheme(mode=>{if(active)setThemeMode(mode)});
    return()=>{active=false;unsubscribe()};
  },[]);

  useEffect(()=>{
    let active=true;
    const client=getKleenestSupabaseClient();
    void client.auth.getSession().then(({data})=>{if(!active)return;setSignedIn(Boolean(data.session));setReady(true);});
    const{data:listener}=client.auth.onAuthStateChange((_event,session)=>{if(!active)return;setSignedIn(Boolean(session));setReady(true);});
    return()=>{active=false;listener.subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!ready)return;
    if(!signedIn&&!onAuthRoute)router.replace('/auth');
  },[ready,signedIn,onAuthRoute,router]);

  useEffect(()=>{
    if(!ready||!signedIn)return;
    let active=true;
    let syncing=false;
    const sync=async()=>{
      if(!active||syncing)return;
      syncing=true;
      try{
        const{syncRolePushRegistration}=await import('../services/push');
        await syncRolePushRegistration();
      }catch{
        // Registration is self-healing and non-blocking; Messaging shows repair state when needed.
      }finally{syncing=false}
    };
    const initialize=async()=>{
      if(!active||syncing)return;
      syncing=true;
      try{
        const{initializeRolePushAtLaunch}=await import('../services/push');
        await initializeRolePushAtLaunch();
      }catch{
        // Push setup remains non-blocking; Messaging exposes any repair state.
      }finally{syncing=false}
    };
    void initialize();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void sync()});
    return()=>{active=false;subscription.remove()};
  },[ready,signedIn]);

  if(!ready)return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:theme.canvas}}><ActivityIndicator size="large"/></View>;

  return <><StatusBar style={theme.statusBar}/><Tabs screenOptions={{
    headerStyle:{backgroundColor:theme.canvas},
    headerShadowVisible:false,
    headerTitle:'',
    headerTitleStyle:{color:theme.ink},
    tabBarActiveTintColor:theme.accent,
    tabBarInactiveTintColor:theme.muted,
    tabBarLabelStyle:{fontWeight:'800'},
    headerRight:onAuthRoute?undefined:()=> <View style={{flexDirection:'row',gap:7,marginRight:8}}>
      {!onSearchRoute?<Pressable accessibilityRole="button" accessibilityLabel="Search KleenestOS" onPress={()=>router.push('/search')} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:999,backgroundColor:theme.surfaceRaised,borderWidth:1,borderColor:theme.line}}><Text style={{fontWeight:'900',color:theme.accent}}>⌕ Search</Text></Pressable>:null}
      {!onAccountRoute?<Pressable accessibilityRole="button" accessibilityLabel="Open Owner profile and themes" onPress={()=>router.push('/account')} style={{paddingHorizontal:10,paddingVertical:7,borderRadius:999,backgroundColor:theme.surface,borderWidth:1,borderColor:theme.line}}><Text style={{fontWeight:'900',color:theme.accent}}>Profile</Text></Pressable>:null}
    </View>,
    tabBarStyle:onAuthRoute?{display:'none'}:{backgroundColor:theme.surface,borderTopColor:theme.line}
  }}>
    <Tabs.Screen name="index" options={{title:'Home',tabBarIcon:({color})=><TabIcon symbol="🏠" color={color}/>}}/>
    <Tabs.Screen name="control" options={{title:'Control',tabBarIcon:({color})=><TabIcon symbol="🎛️" color={color}/>}}/>
    <Tabs.Screen name="pilots" options={{title:'Pilots',tabBarIcon:({color})=><TabIcon symbol="🧭" color={color}/>}}/>
    <Tabs.Screen name="developers" options={{title:'Developers',tabBarLabel:'Dev',tabBarIcon:({color})=><TabIcon symbol="💻" color={color}/>}}/>
    <Tabs.Screen name="operations" options={{title:'Operations',tabBarLabel:'Ops',tabBarIcon:({color})=><TabIcon symbol="⚙️" color={color}/>}}/>
    <Tabs.Screen name="ingestion" options={{href:null,title:'Ingestion Control'}}/>
    <Tabs.Screen name="devices" options={{href:null,title:'IoT & Smart Devices'}}/>
    <Tabs.Screen name="businesses" options={{href:null,title:'Businesses'}}/>
    <Tabs.Screen name="moderation" options={{href:null,title:'Moderation'}}/>
    <Tabs.Screen name="access" options={{href:null,title:'Access'}}/>
    <Tabs.Screen name="search" options={{href:null,title:'Search',headerTitle:'Search'}}/>
    <Tabs.Screen name="auth" options={{href:null,title:'Sign in',headerShown:false}}/>
    <Tabs.Screen name="accounts" options={{href:null,title:'Accounts'}}/>
    <Tabs.Screen name="guest-insights" options={{href:null,title:'Guest Insights'}}/>
    <Tabs.Screen name="history" options={{href:null,title:'History'}}/>
    <Tabs.Screen name="ai-jobs" options={{href:null,title:"AI Jobs & Results"}}/>
    <Tabs.Screen name="intelligence" options={{href:null,title:'Intelligence'}}/>
    <Tabs.Screen name="reports" options={{href:null,title:'Reports'}}/>
    <Tabs.Screen name="growth" options={{href:null,title:'Growth'}}/>
    <Tabs.Screen name="progression" options={{href:null,title:'Progression'}}/>
    <Tabs.Screen name="passport" options={{href:null,title:'Passport'}}/>
    <Tabs.Screen name="capabilities" options={{href:null,title:'Capabilities'}}/>
    <Tabs.Screen name="audit" options={{href:null,title:'Audit'}}/>
    <Tabs.Screen name="data" options={{href:null,title:'Data'}}/>
    <Tabs.Screen name="location-duplicates" options={{href:null,title:'Duplicate Review'}}/>
    <Tabs.Screen name="location-consolidate" options={{href:null,title:'Consolidate Locations'}}/>
    <Tabs.Screen name="notifications" options={{href:null,title:'Live Network Messaging'}}/>
    <Tabs.Screen name="communications" options={{title:'Email',tabBarIcon:({color})=><TabIcon symbol="📧" color={color}/>}}/>
    <Tabs.Screen name="mail-admin" options={{href:null,title:'Mail Admin'}}/>
    <Tabs.Screen name="feedback-inbox" options={{href:null,title:'Tell Kleenest'}}/>
    <Tabs.Screen name="beta-incidents" options={{href:null,title:'Beta Incidents'}}/>
    <Tabs.Screen name="relevance" options={{href:null,title:'Relevance + Sponsorship'}}/>
    <Tabs.Screen name="support" options={{href:null,title:'Support'}}/>
    <Tabs.Screen name="terms" options={{href:null,title:'Terms'}}/>
    <Tabs.Screen name="privacy" options={{href:null,title:'Privacy'}}/>
    <Tabs.Screen name="account" options={{href:null,title:'Account',headerTitle:'Profile & Themes'}}/>
  </Tabs></>;
}
