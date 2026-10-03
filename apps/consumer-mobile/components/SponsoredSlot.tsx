import * as Linking from 'expo-linking';
import { useEffect,useRef,useState } from 'react';
import { Image,Pressable,StyleSheet,Text,View } from 'react-native';
import { listSponsoredCards,recordSponsoredEvent,type SponsoredCard } from '../services/sponsorship';
import { useConsumerTheme } from '../services/theme';

export function SponsoredSlot({surface,context={},contextClass,compact=false}:{surface:string;context?:Record<string,unknown>;contextClass?:string;compact?:boolean}){
  const theme=useConsumerTheme();
  const[card,setCard]=useState<SponsoredCard|null>(null);
  const[imageFailed,setImageFailed]=useState(false);
  const recorded=useRef('');
  useEffect(()=>{let active=true;setImageFailed(false);void listSponsoredCards(surface,context).then(rows=>{if(active)setCard(rows[0]||null)}).catch(()=>{if(active)setCard(null)});return()=>{active=false}},[surface,JSON.stringify(context)]);
  useEffect(()=>{if(!card||recorded.current===card.campaign_id)return;recorded.current=card.campaign_id;void recordSponsoredEvent(card,'impression',contextClass||surface)},[card,contextClass,surface]);
  if(!card)return null;
  async function open(current:SponsoredCard){void recordSponsoredEvent(current,'click',contextClass||surface);await Linking.openURL(current.destination_url)}
  function dismiss(current:SponsoredCard){void recordSponsoredEvent(current,'dismiss',contextClass||surface);setCard(null)}
  const hasImage=Boolean(card.image_url&&card.creative_mode!=='text_only'&&!imageFailed);
  const showText=card.creative_mode!=='image_only'||imageFailed;
  const cta=<Pressable accessibilityRole="button" accessibilityLabel={`${card.cta_label} from ${card.sponsor_name}`} style={[s.cta,compact&&s.ctaCompact,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={()=>void open(card)}><Text style={[s.ctaText,{color:theme.accent}]}>{card.cta_label} →</Text></Pressable>;
  return <View style={[s.card,compact&&s.cardCompact,{backgroundColor:theme.surface,borderColor:theme.line}]}>
    <View style={s.top}><View style={s.brand}>{card.logo_url?<Image source={{uri:card.logo_url}} accessibilityLabel={`${card.sponsor_name} logo`} resizeMode="contain" style={s.logo}/>:null}<Text style={[s.label,compact&&s.labelCompact,{color:theme.muted}]}>{card.label.toUpperCase()} · {card.sponsor_name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Hide sponsored card" onPress={()=>dismiss(card)}><Text style={[s.close,{color:theme.muted}]}>×</Text></Pressable></View>
    {compact?<View style={s.compactCreative}>
      {hasImage?<Image source={{uri:card.image_url!}} accessibilityLabel={card.image_alt||`${card.sponsor_name} sponsored image`} resizeMode="cover" style={s.imageCompact} onError={()=>setImageFailed(true)}/>:null}
      <View style={s.compactCopy}>
        {showText?<Text numberOfLines={2} style={[s.title,s.titleCompact,{color:theme.ink}]}>{card.headline}</Text>:null}
        {showText&&card.body?<Text numberOfLines={2} style={[s.body,s.bodyCompact,{color:theme.muted}]}>{card.body}</Text>:null}
        {cta}
      </View>
    </View>:<>
      {hasImage?<Image source={{uri:card.image_url!}} accessibilityLabel={card.image_alt||`${card.sponsor_name} sponsored image`} resizeMode="cover" style={s.image} onError={()=>setImageFailed(true)}/>:null}
      {showText?<Text style={[s.title,{color:theme.ink}]}>{card.headline}</Text>:null}
      {showText&&card.body?<Text style={[s.body,{color:theme.muted}]}>{card.body}</Text>:null}
      {cta}
    </>}
    <Text numberOfLines={compact?2:undefined} style={[s.note,compact&&s.noteCompact,{color:theme.muted}]}>Paid placement. Sponsorship does not change Kleenest trust, freshness, verification or ranking.</Text>
  </View>;
}
const s=StyleSheet.create({
  card:{borderRadius:17,borderWidth:1,padding:13,gap:5},
  cardCompact:{padding:10,gap:5},
  top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  compactCreative:{flexDirection:'row',alignItems:'center',gap:10},
  compactCopy:{flex:1,minWidth:0,alignItems:'flex-start',gap:3},
  imageCompact:{width:104,height:74,borderRadius:10,flexShrink:0},
  brand:{flexDirection:'row',alignItems:'center',gap:7,flex:1},
  logo:{width:26,height:26,borderRadius:6},
  label:{fontSize:8,fontWeight:'900',letterSpacing:1.2},
  labelCompact:{fontSize:9,letterSpacing:0.9},
  close:{fontSize:22,lineHeight:22,fontWeight:'700'},
  image:{width:'100%',aspectRatio:16/9,borderRadius:12,marginBottom:3},
  title:{fontSize:16,fontWeight:'900'},
  titleCompact:{fontSize:14},
  body:{fontSize:12,lineHeight:18},
  bodyCompact:{fontSize:11,lineHeight:15},
  cta:{alignSelf:'flex-start',borderWidth:1,borderRadius:11,paddingHorizontal:11,paddingVertical:8,marginTop:3},
  ctaCompact:{paddingHorizontal:10,paddingVertical:6,marginTop:1},
  ctaText:{fontSize:10,fontWeight:'900'},
  note:{fontSize:9,lineHeight:13,fontWeight:'700',marginTop:2},
  noteCompact:{fontSize:8,lineHeight:11,marginTop:0},
});
