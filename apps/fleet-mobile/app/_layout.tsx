import { Tabs, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, useColorScheme, View } from 'react-native';
import { getKleenestSupabaseClient, loadKleenestThemeMode, resolveKleenestTheme, subscribeKleenestTheme, type KleenestThemeMode } from '@kleenest/mobile-core';
import { currentFleetBusinessId,getFleetWorkspaceAccess,subscribeFleetWorkspaceChange,type FleetWorkspaceRole } from '../services/control';
import { getFleetOnboardingGate } from '../services/onboarding';

const ONBOARDING_BYPASS=new Set(['onboarding','workspaces','support','terms','privacy','account','search']);
const MEMBER_ALLOWED=new Set(['member','nearby','notifications','workspaces','support','terms','privacy','account','auth','search']);

export default function Layout(){
  const systemScheme=useColorScheme();
  const[themeMode,setThemeMode]=useState<KleenestThemeMode>('default');
  const theme=resolveKleenestTheme(themeMode,systemScheme==='dark','fleet');
  const router=useRouter();
  const segments=useSegments();
  const[ready,setReady]=useState(false);
  const[gateReady,setGateReady]=useState(false);
  const[signedIn,setSignedIn]=useState(false);
  const[onboardingRequired,setOnboardingRequired]=useState(false);
  const[needsBusinessSetup,setNeedsBusinessSetup]=useState(false);
  const[workspaceRole,setWorkspaceRole]=useState<FleetWorkspaceRole|null>(null);
  const[workspaceRevision,setWorkspaceRevision]=useState(0);
  const activeRoute=String(segments.at(-1)||'');
  const onAuthRoute=activeRoute==='auth';
  const operator=workspaceRole==='operator';

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

  useEffect(()=>subscribeFleetWorkspaceChange(()=>setWorkspaceRevision(value=>value+1)),[]);

  useEffect(()=>{
    if(!ready)return;
    let active=true;
    if(!signedIn){
      setWorkspaceRole(null);
      setOnboardingRequired(false);
      setNeedsBusinessSetup(false);
      setGateReady(true);
      return()=>{active=false};
    }

    setGateReady(false);
    void (async()=>{
      try{
        const businessId=await currentFleetBusinessId();
        const access=await getFleetWorkspaceAccess(businessId);
        if(!active)return;
        setNeedsBusinessSetup(false);
        setWorkspaceRole(access.workspace_role);
        if(access.workspace_role==='operator'){
          const gate=await getFleetOnboardingGate(businessId);
          if(!active)return;
          setOnboardingRequired(Boolean(gate?.required));
        }else{
          setOnboardingRequired(false);
        }
      }catch{
        if(!active)return;
        setWorkspaceRole(null);
        setNeedsBusinessSetup(true);
        setOnboardingRequired(false);
      }finally{
        if(active)setGateReady(true);
      }
    })();
    return()=>{active=false};
  },[ready,signedIn,workspaceRevision]);

  useEffect(()=>{
    if(!ready||!gateReady)return;
    if(!signedIn){
      if(!onAuthRoute)router.replace('/auth');
      return;
    }
    if(onAuthRoute)return;
    if(needsBusinessSetup){
      if(!onAuthRoute)router.replace('/auth');
      return;
    }
    if(workspaceRole&&workspaceRole!=='operator'){
      if(onAuthRoute||activeRoute===''||!MEMBER_ALLOWED.has(activeRoute))router.replace('/member');
      return;
    }
    if(onboardingRequired&&!ONBOARDING_BYPASS.has(activeRoute))router.replace('/onboarding');
  },[ready,gateReady,signedIn,needsBusinessSetup,workspaceRole,onboardingRequired,onAuthRoute,activeRoute,router]);

  if(!ready||(signedIn&&!gateReady))return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:theme.canvas}}><ActivityIndicator size="large"/></View>;

  return <><StatusBar style={theme.statusBar}/><Tabs key={'fleet-workspace-'+workspaceRevision+'-'+String(workspaceRole)} screenOptions={{headerStyle:{backgroundColor:theme.canvas},headerShadowVisible:false,headerTitleStyle:{color:theme.ink},tabBarActiveTintColor:theme.accent,tabBarInactiveTintColor:theme.muted,tabBarLabelStyle:{fontWeight:'800'},headerRight:activeRoute==='search'?undefined:()=> <Pressable accessibilityRole="button" accessibilityLabel="Search Fleet" onPress={()=>router.push('/search')} style={{paddingHorizontal:11,paddingVertical:7,borderRadius:999,backgroundColor:theme.surfaceRaised,borderWidth:1,borderColor:theme.line}}><Text style={{fontWeight:'900',color:theme.accent}}>⌕ Search</Text></Pressable>,tabBarStyle:onAuthRoute||onboardingRequired||needsBusinessSetup?{display:'none'}:{backgroundColor:theme.surface,borderTopColor:theme.line}}}>
    <Tabs.Screen name="index" options={{title:'Home',href:operator?undefined:null}}/>
    <Tabs.Screen name="planner" options={{title:'Planner',href:operator?undefined:null}}/>
    <Tabs.Screen name="dispatch" options={{title:'Dispatch',href:operator?undefined:null}}/>
    <Tabs.Screen name="assets" options={{title:'Assets',href:operator?undefined:null}}/>
    <Tabs.Screen name="operations" options={{title:'Operations',href:operator?undefined:null}}/>
    <Tabs.Screen name="member" options={{title:'For Me',href:operator?null:undefined}}/>
    <Tabs.Screen name="nearby" options={{title:'Nearby',href:operator?null:undefined}}/>
    <Tabs.Screen name="notifications" options={{title:'Alerts'}}/>
    <Tabs.Screen name="account" options={{title:'Account'}}/>
    <Tabs.Screen name="search" options={{href:null,title:'Search'}}/>
    <Tabs.Screen name="auth" options={{href:null,title:'Sign in',headerShown:false}}/>
    <Tabs.Screen name="coverage" options={{href:null,title:'Route Coverage'}}/>
    <Tabs.Screen name="execution" options={{href:null,title:'Execution'}}/>
    <Tabs.Screen name="signals" options={{href:null,title:'Live Network'}}/>
    <Tabs.Screen name="metrics" options={{href:null,title:'Metrics'}}/>
    <Tabs.Screen name="sync" options={{href:null,title:'Offline & Sync'}}/>
    <Tabs.Screen name="maintenance" options={{href:null,title:'Maintenance'}}/>
    <Tabs.Screen name="insights" options={{href:null,title:'Insights'}}/>
    <Tabs.Screen name="enterprise" options={{href:null,title:'Enterprise'}}/>
    <Tabs.Screen name="premium" options={{href:null,title:'Premium'}}/>
    <Tabs.Screen name="progression" options={{href:null,title:'Progression'}}/>
    <Tabs.Screen name="capabilities" options={{href:null,title:'Capabilities'}}/>
    <Tabs.Screen name="workspaces" options={{href:null,title:'Workspaces'}}/>
    <Tabs.Screen name="onboarding" options={{href:null,title:'Onboarding'}}/>
    <Tabs.Screen name="demo" options={{href:null,title:'Guided Demo'}}/>
    <Tabs.Screen name="support" options={{href:null,title:'Support'}}/>
    <Tabs.Screen name="terms" options={{href:null,title:'Terms'}}/>
    <Tabs.Screen name="privacy" options={{href:null,title:'Privacy'}}/>
  </Tabs></>;
}
