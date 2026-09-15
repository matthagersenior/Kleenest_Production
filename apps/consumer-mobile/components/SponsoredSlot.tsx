import * as Linking from 'expo-linking';
import { useEffect,useRef,useState } from 'react';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { listSponsoredCards,recordSponsoredEvent,type SponsoredCard } from '../services/sponsorship';
import { useConsumerTheme } from '../services/theme';

export function SponsoredSlot({surface,context={},contextClass}:{surface:string;context?:Record<string,unknown>;contextClass?:string}){
  const theme=useConsumerTheme();
  const[card,setCard]=useState<SponsoredCard|null>(null);
  const recorded=useRef('');
  useEffect(()=>{let active=true;void listSponsoredCards(surface,context).then(rows=>{if(active)setCard(rows[0]||null)});return()=>{active=false}},[surface,JSON.stringify(context)]);
  useEffect(()=>{if(!card||recorded.current===card.campaign_id)return;recorded.current=card.campaign_id;void recordSponsoredEvent(card,'impression',contextClass||surface)},[card,contextClass,surface]);
  const activeCard=card;
  if(!activeCard)return null;
  async function open(){void recordSponsoredEvent(activeCard,'click',contextClass||surface);await Linking.openURL(activeCard.destination_url)}
  function dismiss(){void recordSponsoredEvent(activeCard,'dismiss',contextClass||surface);setCard(null)}
  return <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
    <View style={s.top}><Text style={[s.label,{color:theme.muted}]}>{activeCard.label.toUpperCase()} · {activeCard.sponsor_name}</Text><Pressable accessibilityLabel="Hide sponsored card" onPress={dismiss}><Text style={[s.close,{color:theme.muted}]}>×</Text></Pressable></View>
    <Text style={[s.title,{color:theme.ink}]}>{activeCard.headline}</Text>
    {activeCard.body?<Text style={[s.body,{color:theme.muted}]}>{activeCard.body}</Text>:null}
    <Pressable style={[s.cta,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={open}><Text style={[s.ctaText,{color:theme.accent}]}>{activeCard.cta_label} →</Text></Pressable>
    <Text style={[s.note,{color:theme.muted}]}>Paid placement. Sponsorship does not change Kleenest trust, freshness, verification or ranking.</Text>
  </View>;
}
const s=StyleSheet.create({
  card:{borderRadius:17,borderWidth:1,padding:13,gap:5},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  label:{fontSize:8,fontWeight:'900',letterSpacing:1.2},
  close:{fontSize:22,lineHeight:22,fontWeight:'700'},
  title:{fontSize:16,fontWeight:'900'},
  body:{fontSize:12,lineHeight:18},
  cta:{alignSelf:'flex-start',borderWidth:1,borderRadius:11,paddingHorizontal:11,paddingVertical:8,marginTop:3},
  ctaText:{fontSize:10,fontWeight:'900'},
  note:{fontSize:9,lineHeight:13,fontWeight:'700',marginTop:2},
});
