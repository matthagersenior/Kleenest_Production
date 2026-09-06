import { Tabs, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const onAuthRoute = segments[0] === 'auth';

  useEffect(() => {
    let active = true;
    const client = getKleenestSupabaseClient();
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setReady(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!signedIn && !onAuthRoute) router.replace('/auth');
    else if (signedIn && onAuthRoute) router.replace('/');
  }, [ready, signedIn, onAuthRoute, router]);

  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f6f4' }}><ActivityIndicator size="large" /></View>;

  return <><StatusBar style="dark"/><Tabs screenOptions={{headerStyle:{backgroundColor:'#f3f6f4'},headerShadowVisible:false,tabBarActiveTintColor:'#173d2b',tabBarLabelStyle:{fontWeight:'800'},tabBarStyle:onAuthRoute?{display:'none'}:undefined}}>
    <Tabs.Screen name="index" options={{title:'Home'}}/>
    <Tabs.Screen name="locations" options={{title:'Locations'}}/>
    <Tabs.Screen name="engagement" options={{title:'Growth'}}/>
    <Tabs.Screen name="operations" options={{title:'Operations'}}/>
    <Tabs.Screen name="analytics" options={{title:'Analytics'}}/>
    <Tabs.Screen name="auth" options={{href:null,title:'Sign in',headerShown:false}}/>
    <Tabs.Screen name="workspaces" options={{href:null,title:'Workspaces'}}/>
    <Tabs.Screen name="profile" options={{href:null,title:'Profile'}}/>
    <Tabs.Screen name="members" options={{href:null,title:'People & Roles'}}/>
    <Tabs.Screen name="assistant" options={{href:null,title:'Kleenest AI'}}/>
    <Tabs.Screen name="reviews" options={{href:null,title:'Reviews'}}/>
    <Tabs.Screen name="qr-studio" options={{href:null,title:'QR Studio'}}/>
    <Tabs.Screen name="qr-designer" options={{href:null,title:'QR Designer'}}/>
    <Tabs.Screen name="live-network" options={{href:null,title:'Live Network'}}/>
    <Tabs.Screen name="progression" options={{href:null,title:'Progression'}}/>
    <Tabs.Screen name="intelligence" options={{href:null,title:'Intelligence'}}/>
    <Tabs.Screen name="capabilities" options={{href:null,title:'Capabilities'}}/>
    <Tabs.Screen name="growth" options={{href:null,title:'Growth Summary'}}/>
    <Tabs.Screen name="prevention" options={{href:null,title:'Prevention'}}/>
    <Tabs.Screen name="trust-operations" options={{href:null,title:'Trust Operations'}}/>
    <Tabs.Screen name="governance" options={{href:null,title:'Governance'}}/>
    <Tabs.Screen name="enterprise-economy" options={{href:null,title:'Enterprise Economy'}}/>
    <Tabs.Screen name="enterprise-locations" options={{href:null,title:'Enterprise Location'}}/>
    <Tabs.Screen name="enterprise" options={{href:null,title:'Enterprise'}}/>
    <Tabs.Screen name="partners" options={{href:null,title:'Partners'}}/>
    <Tabs.Screen name="notifications" options={{href:null,title:'Notifications'}}/>
    <Tabs.Screen name="support" options={{href:null,title:'Support'}}/>
    <Tabs.Screen name="terms" options={{href:null,title:'Terms'}}/>
    <Tabs.Screen name="privacy" options={{href:null,title:'Privacy'}}/>
    <Tabs.Screen name="account" options={{href:null,title:'Account'}}/>
  </Tabs></>;
}
