import { useEffect,useMemo,useState } from 'react';
import { Image,Platform,StyleSheet,Text,View } from 'react-native';
import mobileAds,{AdsConsent,NativeAd,NativeAdEventType,NativeAdView,NativeAsset,NativeAssetType,TestIds} from 'react-native-google-mobile-ads';
import { consumerNetworkAdsEnabled } from '../services/networkAds';
import { classifyAdMobLoadFailure,recordAdMobTelemetry } from '../services/admobTelemetry';
import { useConsumerTheme } from '../services/theme';

const PRODUCTION_ANDROID_NATIVE_AD_UNIT_ID='ca-app-pub-6958734306376288/6751375017';
const PRODUCTION_IOS_NATIVE_AD_UNIT_ID='ca-app-pub-6958734306376288/2327160255';

let initialization:Promise<boolean>|null=null;
function ensureInitialized(){
  if(!initialization)initialization=(async()=>{
    try{await AdsConsent.gatherConsent()}catch{}
    try{
      const info=await AdsConsent.getConsentInfo();
      if(!info.canRequestAds){void recordAdMobTelemetry('consent_blocked','sdk');return false}
    }catch(error:any){
      void recordAdMobTelemetry('initialization_error','sdk',{errorCode:String(error?.code||'consent_info_error'),errorMessage:String(error?.message||error||'Consent state unavailable')});
      return false
    }
    try{
      await mobileAds().initialize();
      void recordAdMobTelemetry('initialized','sdk');
      return true
    }catch(error:any){
      void recordAdMobTelemetry('initialization_error','sdk',{errorCode:String(error?.code||'initialize_error'),errorMessage:String(error?.message||error||'Google Mobile Ads initialization failed')});
      return false
    }
  })();
  return initialization;
}

export function AdMobNativeSlot({keywords=[],contextClass}:{keywords?:string[];contextClass?:string}){
  const theme=useConsumerTheme();
  const[allowed,setAllowed]=useState(false);
  const[nativeAd,setNativeAd]=useState<NativeAd|null>(null);
  const cleanKeywords=useMemo(()=>Array.from(new Set(keywords.map(v=>String(v).trim().toLowerCase()).filter(Boolean))).slice(0,10),[keywords.join('|')]);

  useEffect(()=>{let active=true;void consumerNetworkAdsEnabled().then(value=>{if(active)setAllowed(value)});return()=>{active=false}},[]);
  useEffect(()=>{
    if(!allowed)return;
    let active=true;
    void ensureInitialized().then(async ready=>{
      if(!active||!ready)return;
      const configured=Platform.select({
        android:process.env.EXPO_PUBLIC_ADMOB_NATIVE_ANDROID_ID||PRODUCTION_ANDROID_NATIVE_AD_UNIT_ID,
        ios:process.env.EXPO_PUBLIC_ADMOB_NATIVE_IOS_ID||PRODUCTION_IOS_NATIVE_AD_UNIT_ID,
        default:undefined,
      });
      const adUnitId=configured||TestIds.NATIVE;
      const placement=contextClass||'network';
      void recordAdMobTelemetry('request',placement,{adUnitId});
      try{
        const ad=await NativeAd.createForAdRequest(adUnitId,{
          requestNonPersonalizedAdsOnly:true,
          keywords:cleanKeywords.length?cleanKeywords:undefined,
        });
        void recordAdMobTelemetry('fill',placement,{adUnitId,responseId:ad.responseId});
        ad.addAdEventListener(NativeAdEventType.IMPRESSION,()=>{void recordAdMobTelemetry('impression',placement,{adUnitId,responseId:ad.responseId})});
        ad.addAdEventListener(NativeAdEventType.CLICKED,()=>{void recordAdMobTelemetry('click',placement,{adUnitId,responseId:ad.responseId})});
        if(active)setNativeAd(ad);else ad.destroy();
      }catch(error){
        const failure=classifyAdMobLoadFailure(error);
        void recordAdMobTelemetry(failure.eventType,placement,{adUnitId,errorCode:failure.errorCode,errorMessage:failure.errorMessage});
      }
    });
    return()=>{active=false};
  },[allowed,cleanKeywords.join('|')]);
  useEffect(()=>()=>{nativeAd?.destroy()},[nativeAd]);

  if(!allowed||!nativeAd)return null;
  return <NativeAdView nativeAd={nativeAd} style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
    <View style={s.top}>
      <View style={[s.adBadge,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.adBadgeText,{color:theme.muted}]}>AD · GOOGLE</Text></View>
      <Text style={[s.context,{color:theme.muted}]}>{contextClass?.replaceAll('_',' ').toUpperCase()||'NETWORK'}</Text>
    </View>
    <View style={s.content}>
      {nativeAd.icon?<NativeAsset assetType={NativeAssetType.ICON}><Image source={{uri:nativeAd.icon.url}} style={s.icon}/></NativeAsset>:null}
      <View style={{flex:1,gap:4}}>
        <NativeAsset assetType={NativeAssetType.HEADLINE}><Text style={[s.title,{color:theme.ink}]} numberOfLines={2}>{nativeAd.headline}</Text></NativeAsset>
        {nativeAd.advertiser?<NativeAsset assetType={NativeAssetType.ADVERTISER}><Text style={[s.advertiser,{color:theme.muted}]} numberOfLines={1}>{nativeAd.advertiser}</Text></NativeAsset>:null}
        {nativeAd.body?<NativeAsset assetType={NativeAssetType.BODY}><Text style={[s.body,{color:theme.muted}]} numberOfLines={3}>{nativeAd.body}</Text></NativeAsset>:null}
      </View>
    </View>
    {nativeAd.callToAction?<NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}><Text style={[s.cta,{color:theme.accent,backgroundColor:theme.accentSoft,borderColor:theme.line}]}>{nativeAd.callToAction} →</Text></NativeAsset>:null}
    <Text style={[s.note,{color:theme.muted}]}>Google network ad · Remove Ads hides network ads. Kleenest Sponsored recommendations are separate.</Text>
  </NativeAdView>;
}

const s=StyleSheet.create({
  card:{borderRadius:17,borderWidth:1,padding:13,gap:8,minHeight:110},
  top:{minHeight:20,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingRight:24,gap:8},
  adBadge:{borderRadius:6,borderWidth:1,paddingHorizontal:6,paddingVertical:3},
  adBadgeText:{fontSize:8,fontWeight:'900',letterSpacing:1},
  context:{fontSize:7,fontWeight:'800',letterSpacing:.8},
  content:{flexDirection:'row',alignItems:'flex-start',gap:10},
  icon:{width:46,height:46,borderRadius:10},
  title:{fontSize:16,lineHeight:20,fontWeight:'900'},
  advertiser:{fontSize:10,fontWeight:'800'},
  body:{fontSize:12,lineHeight:17},
  cta:{alignSelf:'flex-start',overflow:'hidden',borderWidth:1,borderRadius:11,paddingHorizontal:11,paddingVertical:8,fontSize:10,fontWeight:'900'},
  note:{fontSize:9,lineHeight:13,fontWeight:'700'},
});
