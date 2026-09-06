import { Tabs, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export default function Layout(){
  const router=useRouter();
  const segments=useSegments();
  const[ready,setReady]=useState(false);
  const[signedIn,setSignedIn]=useState(false);
  const onAuthRoute=segments[0]==='auth';

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
    else if(signedIn&&onAuthRoute)router.replace('/');
  },[ready,signedIn,onAuthRoute,router]);

  if(!ready)return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f3f6f4'}}><ActivityIndicator size="large"/></View>;

  return <><StatusBar style="dark"/><Tabs screenOptions={{headerStyle:{backgroundColor:'#f3f6f4'},headerShadowVisible:false,tabBarActiveTintColor:'#173d2b',tabBarLabelStyle:{fontWeight:'800'},tabBarStyle:onAuthRoute?{display:'none'}:undefined}}>
    <Tabs.Screen name="index" options={{title:'Home'}}/>
    <Tabs.Screen name="planner" options={{title:'Planner'}}/>
    <Tabs.Screen name="dispatch" options={{title:'Dispatch'}}/>
    <Tabs.Screen name="assets" options={{title:'Assets'}}/>
    <Tabs.Screen name="operations" options={{title:'Operations'}}/>
    <Tabs.Screen name="auth" options={{href:null,title:'Sign in',headerShown:false}}/>
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
    <Tabs.Screen name="notifications" options={{href:null,title:'Notifications'}}/>
    <Tabs.Screen name="support" options={{href:null,title:'Support'}}/>
    <Tabs.Screen name="terms" options={{href:null,title:'Terms'}}/>
    <Tabs.Screen name="privacy" options={{href:null,title:'Privacy'}}/>
    <Tabs.Screen name="account" options={{href:null,title:'Account'}}/>
  </Tabs></>;
}
