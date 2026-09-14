import * as Notifications from 'expo-notifications';
import { loadKleenestThemeMode, markMobileNotificationRead, resolveKleenestTheme, subscribeKleenestTheme, type KleenestThemeMode } from '@kleenest/mobile-core';
import { router, Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState,Platform,Text,View,useColorScheme, type ColorValue } from 'react-native';
import { notificationDestination } from '../services/notificationRouting';
import { refreshConsumerLiveNetworkRegions } from '../services/liveNetwork';
import { refreshConsumerPresence } from '../services/presence';
import PolicyAcceptanceGate from '../components/PolicyAcceptanceGate';
import { relayOperatorOAuthCallback } from '../services/operatorOAuthRelay';
import { useConsumerWebExperience } from '../services/webExperience';
import BetaReportButton from '../components/BetaReportButton';
import { flushQueuedBetaReports,recordBetaBreadcrumb } from '../services/betaReporting';

const operatorOAuthRelaying=relayOperatorOAuthCallback();

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

const handledNotificationResponses=new Set<string>();
async function openNotificationResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const responseKey=`${response.notification.request.identifier}:${response.actionIdentifier}`;
  if(handledNotificationResponses.has(responseKey))return;
  handledNotificationResponses.add(responseKey);
  const data = response.notification.request.content.data || {};
  const notificationId = typeof data.notification_id === 'string' ? data.notification_id : '';
  if (notificationId) await markMobileNotificationRead(notificationId).catch(() => {});
  const destination = notificationDestination({ type: typeof data.type === 'string' ? data.type : null, data });
  if (destination) router.push(destination as any);
}

const tabIcon=(glyph:string)=>(props:{color:ColorValue;focused:boolean;size:number})=><Text accessible={false} style={{fontSize:props.focused?20:18,color:props.color,fontWeight:'900'}}>{glyph}</Text>;

export default function RootLayout() {
  const pathname=usePathname();
  const systemScheme=useColorScheme();
  const[themeMode,setThemeMode]=useState<KleenestThemeMode>('default');
  const theme=resolveKleenestTheme(themeMode,systemScheme==='dark','consumer');
  const {ready:webGateReady,appActive}=useConsumerWebExperience();
  const publicWeb=Platform.OS==='web'&&!appActive&&webGateReady&&['/','/for-you','/for-business','/trust','/install'].includes(pathname);
  useEffect(()=>{
    let active=true;
    void loadKleenestThemeMode().then(mode=>{if(active)setThemeMode(mode)});
    const unsubscribe=subscribeKleenestTheme(mode=>{if(active)setThemeMode(mode)});
    return()=>{active=false;unsubscribe()};
  },[]);
  useEffect(()=>{if(!publicWeb)recordBetaBreadcrumb('route',pathname)},[pathname,publicWeb]);
  useEffect(() => {
    if(operatorOAuthRelaying)return;
    let active=true;
    Notifications.getLastNotificationResponseAsync().then(async response=>{if(!active)return;await openNotificationResponse(response);if(response)await Notifications.clearLastNotificationResponseAsync().catch(()=>{})}).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(response => { void openNotificationResponse(response); });
    const refreshLocationState=()=>{void refreshConsumerPresence().catch(()=>{});void refreshConsumerLiveNetworkRegions().catch(()=>{});void flushQueuedBetaReports().catch(()=>{})};
    const appState=AppState.addEventListener('change',state=>{if(state==='active')refreshLocationState()});
    refreshLocationState();
    return () => {active=false;subscription.remove();appState.remove()};
  }, []);
  if(operatorOAuthRelaying)return null;
  const tabs=<Tabs screenOptions={{
    headerStyle:{backgroundColor:theme.canvas},headerShadowVisible:false,headerTitleStyle:{fontWeight:'900',color:theme.ink},
    tabBarActiveTintColor:theme.accent,tabBarInactiveTintColor:theme.muted,tabBarStyle:publicWeb?({display:'none'} as any):{height:68,paddingTop:6,paddingBottom:8,backgroundColor:theme.surface,borderTopColor:theme.line},tabBarLabelStyle:{fontWeight:'900',fontSize:10},
  }}>
    <Tabs.Screen name="index" options={{ title:'Home',headerShown:false,tabBarIcon:tabIcon('⌂') }}/>
    <Tabs.Screen name="explore" options={{ title:'Explore',headerShown:false,tabBarIcon:tabIcon('⌖') }}/>
    <Tabs.Screen name="progress" options={{ title:'Progress',headerShown:false,tabBarIcon:tabIcon('★') }}/>
    <Tabs.Screen name="social" options={{ title:'Community',headerShown:false,tabBarIcon:tabIcon('●') }}/>
    <Tabs.Screen name="profile" options={{ title:'Profile',headerShown:false,tabBarIcon:tabIcon('◉') }}/>
    <Tabs.Screen name="signup" options={{ href:null,title:'Join Kleenest' }}/>
    <Tabs.Screen name="install" options={{ href:null,title:'Install Kleenest' }}/>
    <Tabs.Screen name="for-you" options={{ href:null,title:'Kleenest for You' }}/>
    <Tabs.Screen name="for-business" options={{ href:null,title:'Kleenest for Business' }}/>
    <Tabs.Screen name="trust" options={{ href:null,title:'Trust + Freshness' }}/>
    <Tabs.Screen name="play" options={{ href:null,title:'Legacy progression + play' }}/>
    <Tabs.Screen name="discover" options={{ href:null,title:'Discover a place' }}/>
    <Tabs.Screen name="knowledge" options={{ href:null,title:'Share prior knowledge' }}/>
    <Tabs.Screen name="assistant" options={{ href:null,title:'Kleenest AI' }}/>
    <Tabs.Screen name="access" options={{ href:null,title:'Access & Preferred' }}/>
    <Tabs.Screen name="messages" options={{ href:null,title:'Messages' }}/>
    <Tabs.Screen name="offline" options={{ href:null,title:'Offline Trips' }}/>
    <Tabs.Screen name="games" options={{ href:null,title:'Game Center' }}/>
    <Tabs.Screen name="game/[code]" options={{ href:null,title:'Game Arena',headerShown:false }}/>
    <Tabs.Screen name="route" options={{ href:null,title:'Routes' }}/>
    <Tabs.Screen name="qr" options={{ href:null,title:'Scan QR' }}/>
    <Tabs.Screen name="location/[id]" options={{ href:null,title:'Restroom' }}/>
    <Tabs.Screen name="contributor/[id]" options={{ href:null,title:'Contributor' }}/>
    <Tabs.Screen name="saved" options={{ href:null,title:'Saved bathrooms' }}/>
    <Tabs.Screen name="activity" options={{ href:null,title:'Your activity' }}/>
    <Tabs.Screen name="notifications" options={{ href:null,title:'Notifications' }}/>
    <Tabs.Screen name="membership" options={{ href:null,title:'Membership' }}/>
    <Tabs.Screen name="family" options={{ href:null,title:'Kleenest Family' }}/>
    <Tabs.Screen name="preferences" options={{ href:null,title:'Privacy & preferences' }}/>
    <Tabs.Screen name="live-network" options={{ href:null,title:'Live Network' }}/>
    <Tabs.Screen name="support" options={{ href:null,title:'Help & support' }}/>
    <Tabs.Screen name="account-deletion" options={{ href:null,title:'Account control' }}/>
    <Tabs.Screen name="legal" options={{ href:null,title:'Terms, privacy & community' }}/>
    <Tabs.Screen name="blocked-users" options={{ href:null,title:'Blocked contributors' }}/>
    <Tabs.Screen name="community-guidelines" options={{ href:null,title:'Community Guidelines' }}/>
    <Tabs.Screen name="delete-account" options={{ href:null,title:'Delete account' }}/>
    <Tabs.Screen name="privacy" options={{ href:null,title:'Privacy Policy' }}/>
    <Tabs.Screen name="safety" options={{ href:null,title:'Safety' }}/>
    <Tabs.Screen name="terms" options={{ href:null,title:'Terms of Use' }}/>
  </Tabs>;
  return publicWeb?<><StatusBar style="dark"/>{tabs}</>:<PolicyAcceptanceGate><StatusBar style={theme.statusBar}/><View style={{flex:1}}>{tabs}<BetaReportButton route={pathname}/></View></PolicyAcceptanceGate>;
}
