import * as Location from 'expo-location';
import { router,useLocalSearchParams } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Linking,Pressable,SafeAreaView,ScrollView,Share,StyleSheet,Text,View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ensureLocationQrIdentity,recordLocationQrPlacementEvent,type LocationQrIdentity,type QrPlacementEventType } from '../services/qrActions';
import { useConsumerTheme } from '../services/theme';

function trustLabel(value:LocationQrIdentity|null){
  if(!value)return'Community QR';
  if(value.trust_state==='business_claimed')return'Business claimed';
  if(value.trust_state==='kleenest_verified')return'Kleenest verified';
  if(value.trust_state==='placement_verified')return'Placement verified';
  return'Community QR';
}
function placementLabel(value:LocationQrIdentity|null){
  const state=value?.placement_status||'digital_only';
  if(state==='placement_verified')return'Physical placement independently verified';
  if(state==='placed_unverified')return'Physical placement awaiting independent verification';
  if(state==='disputed')return'Placement needs review';
  return'Digital identity · no verified physical placement yet';
}
function actionError(error:any){
  const detail=String(error?.message||'');
  if(detail.includes('OUTSIDE_GEOFENCE'))return'You need to be at this location to record or verify a physical QR placement.';
  if(detail.includes('INDEPENDENT_PLACEMENT_REQUIRED'))return'A different Kleenest member must record the placement before you can independently verify it.';
  if(detail.includes('LOCATION_REQUIRED'))return'Kleenest needs your current location to verify the physical QR placement.';
  return detail&&detail.length<180?detail:'QR action could not be completed.';
}

export default function LocationQrScreen(){
  const theme=useConsumerTheme();
  const{locationId,name}=useLocalSearchParams<{locationId?:string;name?:string}>();
  const id=String(locationId||'');
  const[identity,setIdentity]=useState<LocationQrIdentity|null>(null);
  const[message,setMessage]=useState('Preparing this location’s permanent Kleenest QR…');
  const[busy,setBusy]=useState(false);
  const qrValue=useMemo(()=>identity?.deep_link||'',[identity?.deep_link]);

  async function load(){
    if(!id){setMessage('This location QR is missing its location.');return}
    setBusy(true);
    try{const next=await ensureLocationQrIdentity(id);setIdentity(next);setMessage('')}
    catch(error:any){setMessage(actionError(error))}
    finally{setBusy(false)}
  }
  useEffect(()=>{void load()},[id]);

  async function geoEvent(eventType:'placed'|'placement_verified'){
    if(!identity||busy)return;
    setBusy(true);setMessage('');
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('LOCATION_REQUIRED');
      const current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      const result=await recordLocationQrPlacementEvent(identity.code,eventType,current.coords.latitude,current.coords.longitude,{location_name:identity.location_name||name||null});
      const xp=Number(result?.xp_awarded||0);
      setMessage(result?.duplicate?'You already recorded this recently.':eventType==='placed'?'Placement recorded'+(xp?' · +'+xp+' XP':'')+'. A different member can independently verify it.':'Placement independently verified'+(xp?' · +'+xp+' XP':'')+'.');
      await load();
    }catch(error:any){setMessage(actionError(error))}
    finally{setBusy(false)}
  }

  async function report(eventType:Extract<QrPlacementEventType,'damaged'|'missing'|'unauthorized'>){
    if(!identity||busy)return;
    setBusy(true);setMessage('');
    try{
      const result=await recordLocationQrPlacementEvent(identity.code,eventType,null,null,{location_name:identity.location_name||name||null});
      setMessage(result?.duplicate?'You already reported this recently.':'Report sent to KleenestOS for owner review. The QR identity remains attached to the location while placement trust is reviewed.');
      await load();
    }catch(error:any){setMessage(actionError(error))}
    finally{setBusy(false)}
  }

  async function share(){
    if(!identity)return;
    await Share.share({title:String(identity.location_name||name||'Kleenest location')+' QR',message:String(identity.location_name||name||'Kleenest location')+' · Kleenest QR\n'+identity.deep_link});
  }
  async function claim(){
    if(!identity)return;
    const url='kleenest-business://locations?claimLocationId='+encodeURIComponent(identity.location_id||'')+'&claimName='+encodeURIComponent(identity.location_name||String(name||''));
    try{await Linking.openURL(url)}catch{setMessage('Open Kleenest Business → Locations and search this location to start the claim verification flow.')}
  }

  const unclaimed=Boolean(identity?.claimable);
  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.page}>
    <View style={[s.hero,{backgroundColor:theme.resolved==='dark'?theme.surfaceRaised:'#173f2d',borderColor:theme.line}]}>
      <Text style={s.eyebrow}>{unclaimed?'KLEENEST COMMUNITY QR':'KLEENEST LOCATION QR'}</Text>
      <Text style={s.title}>{identity?.location_name||name||'Location QR'}</Text>
      <Text style={s.copy}>{unclaimed?'This permanent code belongs to the Kleenest location identity—not to the business. Claiming the location later will not rotate or replace this code.':'This is the permanent Kleenest identity for this location. Business capabilities can change without replacing the printed code.'}</Text>
      <View style={s.badges}><Badge label={trustLabel(identity)} tone={theme.accentSoft} ink={theme.accent}/><Badge label={identity?.qr_scope==='business'?'BUSINESS':'COMMUNITY'} tone={theme.surface} ink={theme.ink}/></View>
    </View>

    {message?<View style={[s.messageCard,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.message,{color:theme.ink}]}>{message}</Text></View>:null}

    <View style={[s.qrCard,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.muted}]}>PERMANENT LOCATION IDENTITY</Text>
      {qrValue?<View style={s.qrFrame}><QRCode value={qrValue} size={228} color="#173f2d" backgroundColor="#ffffff" quietZone={8} ecl="M"/></View>:<View style={[s.loadingQr,{backgroundColor:theme.surfaceRaised}]}><Text style={[s.meta,{color:theme.muted}]}>{busy?'Creating QR…':'QR unavailable'}</Text></View>}
      <Text style={[s.code,{color:theme.ink}]}>{identity?.code||'—'}</Text>
      <Text style={[s.meta,{color:theme.muted}]}>{placementLabel(identity)}</Text>
      <View style={s.actions}><Action label="Share QR" disabled={!identity||busy} onPress={share}/><Action quiet label="Open location" disabled={!identity} onPress={()=>router.replace({pathname:'/location/[id]',params:{id:String(identity?.location_id||id)}})}/></View>
    </View>

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>PHYSICAL PLACEMENT</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>A sticker is evidence, not ownership.</Text>
      <Text style={[s.meta,{color:theme.muted}]}>Record a placement only when you are physically at the location. Independent verification must come from a different Kleenest member.</Text>
      <View style={s.actions}><Action label="I placed this QR here" disabled={!identity||busy} onPress={()=>void geoEvent('placed')}/><Action quiet label="Verify this placement" disabled={!identity||busy} onPress={()=>void geoEvent('placement_verified')}/></View>
    </View>

    {unclaimed?<View style={[s.card,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>UNCLAIMED BUSINESS</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Community-listed · not business-official</Text>
      <Text style={[s.meta,{color:theme.muted}]}>Scanning this QR can build trusted location evidence before the business joins. A business claim adds official controls and analytics to this same identity—it does not erase the community history.</Text>
      <Action label="Own or manage this location? Claim it" disabled={busy} onPress={claim}/>
    </View>:null}

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.muted}]}>REPORT A PLACEMENT PROBLEM</Text>
      <Text style={[s.meta,{color:theme.muted}]}>Reports go to the KleenestOS owner moderation queue. They affect physical-placement trust, not the canonical location identity itself.</Text>
      <View style={s.actions}><Action quiet label="QR missing" disabled={!identity||busy} onPress={()=>void report('missing')}/><Action quiet label="Damaged" disabled={!identity||busy} onPress={()=>void report('damaged')}/><Action danger label="Unauthorized placement" disabled={!identity||busy} onPress={()=>void report('unauthorized')}/></View>
    </View>
    <Pressable onPress={()=>router.back()} style={[s.back,{borderColor:theme.line}]}><Text style={[s.backText,{color:theme.accent}]}>‹ Back</Text></Pressable>
  </ScrollView></SafeAreaView>
}

function Badge({label,tone,ink}:{label:string;tone:string;ink:string}){return <View style={[s.badge,{backgroundColor:tone}]}><Text style={[s.badgeText,{color:ink}]}>{label.toUpperCase()}</Text></View>}
function Action({label,onPress,disabled,quiet=false,danger=false}:{label:string;onPress:()=>void|Promise<void>;disabled?:boolean;quiet?:boolean;danger?:boolean}){
  const theme=useConsumerTheme();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.action,{backgroundColor:danger?theme.surfaceRaised:quiet?theme.accentSoft:theme.accent,borderColor:danger?theme.warning:quiet?theme.line:theme.accent},disabled&&{opacity:.45}]}><Text style={[s.actionText,{color:danger?theme.warning:quiet?theme.accent:theme.accentText}]}>{label}</Text></Pressable>
}
const s=StyleSheet.create({safe:{flex:1},page:{padding:18,paddingBottom:48,gap:12},hero:{padding:19,borderRadius:24,gap:7,borderWidth:1},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c8ead7'},title:{fontSize:28,lineHeight:32,fontWeight:'900',color:'#fff'},copy:{fontSize:13,lineHeight:20,fontWeight:'700',color:'#deebe4'},badges:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:4},badge:{paddingHorizontal:9,paddingVertical:6,borderRadius:999},badgeText:{fontSize:9,fontWeight:'900',letterSpacing:.7},messageCard:{padding:13,borderRadius:15,borderWidth:1},message:{fontSize:12,lineHeight:18,fontWeight:'800'},qrCard:{padding:18,borderRadius:22,borderWidth:1,gap:10,alignItems:'center'},qrFrame:{backgroundColor:'#fff',padding:10,borderRadius:18},loadingQr:{height:248,width:248,borderRadius:18,alignItems:'center',justifyContent:'center'},kicker:{alignSelf:'stretch',fontSize:9,fontWeight:'900',letterSpacing:1.2},code:{fontSize:12,fontWeight:'900',letterSpacing:1},meta:{fontSize:12,lineHeight:18,fontWeight:'700'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8,alignSelf:'stretch'},action:{minHeight:46,paddingHorizontal:13,paddingVertical:10,borderRadius:999,borderWidth:1,justifyContent:'center',alignItems:'center',flexGrow:1},actionText:{fontSize:12,fontWeight:'900'},card:{padding:16,borderRadius:19,borderWidth:1,gap:7},cardTitle:{fontSize:19,fontWeight:'900'},back:{minHeight:46,borderWidth:1,borderRadius:14,alignItems:'center',justifyContent:'center'},backText:{fontWeight:'900'}});
