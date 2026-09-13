import { useState } from 'react';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { reportReviewPhoto,voteReviewPhoto,type ReviewPhotoReportReason,type ReviewPhotoVote } from '../services/photoModeration';

const reportReasons:{id:ReviewPhotoReportReason;label:string}[]=[
  {id:'privacy',label:'Privacy'},
  {id:'explicit',label:'Explicit'},
  {id:'relevance',label:'Not relevant'},
  {id:'other',label:'Other'},
];

export default function PhotoTrustActions({
  photoId,
  helpfulVotes=0,
  notHelpfulVotes=0,
  businessId=null,
  onChanged,
}:{photoId:string;helpfulVotes?:number;notHelpfulVotes?:number;businessId?:string|null;onChanged?:()=>void}){
  const[helpful,setHelpful]=useState(Number(helpfulVotes||0));
  const[notHelpful,setNotHelpful]=useState(Number(notHelpfulVotes||0));
  const[reporting,setReporting]=useState(false);
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');

  async function vote(value:ReviewPhotoVote){
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      const result=await voteReviewPhoto(photoId,value,businessId);
      setHelpful(Number(result.helpful_votes??helpful));
      setNotHelpful(Number(result.not_helpful_votes??notHelpful));
      setMessage(value==='helpful'?'Helpful vote saved.':'Not-helpful vote saved.');
      onChanged?.();
    }catch(error:any){setMessage(error?.message||'Photo vote could not be saved.')}
    finally{setBusy(false)}
  }

  async function report(reason:ReviewPhotoReportReason){
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      await reportReviewPhoto(photoId,reason,null,businessId);
      setReporting(false);
      setMessage('Flag sent to KleenestOS for immediate owner review.');
      onChanged?.();
    }catch(error:any){setMessage(error?.message||'Photo flag could not be submitted.')}
    finally{setBusy(false)}
  }

  return <View style={s.wrap}>
    <View style={s.row}>
      <Pressable accessibilityRole="button" disabled={busy} style={s.vote} onPress={()=>void vote('helpful')}><Text style={s.voteText}>Helpful · {helpful}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={s.vote} onPress={()=>void vote('not_helpful')}><Text style={s.voteText}>Not helpful · {notHelpful}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={s.flag} onPress={()=>setReporting(value=>!value)}><Text style={s.flagText}>Flag</Text></Pressable>
    </View>
    {reporting?<View style={s.reasons}>{reportReasons.map(reason=><Pressable accessibilityRole="button" disabled={busy} key={reason.id} style={s.reason} onPress={()=>void report(reason.id)}><Text style={s.reasonText}>{reason.label}</Text></Pressable>)}</View>:null}
    {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  </View>;
}

const s=StyleSheet.create({
  wrap:{gap:6},
  row:{flexDirection:'row',flexWrap:'wrap',gap:6},
  vote:{backgroundColor:'#edf3ef',paddingHorizontal:9,paddingVertical:7,borderRadius:999},
  voteText:{fontSize:9,fontWeight:'900',color:'#244d39'},
  flag:{backgroundColor:'#f7e9e6',paddingHorizontal:9,paddingVertical:7,borderRadius:999},
  flagText:{fontSize:9,fontWeight:'900',color:'#7a3128'},
  reasons:{flexDirection:'row',flexWrap:'wrap',gap:6,paddingTop:2},
  reason:{backgroundColor:'#fff3ef',borderWidth:1,borderColor:'#e9c6bc',paddingHorizontal:9,paddingVertical:7,borderRadius:999},
  reasonText:{fontSize:9,fontWeight:'900',color:'#7a3128'},
  message:{fontSize:9,lineHeight:14,fontWeight:'700',color:'#5a6d61'},
});
