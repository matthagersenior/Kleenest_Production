import { Link } from 'expo-router';
import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { currentBusinessId } from '../services/capabilityWorkflows';
import {
  advanceBusinessRealWorldDemoLoop,
  getBusinessRealWorldDemoLoopState,
  resetBusinessRealWorldDemoLoop,
  startBusinessRealWorldDemoLoop,
} from '../services/onboarding';

type Step={id:string;phase:string;title:string;what_happens:string;why_it_matters:string;surface:string;evidence_keys:string[]};
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase());

export default function BusinessDemo(){
 const[businessId,setBusinessId]=useState('');
 const[data,setData]=useState<any>(null);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState('Loading guided demo loop…');

 async function load(){
  setBusy(true);
  try{
   const id=businessId||await currentBusinessId();
   setBusinessId(id);
   setData(await getBusinessRealWorldDemoLoopState(id));
   setMessage('');
  }catch(e:any){
   setData(null);
   setMessage(e?.message||'Select a managed Growth or Enterprise demo workspace to run this loop.');
  }finally{setBusy(false);}
 }

 async function act(kind:'start'|'advance'|'reset'){
  if(!businessId)return;
  setBusy(true);
  try{
   const next=kind==='start'
    ?await startBusinessRealWorldDemoLoop(businessId)
    :kind==='advance'
      ?await advanceBusinessRealWorldDemoLoop(businessId)
      :await resetBusinessRealWorldDemoLoop(businessId);
   setData(next);
   setMessage(kind==='start'?'Demo started. Follow the current step, inspect the real control if useful, then complete the step.':kind==='reset'?'Demo loop reset.':'Step completed and evidence captured.');
  }catch(e:any){
   setMessage(e?.message||'Demo action failed.');
  }finally{setBusy(false);}
 }

 useEffect(()=>{void load()},[]);

 const steps:Step[]=Array.isArray(data?.steps)?data.steps:[];
 const evidence=data?.evidence&&typeof data.evidence==='object'?data.evidence:{};
 const currentNumber=Number(data?.current_step||0);
 const completedSteps=Number(data?.completed_steps||0);
 const progressPct=Math.max(0,Math.min(Number(data?.progress_pct||0),100));
 const current=useMemo(()=>data?.started&&!data?.completed&&currentNumber>0?steps[currentNumber-1]||null:null,[data?.started,data?.completed,currentNumber,steps]);
 const proof=(step:Step)=>Array.isArray(step?.evidence_keys)?step.evidence_keys.map(key=>[key,evidence[key]] as const).filter(([,value])=>value!==undefined):[];

 return <ScrollView
  refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>}
  contentContainerStyle={s.page}
  contentInsetAdjustmentBehavior="automatic"
 >
  <View style={s.hero}>
   <Text style={s.kicker}>REAL-WORLD BUSINESS DEMO</Text>
   <Text style={s.title}>{data?.loop_title||'Follow the full operating loop, not a list of screens.'}</Text>
   <Text style={s.body}>{data?.loop_summary||'Start the scenario, complete each step, inspect the actual product surface and watch the loop progress to a measurable outcome.'}</Text>
  </View>

  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}

  {!data?<View style={s.card}>
   <Text style={s.cardTitle}>Choose a demo workspace</Text>
   <Text style={s.meta}>Use Downtown Coffee & Market for Growth or Matt Test Business for Enterprise.</Text>
   <Link href="/workspaces" style={s.linkButton}>Open Workspaces →</Link>
  </View>:<>
   <View style={s.statusCard}>
    <View style={{flex:1,minWidth:0}}>
     <Text style={s.eyebrow}>{String(data.scenario||'demo').toUpperCase()} LOOP · {String(data.workspace||'Demo workspace')}</Text>
     <Text style={s.statusTitle}>{data.completed?'Loop complete':data.started?`Step ${currentNumber} of ${steps.length}`:'Ready to start'}</Text>
     <Text style={s.meta}>{completedSteps} completed_steps · {Math.round(progressPct)} progress_pct</Text>
    </View>
    <View style={[s.stateBadge,data.completed&&s.stateBadgeDone]}><Text style={[s.stateBadgeText,data.completed&&s.stateBadgeTextDone]}>{data.completed?'COMPLETE':data.started?'IN PROGRESS':'READY'}</Text></View>
   </View>

   <View style={s.progressTrack}><View style={[s.progressFill,{width:`${progressPct}%`}]}/></View>

   {!data.started?<View style={s.startCard}>
    <Text style={s.startEyebrow}>HOW THE LOOP WORKS</Text>
    <Text style={s.startTitle}>Start with the business problem, then follow cause and effect.</Text>
    <Text style={s.meta}>Each step explains what changes, why the change matters, and which live demo evidence proves it. The real product screen is available for inspection, but it is no longer the demo itself.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void act('start')} style={[s.primary,busy&&s.disabled]}><Text style={s.primaryText}>Start demo</Text></Pressable>
   </View>:null}

   {current?<View style={s.currentCard}>
    <View style={s.currentTop}>
     <View style={s.stepNumber}><Text style={s.stepNumberText}>{currentNumber}</Text></View>
     <View style={{flex:1,minWidth:0}}>
      <Text style={s.currentLabel}>CURRENT STEP · {String(current.phase||'').toUpperCase()}</Text>
      <Text style={s.currentTitle}>{current.title}</Text>
     </View>
    </View>

    <View style={s.explainer}>
     <Text style={s.explainerLabel}>WHAT HAPPENS</Text>
     <Text style={s.explainerText}>{current.what_happens}</Text>
    </View>
    <View style={s.explainer}>
     <Text style={s.explainerLabel}>WHY IT MATTERS</Text>
     <Text style={s.explainerText}>{current.why_it_matters}</Text>
    </View>

    <View style={s.proofPanel}>
     <Text style={s.explainerLabel}>LIVE PROOF</Text>
     <View style={s.proofGrid}>{proof(current).map(([key,value])=><View key={key} style={s.proofChip}><Text style={s.proofValue}>{String(value)}</Text><Text style={s.proofLabel}>{label(key)}</Text></View>)}</View>
    </View>

    <View style={s.currentActions}>
     <Link href={current.surface as any} style={s.secondary}>Inspect real control →</Link>
     <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void act('advance')} style={[s.primary,busy&&s.disabled]}>
      <Text style={s.primaryText}>{currentNumber===steps.length?'Complete step + close loop':'Complete step'}</Text>
     </Pressable>
    </View>
   </View>:null}

   {data.completed?<View style={s.completeCard}>
    <Text style={s.completeEyebrow}>LOOP COMPLETED</Text>
    <Text style={s.completeTitle}>{data.completion_summary}</Text>
    <Text style={s.meta}>All {steps.length} steps were completed and their live evidence was captured. The final outcome feeds the next operating decision instead of ending as a static report.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void act('reset')} style={[s.restart,busy&&s.disabled]}><Text style={s.restartText}>Restart loop</Text></Pressable>
   </View>:null}

   <View style={s.timelineHeader}>
    <Text style={s.sectionTitle}>Full loop progression</Text>
    <Text style={s.meta}>Completed steps stay visible when you leave to inspect a real control and return.</Text>
   </View>

   <View style={s.timeline}>
    {steps.map((step,index)=>{
     const number=index+1;
     const done=data.completed||number<=completedSteps;
     const active=!data.completed&&data.started&&number===currentNumber;
     const event=Array.isArray(data.events)?data.events.find((row:any)=>Number(row.step_number)===number):null;
     return <View key={step.id} style={[s.timelineStep,done&&s.timelineDone,active&&s.timelineActive]}>
      <View style={[s.timelineDot,done&&s.timelineDotDone,active&&s.timelineDotActive]}><Text style={[s.timelineDotText,(done||active)&&s.timelineDotTextOn]}>{done?'✓':number}</Text></View>
      <View style={{flex:1,minWidth:0,gap:3}}>
       <Text style={s.timelinePhase}>{step.phase.toUpperCase()} · {done?'COMPLETED':active?'CURRENT':'UPCOMING'}</Text>
       <Text style={s.timelineTitle}>{step.title}</Text>
       <Text style={s.meta}>{step.what_happens}</Text>
       {event?<Text style={s.eventText}>Evidence captured when this step completed.</Text>:null}
      </View>
     </View>;
    })}
   </View>
  </>}
 </ScrollView>;
}

const s=StyleSheet.create({
 page:{padding:18,gap:12,backgroundColor:'#f2f5f2',paddingBottom:80},
 hero:{backgroundColor:'#123a2a',borderRadius:26,padding:20,gap:8},
 kicker:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#c4e4d2'},
 title:{fontSize:27,lineHeight:33,fontWeight:'900',color:'#fff'},
 body:{fontSize:14,lineHeight:21,color:'#e0ece5'},
 message:{fontSize:12,lineHeight:18,fontWeight:'800',color:'#596b61'},
 card:{backgroundColor:'#fff',borderRadius:18,padding:15,gap:8,borderWidth:1,borderColor:'#dbe5de'},
 cardTitle:{fontSize:17,fontWeight:'900',color:'#102218'},
 meta:{fontSize:12,lineHeight:18,color:'#65756b'},
 linkButton:{alignSelf:'flex-start',backgroundColor:'#e9f1ec',color:'#173f2d',fontWeight:'900',paddingHorizontal:12,paddingVertical:9,borderRadius:999},
 statusCard:{backgroundColor:'#fff',borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:10,borderWidth:1,borderColor:'#dbe5de'},
 eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#5f7568'},
 statusTitle:{fontSize:19,lineHeight:24,fontWeight:'900',color:'#102218',marginTop:2},
 stateBadge:{backgroundColor:'#e7eee9',paddingHorizontal:9,paddingVertical:6,borderRadius:999},
 stateBadgeDone:{backgroundColor:'#d7ad5b'},
 stateBadgeText:{fontSize:9,fontWeight:'900',color:'#365646'},
 stateBadgeTextDone:{color:'#123a2a'},
 progressTrack:{height:9,borderRadius:999,backgroundColor:'#dfe7e2',overflow:'hidden'},
 progressFill:{height:'100%',backgroundColor:'#1b5a3d',borderRadius:999},
 startCard:{backgroundColor:'#fff7df',borderRadius:20,padding:16,gap:9,borderWidth:1,borderColor:'#ecd89c'},
 startEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:'#755e28'},
 startTitle:{fontSize:20,lineHeight:25,fontWeight:'900',color:'#173528'},
 currentCard:{backgroundColor:'#fff',borderRadius:22,padding:16,gap:13,borderWidth:2,borderColor:'#7fa58e'},
 currentTop:{flexDirection:'row',alignItems:'flex-start',gap:11},
 stepNumber:{width:42,height:42,borderRadius:14,backgroundColor:'#173f2d',alignItems:'center',justifyContent:'center'},
 stepNumberText:{fontSize:18,fontWeight:'900',color:'#fff'},
 currentLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:'#5f7568'},
 currentTitle:{fontSize:22,lineHeight:27,fontWeight:'900',color:'#102218',marginTop:2},
 explainer:{backgroundColor:'#f5f8f6',padding:12,borderRadius:14,gap:4},
 explainerLabel:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#597066'},
 explainerText:{fontSize:13,lineHeight:20,color:'#40594d'},
 proofPanel:{gap:7},
 proofGrid:{flexDirection:'row',flexWrap:'wrap',gap:7},
 proofChip:{minWidth:100,flexGrow:1,backgroundColor:'#edf4ef',padding:10,borderRadius:13},
 proofValue:{fontSize:18,fontWeight:'900',color:'#173f2d'},
 proofLabel:{fontSize:9,lineHeight:13,fontWeight:'800',color:'#66786e',marginTop:2},
 currentActions:{gap:8,alignItems:'stretch'},
 primary:{backgroundColor:'#173f2d',paddingHorizontal:14,paddingVertical:12,borderRadius:14,alignItems:'center'},
 primaryText:{fontWeight:'900',color:'#fff'},
 secondary:{backgroundColor:'#edf3ef',color:'#173f2d',fontWeight:'900',paddingHorizontal:12,paddingVertical:10,borderRadius:14,textAlign:'center'},
 disabled:{opacity:.5},
 completeCard:{backgroundColor:'#173f2d',borderRadius:22,padding:17,gap:8},
 completeEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#c5dfd1'},
 completeTitle:{fontSize:21,lineHeight:27,fontWeight:'900',color:'#fff'},
 restart:{alignSelf:'flex-start',borderWidth:1,borderColor:'#789786',paddingHorizontal:12,paddingVertical:10,borderRadius:14},
 restartText:{fontWeight:'900',color:'#fff'},
 timelineHeader:{gap:3,marginTop:5},
 sectionTitle:{fontSize:21,fontWeight:'900',color:'#102218'},
 timeline:{gap:8},
 timelineStep:{backgroundColor:'#fff',borderRadius:17,padding:13,flexDirection:'row',gap:10,borderWidth:1,borderColor:'#dde5df'},
 timelineDone:{backgroundColor:'#eef6f0',borderColor:'#c5dccd'},
 timelineActive:{borderWidth:2,borderColor:'#739a82'},
 timelineDot:{width:30,height:30,borderRadius:15,backgroundColor:'#e9efeb',alignItems:'center',justifyContent:'center'},
 timelineDotDone:{backgroundColor:'#173f2d'},
 timelineDotActive:{backgroundColor:'#d7ad5b'},
 timelineDotText:{fontSize:11,fontWeight:'900',color:'#607268'},
 timelineDotTextOn:{color:'#fff'},
 timelinePhase:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#6a7c72'},
 timelineTitle:{fontSize:15,lineHeight:20,fontWeight:'900',color:'#173528'},
 eventText:{fontSize:10,fontWeight:'900',color:'#32704c'},
});
