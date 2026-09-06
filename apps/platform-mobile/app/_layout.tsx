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
    <Tabs.Screen name="businesses" options={{title:'Businesses'}}/>
    <Tabs.Screen name="moderation" options={{title:'Moderation'}}/>
    <Tabs.Screen name="access" options={{title:'Access'}}/>
    <Tabs.Screen name="operations" options={{title:'Operations'}}/>
    <Tabs.Screen name="auth" options={{href:null,title:'Sign in',headerShown:false}}/>
    <Tabs.Screen name="accounts" options={{href:null,title:'Accounts'}}/>
    <Tabs.Screen name="history" options={{href:null,title:'History'}}/>
    <Tabs.Screen name="intelligence" options={{href:null,title:'Intelligence'}}/>
    <Tabs.Screen name="reports" options={{href:null,title:'Reports'}}/>
    <Tabs.Screen name="progression" options={{href:null,title:'Progression'}}/>
    <Tabs.Screen name="capabilities" options={{href:null,title:'Capabilities'}}/>
    <Tabs.Screen name="audit" options={{href:null,title:'Audit'}}/>
    <Tabs.Screen name="data" options={{href:null,title:'Data'}}/>
    <Tabs.Screen name="notifications" options={{href:null,title:'Live Network Messaging'}}/>
    <Tabs.Screen name="support" options={{href:null,title:'Support'}}/>
    <Tabs.Screen name="terms" options={{href:null,title:'Terms'}}/>
    <Tabs.Screen name="privacy" options={{href:null,title:'Privacy'}}/>
    <Tabs.Screen name="account" options={{href:null,title:'Account'}}/>
  </Tabs></>;
}
