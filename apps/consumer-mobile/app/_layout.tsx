import * as Notifications from 'expo-notifications';
import { markMobileNotificationRead } from '@kleenest/mobile-core';
import { router, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { notificationDestination } from '../services/notificationRouting';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function openNotificationResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const data = response.notification.request.content.data || {};
  const notificationId = typeof data.notification_id === 'string' ? data.notification_id : '';
  if (notificationId) await markMobileNotificationRead(notificationId).catch(() => {});
  const destination = notificationDestination({ type: typeof data.type === 'string' ? data.type : null, data });
  if (destination) router.push(destination as any);
}

const tabIcon=(glyph:string)=>(props:{color:string;focused:boolean})=><Text style={{fontSize:props.focused?20:18,color:props.color,fontWeight:'900'}}>{glyph}</Text>;

export default function RootLayout() {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => void openNotificationResponse(response)).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(response => { void openNotificationResponse(response); });
    return () => subscription.remove();
  }, []);
  return <><StatusBar style="dark"/><Tabs screenOptions={{
    headerStyle:{backgroundColor:'#f3f6f4'},headerShadowVisible:false,headerTitleStyle:{fontWeight:'900',color:'#102218'},
    tabBarActiveTintColor:'#173d2b',tabBarInactiveTintColor:'#75847b',tabBarStyle:{height:68,paddingTop:6,paddingBottom:8,backgroundColor:'#ffffff',borderTopColor:'#d7e2da'},tabBarLabelStyle:{fontWeight:'900',fontSize:10},
  }}>
    <Tabs.Screen name="index" options={{ title:'Home',headerShown:false,tabBarIcon:tabIcon('⌂') }}/>
    <Tabs.Screen name="explore" options={{ title:'Explore',headerShown:false,tabBarIcon:tabIcon('⌖') }}/>
    <Tabs.Screen name="play" options={{ title:'Play',headerShown:false,tabBarIcon:tabIcon('★') }}/>
    <Tabs.Screen name="social" options={{ title:'Community',headerShown:false,tabBarIcon:tabIcon('●') }}/>
    <Tabs.Screen name="profile" options={{ title:'Profile',headerShown:false,tabBarIcon:tabIcon('◉') }}/>
    <Tabs.Screen name="games" options={{ href:null,title:'Game Center' }}/>
    <Tabs.Screen name="route" options={{ href:null,title:'Routes' }}/>
    <Tabs.Screen name="qr" options={{ href:null,title:'Scan QR' }}/>
    <Tabs.Screen name="location/[id]" options={{ href:null,title:'Restroom' }}/>
    <Tabs.Screen name="contributor/[id]" options={{ href:null,title:'Contributor' }}/>
    <Tabs.Screen name="saved" options={{ href:null,title:'Saved bathrooms' }}/>
    <Tabs.Screen name="activity" options={{ href:null,title:'Your activity' }}/>
    <Tabs.Screen name="notifications" options={{ href:null,title:'Notifications' }}/>
    <Tabs.Screen name="membership" options={{ href:null,title:'Membership' }}/>
    <Tabs.Screen name="preferences" options={{ href:null,title:'Privacy & preferences' }}/>
    <Tabs.Screen name="support" options={{ href:null,title:'Help & support' }}/>
    <Tabs.Screen name="account-deletion" options={{ href:null,title:'Account control' }}/>
  </Tabs></>;
}
