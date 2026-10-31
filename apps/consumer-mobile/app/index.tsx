import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { Platform, SafeAreaView } from 'react-native';
import { MarketingHome } from '../components/MarketingSite';
import { useConsumerTheme } from '../services/theme';
import { isConsumerStandaloneWebApp, isExplicitConsumerAppLaunch, useConsumerWebExperience } from '../services/webExperience';

export default function HomeScreen(){
  const theme=useConsumerTheme();
  const {ready:webGateReady,signedIn}=useConsumerWebExperience();
  // The public domain always opens its homepage in a browser. Only an explicit
  // app launch or installed standalone window should enter the app directly.
  const directAppLaunch=Platform.OS!=='web'||isConsumerStandaloneWebApp()||isExplicitConsumerAppLaunch();
  const [landingResolved,setLandingResolved]=useState(false);

  useEffect(()=>{
    if(Platform.OS!=='web'||!directAppLaunch||!webGateReady||!signedIn)return;
    let active=true;
    const openLanding=async()=>{
      const client=getKleenestSupabaseClient();
      const rpc=async(name:string,args:Record<string,unknown>={})=>{
        try{const{data,error}=await client.rpc(name,args);return error?null:data}catch{return null}
      };
      const [owner,businesses,fleet]=await Promise.all([
        rpc('admin_authorization_v1'),
        rpc('business_list_workspaces',{p_include_demo:true}),
        rpc('fleet_current_user_workspace_manifest'),
      ]);
      if(!active)return;
      const ownerRow=Array.isArray(owner)?owner[0]:owner;
      const workspaces=Array.isArray(businesses)?businesses:[];
      const fleetWorkspaces=Array.isArray((fleet as any)?.workspaces)?(fleet as any).workspaces:[];
      const session=(await client.auth.getSession()).data.session;
      const user=session?.user;
      const metadata={...(user?.app_metadata||{}),...(user?.user_metadata||{})} as Record<string,unknown>;
      const rawRoles=[metadata.role,metadata.roles,metadata.account_type,metadata.portal].flatMap(value=>Array.isArray(value)?value:[value]).filter(value=>typeof value==='string').join(' ').toLowerCase();
      let destination='/explore';
      if(ownerRow?.is_platform_owner||ownerRow?.is_admin||/platform[_ -]?owner|owner/.test(rawRoles))destination='/owner/';
      else if(/developer/.test(rawRoles))destination='/developer/';
      else if(/partner/.test(rawRoles))destination='/business/partners/';
      else if(/enterprise/.test(rawRoles))destination='/business/enterprise/';
      else if(fleetWorkspaces.length||/fleet|driver/.test(rawRoles))destination='/fleet/';
      else if(workspaces.length||/business|operator/.test(rawRoles))destination='/business/';
      if(destination==='/explore'){
        router.replace('/explore' as any);
      }else{
        const base=window.location.pathname.startsWith('/Kleenest_Production')?'/Kleenest_Production':'';
        window.location.assign(`${base}${destination}`);
      }
      if(active)setLandingResolved(true);
    };
    void openLanding().catch(()=>{if(active){router.replace('/explore' as any);setLandingResolved(true)}});
    return()=>{active=false};
  },[webGateReady,signedIn,directAppLaunch]);

  if(Platform.OS==='web'&&!webGateReady){
    return <SafeAreaView style={{flex:1,backgroundColor:theme.canvas}}/>;
  }
  if(Platform.OS==='web'&&!directAppLaunch){
    return <MarketingHome/>;
  }
  if(Platform.OS==='web'&&signedIn&&!landingResolved){
    return <SafeAreaView style={{flex:1,backgroundColor:theme.canvas}}/>;
  }

  return <Redirect href="/explore"/>;
}
