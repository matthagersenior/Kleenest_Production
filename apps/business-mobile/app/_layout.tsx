import { Tabs, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { currentBusinessId,subscribeBusinessWorkspaceChange } from '../services/capabilityWorkflows';
import { getBusinessOnboardingGate } from '../services/onboarding';

const ONBOARDING_BYPASS=new Set(['onboarding','workspaces','support','terms','privacy','account']);

export default function Layout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);
  const [gateReady,setGateReady]=useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [onboardingRequired,setOnboardingRequired]=useState(false);
  const [workspaceRevision,setWorkspaceRevision]=useState(0);
  const activeRoute=String(segments.at(-1)||'');
  const onAuthRoute = activeRoute === 'auth';

  useEffect(() => {
    let active = true;
    let listener: { subscription: { unsubscribe: () => void } } | null = null;
    let settled = false;
    const finish = (session: unknown) => {
      if (!active) return;
      settled = true;
      setSignedIn(Boolean(session));
      setReady(true);
    };
    const startupFallback = Platform.OS === 'web' ? setTimeout(() => {
      if (!active || settled) return;
      setSignedIn(false);
      setReady(true);
    }, 2500) : null;

    try {
      const client = getKleenestSupabaseClient();
      void client.auth.getSession()
        .then(({ data }) => finish(data.session))
        .catch(() => finish(null));
      const authListener = client.auth.onAuthStateChange((_event, session) => finish(session));
      listener = authListener.data;
    } catch {
      finish(null);
    }

    return () => {
      active = false;
      if (startupFallback !== null) clearTimeout(startupFallback);
      listener?.subscription.unsubscribe();
    };
  }, []);

  useEffect(()=>subscribeBusinessWorkspaceChange(()=>setWorkspaceRevision(value=>value+1)),[]);

  useEffect(()=>{
    if(!ready)return;
    let active=true;
    if(!signedIn){
      setOnboardingRequired(false);
      setGateReady(true);
      return()=>{active=false};
    }

    setGateReady(false);
    void (async()=>{
      try{
        const businessId=await currentBusinessId();
        const gate=await getBusinessOnboardingGate(businessId);
        if(!active)return;
        setOnboardingRequired(Boolean(gate?.required));
      }catch{
        if(!active)return;
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
    if(onboardingRequired&&!ONBOARDING_BYPASS.has(activeRoute))router.replace('/onboarding');
    if(onAuthRoute)router.replace(onboardingRequired?'/onboarding':'/');
  },[ready,gateReady,signedIn,onboardingRequired,onAuthRoute,activeRoute,router]);

  if (!ready || (signedIn&&!gateReady)) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f6f4' }}><ActivityIndicator size="large" /></View>;

  return <><StatusBar style="dark"/><Tabs key={`business-workspace-${workspaceRevision}`} screenOptions={{headerStyle:{backgroundColor:'#f3f6f4'},headerShadowVisible:false,tabBarActiveTintColor:'#173d2b',tabBarLabelStyle:{fontWeight:'800'},tabBarStyle:onAuthRoute||onboardingRequired?{display:'none'}:undefined}}>
    <Tabs.Screen name="index" options={{title:'Home'}}/>
    <Tabs.Screen name="tools" options={{title:'Actions'}}/>
    <Tabs.Screen name="locations" options={{title:'Locations'}}/>
    <Tabs.Screen name="engagement" options={{href:null,title:'Growth'}}/>
    <Tabs.Screen name="operations" options={{title:'Operations'}}/>
    <Tabs.Screen name="fleet" options={{href:null,title:'Fleet Suite'}}/>
    <Tabs.Screen name="analytics" options={{title:'Analytics'}}/>
    <Tabs.Screen name="auth" options={{href:null,title:'Sign in',headerShown:false}}/>
    <Tabs.Screen name="workspaces" options={{href:null,title:'Workspaces'}}/>
    <Tabs.Screen name="onboarding" options={{href:null,title:'Onboarding'}}/>
    <Tabs.Screen name="demo" options={{href:null,title:'Guided Demo'}}/>
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
    <Tabs.Screen name="governance" options={{href:null,title:'Governance & Reporting'}}/>
    <Tabs.Screen name="enterprise-economy" options={{href:null,title:'Enterprise Economy'}}/>
    <Tabs.Screen name="enterprise-locations" options={{href:null,title:'Enterprise Locations'}}/>
    <Tabs.Screen name="enterprise-location-admin" options={{href:null,title:'Enterprise Location Admin'}}/>
    <Tabs.Screen name="enterprise" options={{href:null,title:'Enterprise'}}/>
    <Tabs.Screen name="partners" options={{href:null,title:'Partners'}}/>
    <Tabs.Screen name="notifications" options={{href:null,title:'Notifications'}}/>
    <Tabs.Screen name="support" options={{href:null,title:'Support'}}/>
    <Tabs.Screen name="terms" options={{href:null,title:'Terms'}}/>
    <Tabs.Screen name="privacy" options={{href:null,title:'Privacy'}}/>
    <Tabs.Screen name="account" options={{href:null,title:'Account'}}/>
  </Tabs></>;
}
