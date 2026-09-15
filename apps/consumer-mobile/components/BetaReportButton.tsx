import { useEffect,useState } from 'react';
import { Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import type { BetaReportCategory } from '@kleenest/mobile-core';
import { betaReportDiagnostics,recordBetaBreadcrumb,sendManualBetaReport } from '../services/betaReporting';
import { captureConsumerFeedbackEvent } from '../services/consumerTelemetry';
import { useConsumerTheme } from '../services/theme';

type Sentiment='frustrating'|'fine'|'great';
type FeedbackKind='bug'|'confusing'|'missing'|'idea'|'other';

const SENTIMENTS:{key:Sentiment;label:string;short:string}[]=[
  {key:'frustrating',label:'😕 Frustrating',short:'Frustrating'},
  {key:'fine',label:'😐 Fine',short:'Fine'},
  {key:'great',label:'😍 Great',short:'Great'},
];

const KINDS:{key:FeedbackKind;label:string;category:BetaReportCategory;placeholder:string}[]=[
  {key:'bug',label:'Bug',category:'bug',placeholder:'What broke or did not work the way you expected?'},
  {key:'confusing',label:'Confusing',category:'feedback',placeholder:'What was hard to understand or find?'},
  {key:'missing',label:'Missing something',category:'feedback',placeholder:'What did you expect to be here?'},
  {key:'idea',label:'Idea',category:'feedback',placeholder:'What would make Kleenest better for you?'},
  {key:'other',label:'Other',category:'other',placeholder:'Tell us what is on your mind.'},
];

export default function BetaReportButton({route}:{route:string}){
  const theme=useConsumerTheme();
  const[visible,setVisible]=useState(false);
  const[sentiment,setSentiment]=useState<Sentiment|null>(null);
  const[kind,setKind]=useState<FeedbackKind>('bug');
  const[note,setNote]=useState('');
  const[busy,setBusy]=useState(false);
  const[result,setResult]=useState('');
  const[showDiagnostics,setShowDiagnostics]=useState(false);
  const[diagnostics,setDiagnostics]=useState<Record<string,unknown>>({});
  const[greatPulseSent,setGreatPulseSent]=useState(false);

  const selectedKind=KINDS.find(item=>item.key===kind)||KINDS[0];

  useEffect(()=>{if(visible&&showDiagnostics)void betaReportDiagnostics(route).then(setDiagnostics)},[visible,showDiagnostics,route]);

  function open(){
    setResult('');
    setVisible(true);
    setShowDiagnostics(false);
    setGreatPulseSent(false);
    recordBetaBreadcrumb('tell_kleenest_open',route);
    captureConsumerFeedbackEvent('tell_kleenest_open',{route,metadata:{surface:'global_fab'}});
  }

  function chooseSentiment(next:Sentiment){
    setSentiment(next);
    setResult('Thanks — that is enough by itself. Add a note only if you want to tell us more.');
    recordBetaBreadcrumb('pulse_response',route,next);
    captureConsumerFeedbackEvent('pulse_response',{route,metadata:{sentiment:next}});
    if(next==='great'&&!greatPulseSent){
      setGreatPulseSent(true);
      recordBetaBreadcrumb('voice_of_customer_pulse',route,'great');
      void sendManualBetaReport({
        category:'feedback',
        route,
        message:`Great feedback from ${route||'unknown screen'}.`,
        metadata:{
          manual:true,
          feedback_surface:'tell_kleenest',
          feedback_kind:'pulse',
          sentiment:'great',
          pulse_only:true,
        },
      });
    }
  }

  function chooseKind(next:FeedbackKind){
    setKind(next);
    setResult('');
    recordBetaBreadcrumb('feedback_detail_opened',route,next);
    captureConsumerFeedbackEvent('feedback_detail_opened',{route,metadata:{feedback_kind:next,sentiment:sentiment||'not_selected'}});
  }

  async function send(){
    if(busy)return;
    setBusy(true);
    setResult('');
    try{
      const response=await sendManualBetaReport({
        category:selectedKind.category,
        route,
        message:note.trim()||`${selectedKind.label} feedback from ${route||'unknown screen'}${sentiment?` · ${sentiment}`:''}.`,
        metadata:{
          manual:true,
          feedback_surface:'tell_kleenest',
          feedback_kind:kind,
          sentiment:sentiment||'not_selected',
        },
      });
      captureConsumerFeedbackEvent('feedback_submitted',{
        route,
        metadata:{feedback_kind:kind,sentiment:sentiment||'not_selected',delivery:response.status},
      });
      recordBetaBreadcrumb('feedback_submitted',route,kind,{sentiment:sentiment||'not_selected',delivery:response.status});
      if(response.status==='sent')setResult('Sent to Kleenest. Thank you for saying it plainly.');
      else setResult('Saved on this device. Kleenest will send it automatically when the live service is reachable.');
      setNote('');
    }finally{setBusy(false)}
  }

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Tell Kleenest what you think"
      onPress={open}
      style={[s.fab,{backgroundColor:theme.accent,borderColor:theme.line}]}
    >
      <Text style={[s.fabText,{color:theme.accentText}]}>✦ Tell Kleenest</Text>
    </Pressable>
    <Modal transparent visible={visible} animationType="slide" accessibilityViewIsModal onRequestClose={()=>setVisible(false)}>
      <View style={s.overlay}>
        <Pressable accessibilityRole="button" style={StyleSheet.absoluteFill} accessibilityLabel="Close Tell Kleenest" onPress={()=>setVisible(false)}/>
        <View style={[s.sheet,{backgroundColor:theme.surface,borderColor:theme.line}]}>
          <View style={s.head}>
            <View style={{flex:1,gap:3}}>
              <Text style={[s.kicker,{color:theme.accent}]}>TELL KLEENEST</Text>
              <Text style={[s.title,{color:theme.ink}]}>How was Kleenest just now?</Text>
              <Text style={[s.body,{color:theme.muted}]}>One tap is enough. If something felt wrong, confusing, missing or surprisingly good, you can add the detail here without hunting for a support menu.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={()=>setVisible(false)} style={[s.close,{backgroundColor:theme.accentSoft}]}>
              <Text style={[s.closeText,{color:theme.accent}]}>×</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:560}} contentContainerStyle={{gap:13}}>
            <View style={s.sentimentRow}>
              {SENTIMENTS.map(item=>{
                const active=sentiment===item.key;
                return <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Kleenest felt ${item.short.toLowerCase()}`}
                  accessibilityState={{selected:active}}
                  onPress={()=>chooseSentiment(item.key)}
                  style={[s.sentiment,{backgroundColor:active?theme.accent:theme.surfaceRaised,borderColor:active?theme.accent:theme.line}]}
                >
                  <Text style={[s.sentimentText,{color:active?theme.accentText:theme.ink}]}>{item.label}</Text>
                </Pressable>;
              })}
            </View>

            <View style={[s.divider,{backgroundColor:theme.line}]}/>

            <View style={{gap:7}}>
              <Text style={[s.detailTitle,{color:theme.ink}]}>Want to tell us more?</Text>
              <Text style={[s.detailBody,{color:theme.muted}]}>Pick the closest fit. The note is optional.</Text>
              <View style={s.chips}>
                {KINDS.map(item=>{
                  const active=kind===item.key;
                  return <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityState={{selected:active}}
                    onPress={()=>chooseKind(item.key)}
                    style={[s.chip,{backgroundColor:active?theme.accent:theme.accentSoft,borderColor:theme.line}]}
                  >
                    <Text style={[s.chipText,{color:active?theme.accentText:theme.accent}]}>{item.label}</Text>
                  </Pressable>;
                })}
              </View>
            </View>

            <TextInput
              accessibilityLabel="Tell Kleenest more"
              placeholder={selectedKind.placeholder}
              placeholderTextColor={theme.muted}
              value={note}
              onChangeText={setNote}
              maxLength={1200}
              multiline
              textAlignVertical="top"
              style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showDiagnostics?'Hide attached technical context':'Show attached technical context'}
              onPress={()=>setShowDiagnostics(value=>!value)}
              style={[s.contextToggle,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}
            >
              <Text style={[s.contextToggleText,{color:theme.accent}]}>{showDiagnostics?'Hide technical context':'What gets attached?'}</Text>
              <Text style={[s.contextToggleIcon,{color:theme.accent}]}>{showDiagnostics?'−':'+'}</Text>
            </Pressable>

            {showDiagnostics?<View style={[s.diagnosticCard,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
              <Text style={[s.diagnosticTitle,{color:theme.ink}]}>Technical context</Text>
              <Text style={[s.diagnosticLine,{color:theme.muted}]}>Screen · {String(diagnostics.route||route||'unknown')}</Text>
              <Text style={[s.diagnosticLine,{color:theme.muted}]}>App · {String(diagnostics.appVersion||'…')} · Runtime {String(diagnostics.runtimeVersion||'…')}</Text>
              <Text style={[s.diagnosticLine,{color:theme.muted}]}>Device · {String(diagnostics.platform||'…')} · OTA {String(diagnostics.channel||'…')}</Text>
              <Text style={[s.privacy,{color:theme.muted}]}>No microphone recording, photo, screenshot or precise location is attached automatically.</Text>
            </View>:null}

            {result?<View accessibilityLiveRegion="polite" style={[s.notice,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={[s.noticeText,{color:theme.accent}]}>{result}</Text></View>:null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send feedback to Kleenest"
              accessibilityState={{disabled:busy}}
              disabled={busy}
              onPress={()=>void send()}
              style={[s.send,{backgroundColor:theme.accent},busy&&{opacity:.55}]}
            >
              <Text style={[s.sendText,{color:theme.accentText}]}>{busy?'Sending…':'Send to Kleenest'}</Text>
            </Pressable>
            <Text style={[s.footerHint,{color:theme.muted}]}>You can close this after choosing a face. The pulse response is already counted; sending detail is optional.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const s=StyleSheet.create({
  fab:{position:'absolute',right:14,bottom:78,zIndex:1000,elevation:12,borderWidth:1,borderRadius:999,paddingHorizontal:13,paddingVertical:10,shadowColor:'#000',shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:5}},
  fabText:{fontSize:11,fontWeight:'900',letterSpacing:.15},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.46)',justifyContent:'flex-end'},
  sheet:{borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,padding:18,paddingBottom:28,gap:13,maxHeight:'86%'},
  head:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.4},
  title:{fontSize:25,lineHeight:29,fontWeight:'900'},
  body:{fontSize:13,lineHeight:19,fontWeight:'600'},
  close:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},
  closeText:{fontSize:26,lineHeight:28,fontWeight:'700'},
  sentimentRow:{flexDirection:'row',gap:7},
  sentiment:{flex:1,minHeight:52,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center',paddingHorizontal:8},
  sentimentText:{fontSize:12,fontWeight:'900',textAlign:'center'},
  divider:{height:1,width:'100%'},
  detailTitle:{fontSize:17,fontWeight:'900'},
  detailBody:{fontSize:12,lineHeight:17,fontWeight:'600'},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},
  chip:{borderRadius:999,borderWidth:1,paddingHorizontal:11,paddingVertical:9},
  chipText:{fontSize:11,fontWeight:'900'},
  input:{minHeight:96,borderWidth:1,borderRadius:16,padding:13,fontSize:14,lineHeight:20},
  contextToggle:{minHeight:46,borderWidth:1,borderRadius:14,paddingHorizontal:13,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  contextToggleText:{fontSize:12,fontWeight:'900'},
  contextToggleIcon:{fontSize:20,fontWeight:'900'},
  diagnosticCard:{borderWidth:1,borderRadius:16,padding:12,gap:4},
  diagnosticTitle:{fontSize:13,fontWeight:'900',marginBottom:2},
  diagnosticLine:{fontSize:11,lineHeight:16,fontWeight:'700'},
  privacy:{fontSize:10,lineHeight:15,marginTop:5},
  notice:{borderWidth:1,borderRadius:13,padding:11},
  noticeText:{fontSize:12,lineHeight:17,fontWeight:'800'},
  send:{minHeight:50,borderRadius:15,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
  sendText:{fontSize:14,fontWeight:'900'},
  footerHint:{fontSize:10,lineHeight:15,textAlign:'center',fontWeight:'600'},
});
