import * as Linking from 'expo-linking';
import { useEffect,useRef,useState,type ReactNode } from 'react';
import { Image,Pressable,StyleSheet,Text,View } from 'react-native';
import { listSponsoredCards,recordSponsoredEvent,type SponsoredCard } from '../services/sponsorship';
import { useConsumerTheme } from '../services/theme';

export function SponsoredSlot({surface,context={},contextClass,fallback=null}:{surface:string;context?:Record<string,unknown>;contextClass?:string;fallback?:ReactNode}){
  const theme=useConsumerTheme();
  const[card,setCard]=useState<SponsoredCard|null>(null);
  const[loaded,setLoaded]=useState(false);
  const[dismissed,setDismissed]=useState(false);
  const[imageFailed,setImageFailed]=useState(false);
  const recorded=useRef('');
  useEffect(()=>{let active=true;setLoaded(false);setDismissed(false);setImageFailed(false);void listSponsoredCards(surface,context).then(rows=>{if(active){setCard(rows[0]||null);setLoaded(true)}}).catch(()=>{if(active){setCard(null);setLoaded(true)}});return()=>{active=false}},[surface,JSON.stringify(context)]);
  useEffect(()=>{if(!card||recorded.current===card.campaign_id)return;recorded.current=card.campaign_id;void recordSponsoredEvent(card,'impression',contextClass||surface)},[card,contextClass,surface]);
  if(!card)return loaded&&!dismissed?<>{fallback}</>:null;
  async function open(current:SponsoredCard){void recordSponsoredEvent(current,'click',contextClass||surface);await Linking.openURL(current.destination_url)}
  function dismiss(current:SponsoredCard){void recordSponsoredEvent(current,'dismiss',contextClass||surface);setDismissed(true);setCard(null)}
  return <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
    <View style={s.top}><View style={s.brand}>{card.logo_url?<Image source={{uri:card.logo_url}} accessibilityLabel={`${card.sponsor_name} logo`} resizeMode="contain" style={s.logo}/>:null}<Text style={[s.label,{color:theme.muted}]}>{card.label.toUpperCase()} · {card.sponsor_name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Hide sponsored card" onPress={()=>dismiss(card)}><Text style={[s.close,{color:theme.muted}]}>×</Text></Pressable></View>
    {card.image_url&&card.creative_mode!=='text_only'&&!imageFailed?<Image source={{uri:card.image_url}} accessibilityLabel={card.image_alt||`${card.sponsor_name} sponsored image`} resizeMode="cover" style={s.image} onError={()=>setImageFailed(true)}/>:null}
    {card.creative_mode!=='image_only'||imageFailed?<Text style={[s.title,{color:theme.ink}]}>{card.headline}</Text>:null}
    {(card.creative_mode!=='image_only'||imageFailed)&&card.body?<Text style={[s.body,{color:theme.muted}]}>{card.body}</Text>:null}
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.cta_label} from ${card.sponsor_name}`} style={[s.cta,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={()=>void open(card)}><Text style={[s.ctaText,{color:theme.accent}]}>{card.cta_label} →</Text></Pressable>
    <Text style={[s.note,{color:theme.muted}]}>Paid placement. Sponsorship does not change Kleenest trust, freshness, verification or ranking.</Text>
  </View>;
}
const s=StyleSheet.create({
  card:{borderRadius:17,borderWidth:1,padding:13,gap:5},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  brand:{flexDirection:'row',alignItems:'center',gap:7,flex:1},
  logo:{width:26,height:26,borderRadius:6},
  label:{fontSize:8,fontWeight:'900',letterSpacing:1.2},
  close:{fontSize:22,lineHeight:22,fontWeight:'700'},
  image:{width:'100%',aspectRatio:16/9,borderRadius:12,marginBottom:3},
  title:{fontSize:16,fontWeight:'900'},
  body:{fontSize:12,lineHeight:18},
  cta:{alignSelf:'flex-start',borderWidth:1,borderRadius:11,paddingHorizontal:11,paddingVertical:8,marginTop:3},
  ctaText:{fontSize:10,fontWeight:'900'},
  note:{fontSize:9,lineHeight:13,fontWeight:'700',marginTop:2},
});
