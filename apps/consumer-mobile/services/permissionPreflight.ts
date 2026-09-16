import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { Alert, Linking, Platform } from 'react-native';
import { registerNativePush } from './push';

let preflightInFlight=false;
let promptPassCompleted=false;
let blockedNoticeShown=false;

async function registerPushIfSignedIn(){
  if(!Device.isDevice)return;
  const client=getKleenestSupabaseClient();
  const auth=await client.auth.getUser().catch(()=>null);
  if(!auth?.data?.user)return;
  await registerNativePush().catch(()=>{});
}

function showBlockedNotice(blocked:string[]){
  if(blockedNoticeShown||!blocked.length)return;
  blockedNoticeShown=true;
  const labels=blocked.map(item=>item==='location'?'Location':'Notifications');
  Alert.alert(
    'Finish Kleenest permissions',
    `${labels.join(' and ')} ${labels.length===1?'is':'are'} blocked in system settings. Location powers nearby bathrooms and verified visits. Notifications power reminders and nearby alerts.`,
    [
      {text:'Not now',style:'cancel'},
      {text:'Open settings',onPress:()=>{void Linking.openSettings()}},
    ],
  );
}

export async function runConsumerPermissionPreflight(){
  if(Platform.OS==='web'||preflightInFlight)return;
  preflightInFlight=true;
  try{
    let location=await Location.getForegroundPermissionsAsync();
    let notifications=await Notifications.getPermissionsAsync();

    if(!promptPassCompleted){
      promptPassCompleted=true;

      if(location.status!=='granted'&&location.canAskAgain){
        location=await Location.requestForegroundPermissionsAsync();
      }

      if(Platform.OS==='android'){
        await Notifications.setNotificationChannelAsync('default',{
          name:'Kleenest',
          importance:Notifications.AndroidImportance.DEFAULT,
        }).catch(()=>{});
      }

      if(notifications.status!=='granted'&&notifications.canAskAgain){
        notifications=await Notifications.requestPermissionsAsync();
      }
    }

    if(location.status==='granted'){
      const servicesEnabled=await Location.hasServicesEnabledAsync().catch(()=>true);
      if(!servicesEnabled&&Platform.OS==='android'){
        await Location.enableNetworkProviderAsync().catch(()=>{});
      }
    }

    if(notifications.status==='granted'){
      await registerPushIfSignedIn();
    }

    const blocked:string[]=[];
    if(location.status!=='granted'&&location.canAskAgain===false)blocked.push('location');
    if(notifications.status!=='granted'&&notifications.canAskAgain===false)blocked.push('notifications');
    showBlockedNotice(blocked);

    return{
      location:location.status,
      notifications:notifications.status,
      blocked,
    };
  }finally{
    preflightInFlight=false;
  }
}
