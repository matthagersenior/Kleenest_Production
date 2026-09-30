import { createElement, useEffect, useRef, useState } from 'react';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { router } from 'expo-router';
import { consumerNetworkAdPlacementEnabled } from '../services/networkAds';
import { useConsumerTheme } from '../services/theme';

const ADSENSE_CLIENT=String(process.env.EXPO_PUBLIC_ADSENSE_CLIENT_ID||'ca-pub-6958734306376288').trim();
const ADSENSE_WEB_DISPLAY_SLOT=String(process.env.EXPO_PUBLIC_ADSENSE_WEB_DISPLAY_SLOT||'').trim();

function ensureAdSenseScript(client:string){
  const runtime=globalThis as any;
  const document=runtime?.document;
  if(!document)return;
  const marker='kleenest-adsense-loader';
  if(document.getElementById(marker))return;
  const script=document.createElement('script');
  script.id=marker;
  script.async=true;
  script.crossOrigin='anonymous';
  script.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(script);
}

export function AdMobNativeSlot({contextClass}:{keywords?:string[];contextClass?:string}){
  const theme=useConsumerTheme();
  const[allowed,setAllowed]=useState(false);
  const pushed=useRef(false);
  const placement=String(contextClass||'network').trim().toLowerCase();

  useEffect(()=>{let active=true;void consumerNetworkAdPlacementEnabled(placement).then(value=>{if(active)setAllowed(value)});return()=>{active=false}},[placement]);
  useEffect(()=>{
    if(!allowed||!ADSENSE_CLIENT||!ADSENSE_WEB_DISPLAY_SLOT||pushed.current)return;
    const runtime=globalThis as any;
    if(!runtime?.document)return;
    ensureAdSenseScript(ADSENSE_CLIENT);
    try{
      const queue=runtime.adsbygoogle=runtime.adsbygoogle||[];
      queue.push({});
      pushed.current=true;
    }catch{}
  },[allowed,placement]);

  if(!allowed||!ADSENSE_CLIENT||!ADSENSE_WEB_DISPLAY_SLOT)return null;
  const ad=createElement('ins' as any,{
    className:'adsbygoogle',
    style:{display:'block',width:'100%',minHeight:96},
    'data-ad-client':ADSENSE_CLIENT,
    'data-ad-slot':ADSENSE_WEB_DISPLAY_SLOT,
    'data-ad-format':'auto',
    'data-full-width-responsive':'true',
  });
  return <View style={s.wrap}>
    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <View style={s.top}>
        <Text style={[s.badge,{color:theme.muted,borderColor:theme.line}]}>AD · GOOGLE WEB</Text>
        <Text style={[s.context,{color:theme.muted}]}>{placement.replaceAll('_',' ').toUpperCase()}</Text>
      </View>
      {ad}
      <Text style={[s.note,{color:theme.muted}]}>Google web ad · Kleenest Sponsored recommendations are separate.</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Remove Google and network ads for five dollars one time" onPress={()=>router.push('/membership')} style={[s.removeAds,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
      <Text style={[s.removeAdsText,{color:theme.accent}]}>Remove network ads · $5 one-time →</Text>
    </Pressable>
  </View>;
}

const s=StyleSheet.create({
  wrap:{gap:6},
  card:{borderRadius:17,borderWidth:1,padding:13,gap:8,minHeight:118},
  top:{minHeight:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  badge:{borderRadius:6,borderWidth:1,paddingHorizontal:6,paddingVertical:3,fontSize:8,fontWeight:'900',letterSpacing:1,overflow:'hidden'},
  context:{fontSize:7,fontWeight:'800',letterSpacing:.8,flexShrink:1,textAlign:'right'},
  note:{fontSize:9,lineHeight:13,fontWeight:'700'},
  removeAds:{alignSelf:'flex-end',borderWidth:1,borderRadius:999,paddingHorizontal:10,paddingVertical:6},
  removeAdsText:{fontSize:9,fontWeight:'900'},
});
