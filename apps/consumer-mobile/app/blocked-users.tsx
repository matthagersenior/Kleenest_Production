import { useCallback,useEffect,useState } from 'react';
import { ActivityIndicator,Image,Pressable,RefreshControl,ScrollView,Text,View } from 'react-native';
import { listBlockedUsers,unblockUser } from '../services/safety';

export default function BlockedUsers(){
  const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{setRows(await listBlockedUsers())},[]);
  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setLoading(false))},[load]);
  async function refresh(){setRefreshing(true);setError(null);try{await load()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setRefreshing(false)}}
  async function unblock(id:string){setBusy(id);setError(null);try{await unblockUser(id);await load()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(null)}}
  if(loading)return <View style={{flex:1,justifyContent:'center'}}><ActivityIndicator size="large"/></View>;
  return <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh}/>} contentContainerStyle={{padding:16,paddingBottom:80,gap:12,backgroundColor:'#f3f6f4'}}>
    <View style={hero}><Text style={eyebrow}>SAFETY</Text><Text style={title}>Blocked contributors</Text><Text style={heroBody}>Blocking removes follow relationships and prevents direct interaction. You can reverse it here.</Text></View>
    {error?<View style={errorCard}><Text style={errorText}>{error}</Text></View>:null}
    {!rows.length?<View style={card}><Text style={heading}>No blocked contributors</Text><Text style={muted}>People you block from contributor profiles will appear here.</Text></View>:rows.map(row=>{const id=String(row.user_id);return <View key={id} style={card}><View style={{flexDirection:'row',gap:12,alignItems:'center'}}>{row.avatar_url?<Image source={{uri:String(row.avatar_url)}} style={avatar}/>:<View style={avatar}/>}<View style={{flex:1}}><Text style={heading}>{row.display_name||row.username||'Contributor'}</Text><Text style={muted}>{row.username?`@${row.username}`:'Kleenest contributor'}</Text></View><Pressable disabled={busy===id} onPress={()=>unblock(id)} style={button}><Text style={buttonText}>{busy===id?'Working…':'Unblock'}</Text></Pressable></View></View>})}
  </ScrollView>
}
const hero={backgroundColor:'#173f2d' as const,borderRadius:22,padding:18,gap:7},eyebrow={color:'#bfe0cd' as const,fontWeight:'900' as const,letterSpacing:1.1},title={fontSize:26,fontWeight:'900' as const,color:'white' as const},heroBody={color:'#e1eee6' as const,lineHeight:20},card={backgroundColor:'white' as const,borderRadius:18,padding:15,gap:8},heading={fontSize:17,fontWeight:'900' as const,color:'#173024' as const},muted={color:'#66766e' as const},avatar={width:46,height:46,borderRadius:23,backgroundColor:'#dce6e0' as const},button={backgroundColor:'#edf3ef' as const,borderRadius:999,paddingHorizontal:13,paddingVertical:9},buttonText={fontWeight:'900' as const,color:'#244d39' as const},errorCard={backgroundColor:'#fae7e7' as const,borderRadius:14,padding:12},errorText={color:'#8f2f2f' as const,fontWeight:'800' as const};