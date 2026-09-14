import { useEffect,useState } from 'react';
import { Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import type { BetaReportCategory } from '@kleenest/mobile-core';
import { betaReportDiagnostics,sendManualBetaReport } from '../services/betaReporting';
import { useConsumerTheme } from '../services/theme';

const CATEGORIES:{key:BetaReportCategory;label:string}[]=[
  {key:'bug',label:'Bug'},
  {key:'glitch',label:'Glitch'},
  {key:'network',label:'Connection'},
  {key:'data',label:'Wrong data'},
  {key:'performance',label:'Slow / stuck'},
  {key:'feedback',label:'Feedback'},
];

export default function BetaReportButton({route}:{route:string}){
  const theme=useConsumerTheme();
  const[visible,setVisible]=useState(false);
  const[category,setCategory]=useState<BetaReportCategory>('bug');
  const[note,setNote]=useState('');
  const[busy,setBusy]=useState(false);
  const[result,setResult]=useState('');
  const[diagnostics,setDiagnostics]=useState<Record<string,unknown>>({});

  useEffect(()=>{if(visible)void betaReportDiagnostics(route).then(setDiagnostics)},[visible,route]);

  async function send(){
    if(busy)return;
    setBusy(true);
    setResult('');
    try{
      const response=await sendManualBetaReport({
        category,
        route,
        message:note.trim()||`User tapped Beta Report on ${route||'unknown screen'}.`,
        metadata:{manual:true},
      });
      if(response.status==='sent')setResult(`Report sent · incident ${response.receipt.incident_id.slice(0,8)}`);
      else setResult('Saved on this device. It will send automatically when Kleenest can reach the service.');
      setNote('');
      void betaReportDiagnostics(route).then(setDiagnostics);
    }finally{setBusy(false)}
  }

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Report a beta problem"
      onPress={()=>{setResult('');setVisible(true)}}
      style={[s.fab,{backgroundColor:theme.accent,borderColor:theme.line}]}
    >
      <Text style={[s.fabText,{color:theme.accentText}]}>🐞 Beta</Text>
    </Pressable>
    <Modal transparent visible={visible} animationType="slide" onRequestClose={()=>setVisible(false)}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close beta report" onPress={()=>setVisible(false)}/>
        <View style={[s.sheet,{backgroundColor:theme.surface,borderColor:theme.line}]}>
          <View style={s.head}>
            <View style={{flex:1,gap:3}}>
              <Text style={[s.kicker,{color:theme.accent}]}>BETA REPORT</Text>
              <Text style={[s.title,{color:theme.ink}]}>Something happened?</Text>
              <Text style={[s.body,{color:theme.muted}]}>Tap, describe it in your own words, and the app will attach the technical context.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={()=>setVisible(false)} style={[s.close,{backgroundColor:theme.accentSoft}]}>
              <Text style={[s.closeText,{color:theme.accent}]}>×</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{maxHeight:520}} contentContainerStyle={{gap:12}}>
            <View style={s.chips}>
              {CATEGORIES.map(item=>{
                const active=category===item.key;
                return <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityState={{selected:active}}
                  onPress={()=>setCategory(item.key)}
                  style={[s.chip,{backgroundColor:active?theme.accent:theme.accentSoft,borderColor:theme.line}]}
                >
                  <Text style={[s.chipText,{color:active?theme.accentText:theme.accent}]}>{item.label}</Text>
                </Pressable>;
              })}
            </View>

            <TextInput
              accessibilityLabel="Describe the beta problem"
              placeholder="What did you notice? Example: I tapped Check In and nothing happened."
              placeholderTextColor={theme.muted}
              value={note}
              onChangeText={setNote}
              maxLength={1200}
              multiline
              textAlignVertical="top"
              style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}
            />

            <View style={[s.diagnosticCard,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
              <Text style={[s.diagnosticTitle,{color:theme.ink}]}>What will be attached</Text>
              <Text style={[s.diagnosticLine,{color:theme.muted}]}>Screen · {String(diagnostics.route||route||'unknown')}</Text>
              <Text style={[s.diagnosticLine,{color:theme.muted}]}>App · {String(diagnostics.appVersion||'…')} · Runtime {String(diagnostics.runtimeVersion||'…')}</Text>
              <Text style={[s.diagnosticLine,{color:theme.muted}]}>Device · {String(diagnostics.platform||'…')} · OTA {String(diagnostics.channel||'…')}</Text>
              <Text style={[s.diagnosticLine,{color:theme.muted}]}>Recent in-app breadcrumbs · {String(diagnostics.breadcrumbs??0)} · Queued reports {String(diagnostics.queued??0)}</Text>
              <Text style={[s.privacy,{color:theme.muted}]}>No microphone recording, photo, screenshot, or precise location is attached by this button automatically.</Text>
            </View>

            {result?<View style={[s.notice,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={[s.noticeText,{color:theme.accent}]}>{result}</Text></View>:null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send beta report"
              accessibilityState={{disabled:busy}}
              disabled={busy}
              onPress={()=>void send()}
              style={[s.send,{backgroundColor:theme.accent},busy&&{opacity:.55}]}
            >
              <Text style={[s.sendText,{color:theme.accentText}]}>{busy?'Saving report…':'Send beta report'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const s=StyleSheet.create({
  fab:{position:'absolute',right:14,bottom:78,zIndex:1000,elevation:12,borderWidth:1,borderRadius:999,paddingHorizontal:12,paddingVertical:9,shadowColor:'#000',shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:5}},
  fabText:{fontSize:11,fontWeight:'900',letterSpacing:.2},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,.46)',justifyContent:'flex-end'},
  sheet:{borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,padding:18,paddingBottom:28,gap:13,maxHeight:'84%'},
  head:{flexDirection:'row',gap:12,alignItems:'flex-start'},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.4},
  title:{fontSize:25,lineHeight:29,fontWeight:'900'},
  body:{fontSize:13,lineHeight:19,fontWeight:'600'},
  close:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},
  closeText:{fontSize:26,lineHeight:28,fontWeight:'700'},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},
  chip:{borderRadius:999,borderWidth:1,paddingHorizontal:11,paddingVertical:9},
  chipText:{fontSize:11,fontWeight:'900'},
  input:{minHeight:112,borderWidth:1,borderRadius:16,padding:13,fontSize:14,lineHeight:20},
  diagnosticCard:{borderWidth:1,borderRadius:16,padding:12,gap:4},
  diagnosticTitle:{fontSize:13,fontWeight:'900',marginBottom:2},
  diagnosticLine:{fontSize:11,lineHeight:16,fontWeight:'700'},
  privacy:{fontSize:10,lineHeight:15,marginTop:5},
  notice:{borderWidth:1,borderRadius:13,padding:11},
  noticeText:{fontSize:12,lineHeight:17,fontWeight:'800'},
  send:{minHeight:50,borderRadius:15,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
  sendText:{fontSize:14,fontWeight:'900'},
});
