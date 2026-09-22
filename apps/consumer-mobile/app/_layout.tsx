import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { isKleenestRewardThemeMode, loadKleenestThemeMode, markMobileNotificationRead, resolveKleenestTheme, setKleenestThemeMode, subscribeKleenestTheme, type KleenestThemeMode } from '@kleenest/mobile-core';
import { router, Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState,Platform,Text,View,useColorScheme, type ColorValue } from 'react-native';
import Svg,{Circle,Path,Rect} from 'react-native-svg';
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

type TabIconKind='home'|'explore'|'check'|'games'|'profile';

function TabVectorIcon({kind,color}:{kind:TabIconKind;color:ColorValue}){
  const stroke=String(color);
  if(kind==='home')return <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" fill="none" stroke={stroke} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
  if(kind==='explore')return <Svg width={22} height={22} viewBox="0 0 24 24"><Circle cx={12} cy={12} r={7.2} fill="none" stroke={stroke} strokeWidth={2}/><Circle cx={12} cy={12} r={2.2} fill={stroke}/><Path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3" stroke={stroke} strokeWidth={2} strokeLinecap="round"/></Svg>;
  if(kind==='check')return <Svg width={22} height={22} viewBox="0 0 24 24"><Rect x={3.5} y={3.5} width={17} height={17} rx={5} fill="none" stroke={stroke} strokeWidth={2}/><Path d="m8.2 12.2 2.4 2.4 5.4-5.5" fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
  if(kind==='games')return <Svg width={23} height={23} viewBox="0 0 24 24"><Rect x={3.2} y={7.2} width={17.6} height={10.8} rx={5.2} fill="none" stroke={stroke} strokeWidth={2}/><Path d="M7.2 12.6h4M9.2 10.6v4" stroke={stroke} strokeWidth={2} strokeLinecap="round"/><Circle cx={15.8} cy={11.4} r={1.1} fill={stroke}/><Circle cx={18} cy={13.7} r={1.1} fill={stroke}/></Svg>;
  return <Svg width={22} height={22} viewBox="0 0 24 24"><Circle cx={12} cy={8} r={3.3} fill="none" stroke={stroke} strokeWidth={2}/><Path d="M5.2 20c.8-4 3.1-6.1 6.8-6.1S18 16 18.8 20" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round"/></Svg>;
}

const tabIcon=(kind:TabIconKind,activeBackground:string)=>(props:{color:ColorValue;focused:boolean;size:number})=><View accessible={false} style={{width:36,height:32,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:props.focused?activeBackground:'transparent'}}><TabVectorIcon kind={kind} color={props.color}/></View>;
const tabLabel=(label:string)=>(props:{color:ColorValue})=><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.15} style={{width:'100%',fontSize:9.5,fontWeight:'900',textAlign:'center',color:props.color,letterSpacing:.1}}>{label}</Text>;

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
    tabBarActiveTintColor:theme.accent,tabBarInactiveTintColor:theme.muted,tabBarStyle:publicWeb?({display:'none'} as any):{height:74,paddingTop:7,paddingBottom:9,backgroundColor:theme.surfaceRaised,borderTopWidth:1,borderTopColor:theme.line,elevation:12,shadowColor:'#000',shadowOpacity:.12,shadowRadius:10,shadowOffset:{width:0,height:-3}},tabBarItemStyle:{minWidth:0,paddingHorizontal:0,paddingVertical:1},tabBarLabelStyle:{fontWeight:'900',fontSize:9.5},
  }}>
    <Tabs.Screen name="index" options={{ href:null,title:'Launch',headerShown:false }}/>
    <Tabs.Screen name="home" options={{ title:'Home',headerShown:false,tabBarIcon:tabIcon('home',theme.accentSoft),tabBarLabel:tabLabel('Home') }}/>
    <Tabs.Screen name="explore" options={{ title:'Explore',headerShown:false,tabBarIcon:tabIcon('explore',theme.accentSoft),tabBarLabel:tabLabel('Explore') }}/>
    <Tabs.Screen name="qr" options={{ title:'Check In',headerShown:false,tabBarIcon:tabIcon('check',theme.accentSoft),tabBarLabel:tabLabel('Check In') }}/>
    <Tabs.Screen name="progress" options={{ href:null,title:'Progress',headerShown:false }}/>
    <Tabs.Screen name="passport" options={{ href:null,title:'Kleenest Passport' }}/>
    <Tabs.Screen name="intelligence" options={{ href:null,title:'Kleenest Intelligence' }}/>
    <Tabs.Screen name="social" options={{ href:null,title:'Community',headerShown:false }}/>
    <Tabs.Screen name="search" options={{ href:null,title:'Search',headerShown:false }}/>
    <Tabs.Screen name="profile" options={{ title:'Profile',headerShown:false,tabBarIcon:tabIcon('profile',theme.accentSoft),tabBarLabel:tabLabel('Profile') }}/>
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
    <Tabs.Screen name="games" options={{ title:'Game Center',headerShown:false,tabBarIcon:tabIcon('games',theme.accentSoft),tabBarLabel:tabLabel('Games') }}/>
    <Tabs.Screen name="game/[code]" options={{ href:null,title:'Game Arena',headerShown:false }}/>
    <Tabs.Screen name="reward-tools" options={{ href:null,title:'Reward Toolkit',headerShown:false }}/>
    <Tabs.Screen name="route" options={{ href:null,title:'Routes' }}/>

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
