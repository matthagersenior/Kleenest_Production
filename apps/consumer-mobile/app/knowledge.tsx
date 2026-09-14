import { router, useLocalSearchParams } from 'expo-router';
import { getMobileLocation } from '@kleenest/mobile-core';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { submitPriorKnowledge, type PriorKnowledgeCleanliness, type PriorKnowledgeRecency } from '../services/priorKnowledge';
import { useConsumerTheme } from '../services/theme';

const RECENCY: Array<{value:PriorKnowledgeRecency;label:string;detail:string}> = [
  { value:'today', label:'Today', detail:'Historical knowledge from today; not device-verified presence.' },
  { value:'this_week', label:'This week', detail:'Within about the last week.' },
  { value:'this_month', label:'This month', detail:'Within about the last month.' },
  { value:'few_months', label:'A few months ago', detail:'Useful, but aging knowledge.' },
  { value:'long_time', label:'A long time ago', detail:'Background knowledge only.' },
  { value:'unknown', label:"I don't remember", detail:'Kept as background knowledge without freshness credit.' },
];

const FACTS = [
  'Public restroom',
  'Accessible stall',
  'Family restroom',
  'Changing table',
  'Purchase required',
  'Door code or key required',
  'Easy to find',
  'Hard to find',
  'Usually stocked',
  'Often busy',
];

const CLEANLINESS: Array<{value:PriorKnowledgeCleanliness;label:string}> = [
  { value:'usually_spotless', label:'Usually spotless' },
  { value:'usually_clean', label:'Usually clean' },
  { value:'mixed', label:'Mixed / varies' },
  { value:'often_needs_attention', label:'Often needs attention' },
  { value:'unknown', label:'Not sure' },
];

export default function PriorKnowledgeScreen(){
  const theme=useConsumerTheme();
  const params=useLocalSearchParams<{locationId?:string;name?:string}>();
  const locationId=String(params.locationId||'');
  const [locationName,setLocationName]=useState(String(params.name||''));
  const [recency,setRecency]=useState<PriorKnowledgeRecency>('this_month');
  const [facts,setFacts]=useState<string[]>([]);
  const [cleanliness,setCleanliness]=useState<PriorKnowledgeCleanliness>('unknown');
  const [accessNotes,setAccessNotes]=useState('');
  const [notes,setNotes]=useState('');
  const [message,setMessage]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [submitted,setSubmitted]=useState(false);

  useEffect(()=>{
    if(!locationId||locationName)return;
    getMobileLocation(locationId).then((row:any)=>setLocationName(String(row?.name||'This location'))).catch(()=>{});
  },[locationId,locationName]);

  const meaningful=useMemo(()=>facts.length>0||cleanliness!=='unknown'||accessNotes.trim().length>0||notes.trim().length>0,[facts,cleanliness,accessNotes,notes]);
  function toggleFact(value:string){setFacts(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value]);}

  async function submit(){
    if(!locationId||!meaningful||submitting)return;
    setSubmitting(true);setMessage('');
    try{
      const result:any=await submitPriorKnowledge(locationId,{knowledgeRecency:recency,facts,cleanlinessTendency:cleanliness,accessNotes,notes});
      const points=Number(result?.progression?.points||0);
      setSubmitted(true);
      setMessage(`Recorded as prior knowledge — not a check-in or verified current visit.${points>0?` +${points} contribution points.`:''}`);
    }catch(error:any){
      const detail=String(error?.message||'');
      setMessage(detail.includes('AUTH_REQUIRED')?'Sign in to share what you know.':detail.includes('ADD_SOMETHING_YOU_KNOW')?'Choose at least one fact or add a note.':detail||'Your prior knowledge could not be saved.');
    }finally{setSubmitting(false)}
  }

  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}>
    <ScrollView contentContainerStyle={s.page}>
      <Pressable onPress={()=>router.back()}><Text style={[s.back,{color:theme.accent}]}>‹ Back</Text></Pressable>
      <View style={[s.hero,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <Text style={[s.eyebrow,{color:theme.accent}]}>I KNOW THIS PLACE</Text>
        <Text style={[s.title,{color:theme.ink}]}>I Know This Place</Text>
        <Text style={[s.place,{color:theme.ink}]}>{locationName||'This location'}</Text>
        <Text style={[s.body,{color:theme.muted}]}>Share what you already know from past experience. This is deliberately separate from Check In: it does not prove you are there now and cannot create a verified current visit.</Text>
      </View>

      <View style={[s.guardrail,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}>
        <Text style={[s.guardrailTitle,{color:theme.ink}]}>Knowledge ≠ presence</Text>
        <Text style={[s.body,{color:theme.muted}]}>Kleenest stores this as historical member knowledge. It can earn contribution credit, but not check-in, current-freshness, or verified-visit credit. Later corroboration can strengthen the claim without rewriting its provenance.</Text>
      </View>

      <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <Text style={[s.sectionTitle,{color:theme.ink}]}>When were you last here?</Text>
        <View style={s.wrap}>{RECENCY.map(choice=><Pressable key={choice.value} onPress={()=>setRecency(choice.value)} style={[s.chip,{borderColor:theme.line,backgroundColor:recency===choice.value?theme.accent:theme.surfaceRaised}]}><Text style={{color:recency===choice.value?theme.accentText:theme.ink,fontWeight:'900'}}>{choice.label}</Text></Pressable>)}</View>
        <Text style={[s.help,{color:theme.muted}]}>{RECENCY.find(choice=>choice.value===recency)?.detail}</Text>
      </View>

      <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <Text style={[s.sectionTitle,{color:theme.ink}]}>What do you already know?</Text>
        <View style={s.wrap}>{FACTS.map(fact=>{const selected=facts.includes(fact);return <Pressable key={fact} onPress={()=>toggleFact(fact)} style={[s.chip,{borderColor:selected?theme.accent:theme.line,backgroundColor:selected?theme.accentSoft:theme.surfaceRaised}]}><Text style={{color:selected?theme.accent:theme.ink,fontWeight:'800'}}>{selected?'✓ ':''}{fact}</Text></Pressable>})}</View>
      </View>

      <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
        <Text style={[s.sectionTitle,{color:theme.ink}]}>Cleanliness tendency</Text>
        <View style={s.wrap}>{CLEANLINESS.map(choice=><Pressable key={choice.value} onPress={()=>setCleanliness(choice.value)} style={[s.chip,{borderColor:theme.line,backgroundColor:cleanliness===choice.value?theme.accent:theme.surfaceRaised}]}><Text style={{color:cleanliness===choice.value?theme.accentText:theme.ink,fontWeight:'800'}}>{choice.label}</Text></Pressable>)}</View>
        <Text style={[s.label,{color:theme.ink}]}>ACCESS / ENTRANCE TIP</Text>
        <TextInput value={accessNotes} onChangeText={setAccessNotes} maxLength={500} placeholder="Code, key, purchase rule, entrance, hours…" placeholderTextColor={theme.muted} style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
        <Text style={[s.label,{color:theme.ink}]}>ANYTHING ELSE</Text>
        <TextInput value={notes} onChangeText={setNotes} maxLength={1200} multiline placeholder="What would help the next person?" placeholderTextColor={theme.muted} style={[s.input,s.textarea,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
      </View>

      {message?<View style={[s.notice,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={[s.body,{color:theme.ink}]}>{message}</Text></View>:null}
      {submitted?<Pressable style={[s.primary,{backgroundColor:theme.accent}]} onPress={()=>router.replace(`/location/${locationId}`)}><Text style={[s.primaryText,{color:theme.accentText}]}>Back to location</Text></Pressable>:<Pressable disabled={!meaningful||submitting} style={[s.primary,{backgroundColor:theme.accent},(!meaningful||submitting)&&s.disabled]} onPress={submit}><Text style={[s.primaryText,{color:theme.accentText}]}>{submitting?'Saving knowledge…':'Add what I know'}</Text></Pressable>}
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1},
  page:{padding:16,paddingBottom:40,gap:12},
  back:{fontWeight:'900',fontSize:13},
  hero:{padding:18,borderRadius:22,borderWidth:1,gap:6},
  eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.4},
  title:{fontSize:28,lineHeight:32,fontWeight:'900'},
  place:{fontSize:16,fontWeight:'900'},
  body:{fontSize:13,lineHeight:19,fontWeight:'650'},
  guardrail:{padding:14,borderRadius:18,borderWidth:1,gap:4},
  guardrailTitle:{fontSize:16,fontWeight:'900'},
  card:{padding:16,borderRadius:20,borderWidth:1,gap:11},
  sectionTitle:{fontSize:19,fontWeight:'900'},
  wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},
  chip:{paddingHorizontal:11,paddingVertical:9,borderRadius:999,borderWidth:1},
  help:{fontSize:11,lineHeight:16,fontWeight:'700'},
  label:{fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3},
  input:{borderWidth:1,borderRadius:14,padding:12,fontSize:14},
  textarea:{minHeight:110,textAlignVertical:'top'},
  notice:{padding:14,borderRadius:16,borderWidth:1},
  primary:{padding:15,borderRadius:15,alignItems:'center'},
  primaryText:{fontWeight:'900',fontSize:15},
  disabled:{opacity:.5},
});
