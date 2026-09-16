import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { isKleenestRewardThemeMode, loadKleenestThemeMode, markMobileNotificationRead, resolveKleenestTheme, setKleenestThemeMode, subscribeKleenestTheme, type KleenestThemeMode } from '@kleenest/mobile-core';
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
import { captureConsumerCoreLoopEvent } from '../services/consumerTelemetry';
import { getProgressionRewards } from '../services/discoveryProgression';
import { runConsumerPermissionPreflight } from '../services/permissionPreflight';

const operatorOAuthRelaying=relayOperatorOAuthCallback();

let otaCheckInFlight=false;
let lastOtaCheckAt=0;
const OTA_CHECK_THROTTLE_MS=5*60*1000;

async function applyPendingConsumerOta(){
  if(Platform.OS==='web'||__DEV__||!Updates.isEnabled||otaCheckInFlight)return;
  const now=Date.now();
  if(now-lastOtaCheckAt<OTA_CHECK_THROTTLE_MS)return;
  lastOtaCheckAt=now;
  otaCheckInFlight=true;
  try{
    const check=await Updates.checkForUpdateAsync();
    if(!check.isAvailable)return;
    const fetched=await Updates.fetchUpdateAsync();
    if(fetched.isNew)await Updates.reloadAsync();
  }catch{
    // Never block launch or foreground recovery if Expo Update checks are unavailable.
  }finally{
    otaCheckInFlight=false;
  }
}

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
const tabLabel=(label:string)=>(props:{color:ColorValue})=><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.15} style={{width:'100%',fontSize:10,fontWeight:'900',textAlign:'center',color:props.color}}>{label}</Text>;

export default function RootLayout() {
  const pathname=usePathname();
  const systemScheme=useColorScheme();
  const[themeMode,setThemeMode]=useState<KleenestThemeMode>('default');
  const theme=resolveKleenestTheme(themeMode,systemScheme==='dark','consumer');
  const {ready:webGateReady,appActive}=useConsumerWebExperience();
  const publicWeb=Platform.OS==='web'&&!appActive&&webGateReady&&['/','/for-you','/for-business','/trust','/install','/creator'].includes(pathname);
  useEffect(()=>{
    let active=true;
    async function enforceRewardTheme(mode:KleenestThemeMode){
      if(!isKleenestRewardThemeMode(mode)){if(active)setThemeMode(mode);return}
      const rewards=await getProgressionRewards().catch(()=>[]);
      const allowed=Array.isArray(rewards)&&rewards.some((reward:any)=>reward?.reward_kind==='theme'&&reward?.reward_key===mode&&reward?.unlocked);
      if(!allowed){await setKleenestThemeMode('default');if(active)setThemeMode('default');return}
      if(active)setThemeMode(mode);
    }
    void loadKleenestThemeMode().then(enforceRewardTheme);
    const unsubscribe=subscribeKleenestTheme(mode=>{void enforceRewardTheme(mode)});
    return()=>{active=false;unsubscribe()};
  },[]);
  useEffect(()=>{captureConsumerCoreLoopEvent('app_open',null,{surface:Platform.OS==='web'?'web':'native'})},[]);
  useEffect(()=>{
    if(Platform.OS==='web')return;
    let active=true;
    const syncNativeLaunchState=async()=>{
      if(!__DEV__&&Updates.isEnabled)await applyPendingConsumerOta();
      if(active)await runConsumerPermissionPreflight();
    };
    void syncNativeLaunchState();
    const otaAppState=AppState.addEventListener('change',state=>{if(state==='active')void syncNativeLaunchState()});
    return()=>{active=false;otaAppState.remove()};
  },[]);
  useEffect(()=>{if(!publicWeb)recordBetaBreadcrumb('route',pathname)},[pathname,publicWeb]);
  useEffect(() => {
    if(operatorOAuthRelaying)return;
    let active=true;
    Notifications.getLastNotificationResponseAsync().then(async response=>{if(!active)return;await openNotificationResponse(response);if(response)await Notifications.clearLastNotificationResponseAsync().catch(()=>{})}).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(response => { void openNotificationResponse(response); });
    const refreshLocationState=()=>{void refreshConsumerPresence().catch(()=>{});void refreshConsumerLiveNetworkRegions().catch(()=>{});void flushQueuedBetaReports().catch(()=>{});void loadKleenestThemeMode().then(async mode=>{if(!isKleenestRewardThemeMode(mode))return;const rewards=await getProgressionRewards().catch(()=>[]);if(!Array.isArray(rewards)||!rewards.some((reward:any)=>reward?.reward_key===mode&&reward?.unlocked))await setKleenestThemeMode('default')}).catch(()=>{})};
    const appState=AppState.addEventListener('change',state=>{if(state==='active')refreshLocationState()});
    refreshLocationState();
    return () => {active=false;subscription.remove();appState.remove()};
  }, []);
  if(operatorOAuthRelaying)return null;
  const tabs=<Tabs initialRouteName={Platform.OS==='web'?'index':'explore'} screenOptions={{
    headerStyle:{backgroundColor:theme.canvas},headerShadowVisible:false,headerTitleStyle:{fontWeight:'900',color:theme.ink},
    tabBarActiveTintColor:theme.accent,tabBarInactiveTintColor:theme.muted,tabBarStyle:publicWeb?({display:'none'} as any):{height:68,paddingTop:6,paddingBottom:8,backgroundColor:theme.surface,borderTopColor:theme.line},tabBarItemStyle:{minWidth:0,paddingHorizontal:0},tabBarLabelStyle:{fontWeight:'900',fontSize:10},
  }}>
    <Tabs.Screen name="index" options={{ href:null,title:'Launch',headerShown:false }}/>
    <Tabs.Screen name="home" options={{ title:'Home',headerShown:false,tabBarIcon:tabIcon('⌂'),tabBarLabel:tabLabel('Home') }}/>
    <Tabs.Screen name="explore" options={{ title:'Explore',headerShown:false,tabBarIcon:tabIcon('⌖'),tabBarLabel:tabLabel('Explore') }}/>
    <Tabs.Screen name="progress" options={{ title:'Progress',headerShown:false,tabBarIcon:tabIcon('★'),tabBarLabel:tabLabel('Progress') }}/>
    <Tabs.Screen name="social" options={{ title:'Community',headerShown:false,tabBarIcon:tabIcon('●'),tabBarLabel:tabLabel('Community') }}/>
    <Tabs.Screen name="profile" options={{ title:'Profile',headerShown:false,tabBarIcon:tabIcon('◉'),tabBarLabel:tabLabel('Profile') }}/>
    <Tabs.Screen name="signup" options={{ href:null,title:'Join Kleenest' }}/>
    <Tabs.Screen name="install" options={{ href:null,title:'Install Kleenest' }}/>
    <Tabs.Screen name="creator" options={{ href:null,title:'Creator mission',headerShown:false }}/>
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
    <Tabs.Screen name="reward-tools" options={{ href:null,title:'Reward Toolkit',headerShown:false }}/>
    <Tabs.Screen name="route" options={{ href:null,title:'Routes' }}/>
    <Tabs.Screen name="qr" options={{ href:null,title:'Scan QR' }}/>
    <Tabs.Screen name="location-qr" options={{ href:null,title:'Location QR' }}/>
    <Tabs.Screen name="location/[id]" options={{ href:null,title:'Restroom' }}/>
    <Tabs.Screen name="contributor/[id]" options={{ href:null,title:'Contributor' }}/>
    <Tabs.Screen name="saved" options={{ href:null,title:'Saved bathrooms' }}/>
    <Tabs.Screen name="activity" options={{ href:null,title:'Your activity' }}/>
    <Tabs.Screen name="week-in-review" options={{ href:null,title:'Week in review' }}/>
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
