import { useEffect,useState } from 'react';
import { Pressable,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';

type SupportRow={id:string;subject:string;message:string;status:string;admin_notes?:string|null;created_at:string};

export default function Support(){
  const[subject,setSubject]=useState(''),[body,setBody]=useState(''),[message,setMessage]=useState(''),[rows,setRows]=useState<SupportRow[]>([]);
  async function load(){
    const client=getKleenestSupabaseClient();
    const{data:{user}}=await client.auth.getUser();
    if(!user)return;
    const{data}=await client.from('support_requests').select('id,subject,message,status,admin_notes,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20);
    setRows((data||[]) as SupportRow[]);
  }
  useEffect(()=>{void load()},[]);
  async function send(){
    const{error}=await getKleenestSupabaseClient().rpc('submit_support_request',{p_subject:subject.trim(),p_message:body.trim(),p_category:'technical',p_source_app:'business'});
    setMessage(error?error.message:'Support request submitted to KleenestOS.');
    if(!error){setSubject('');setBody('');await load()}
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
    <Text style={s.title}>Business support</Text>
    <Text style={s.meta}>Requests go directly to the KleenestOS Email Center.</Text>
    <View style={s.card}><TextInput style={s.input} placeholder="Subject" value={subject} onChangeText={setSubject}/><TextInput style={[s.input,{minHeight:120}]} multiline placeholder="Describe the issue" value={body} onChangeText={setBody}/><Pressable style={s.button} onPress={send}><Text style={s.buttonText}>Submit request</Text></Pressable></View>
    {message?<Text style={s.meta}>{message}</Text>:null}
    <Text style={s.section}>Recent requests</Text>
    {rows.map(row=><View key={row.id} style={s.card}><Text style={s.rowTitle}>{row.subject}</Text><Text style={s.meta}>{String(row.status||'open').replaceAll('_',' ')} · {new Date(row.created_at).toLocaleString()}</Text><Text style={s.body}>{row.message}</Text>{row.admin_notes?<View style={s.reply}><Text style={s.replyTitle}>Kleenest Support</Text><Text style={s.body}>{row.admin_notes}</Text></View>:null}</View>)}
  </ScrollView>
}
const s=StyleSheet.create({page:{padding:20,gap:12,backgroundColor:'#f3f6f4'},title:{fontSize:28,fontWeight:'900',color:'#102218'},section:{fontSize:18,fontWeight:'900',color:'#102218',marginTop:8},card:{backgroundColor:'#fff',padding:16,borderRadius:18,gap:9,borderWidth:1,borderColor:'#d5e0d9'},input:{borderWidth:1,borderColor:'#cbd9d0',borderRadius:12,padding:12},button:{backgroundColor:'#173d2b',padding:12,borderRadius:12,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'900'},meta:{color:'#607067',fontSize:12},rowTitle:{fontWeight:'900',fontSize:16,color:'#102218'},body:{color:'#344b3f',lineHeight:20},reply:{backgroundColor:'#e8f3ec',padding:12,borderRadius:12,gap:4},replyTitle:{fontWeight:'900',color:'#173d2b'}});
