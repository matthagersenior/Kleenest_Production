import { usePlatformTheme } from '../services/theme';
import { useEffect,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,Text,View } from 'react-native';
import { HealthCard,OSHero,SectionHeader,osCard,osColors } from '../components/KleenestOS';
import { getOwnerSmartDeviceSnapshot,ownerApproveSmartDeviceCommand } from '../services/smartDevices';

export default function OwnerSmartDevices(){
  const theme=usePlatformTheme();
 const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){setBusy(true);try{setData(await getOwnerSmartDeviceSnapshot());setMessage('')}catch(e:any){setMessage(e?.message||'Smart-device owner control unavailable.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 async function decide(id:string,approve:boolean){setBusy(true);try{await ownerApproveSmartDeviceCommand(id,approve,approve?'Approved in KleenestOS':'Rejected in KleenestOS');setMessage(approve?'High-risk command approved and queued.':'Command rejected.');await load()}catch(e:any){setMessage(e?.message||'Command decision failed.')}finally{setBusy(false)}}
 const h=data?.health||{};
 const pending=(data?.commands||[]).filter((c:any)=>c.status==='pending_approval');
 const locatedDevices=(data?.devices||[]).filter((d:any)=>d.location_id);
 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={{padding:16,gap:14,paddingBottom:70,backgroundColor:osColors.paper}}>
  <OSHero eyebrow="CONNECTED OPERATIONS" title="IoT & Smart Devices" body="Owner authority for connector health, device fleet state, high-risk command approval, event visibility and Command audit across Kleenest."/>
  {message?<View style={{...osCard,backgroundColor:'#fff9e8'}}><Text style={{color:osColors.warning,fontWeight:'800'}}>{message}</Text></View>:null}
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
   <HealthCard label="Connector health" value={String(Number(h.online_connectors||0))+'/'+String(Number(h.connectors||0))} tone={h.connectors&&h.online_connectors<h.connectors?'warning':'good'} detail="Online / total"/>
   <HealthCard label="Smart devices" value={Number(h.devices||0)} tone={h.devices?'good':'warning'} detail={String(Number(h.online_devices||0))+' online'}/>
   <HealthCard label="Pending approvals" value={Number(h.pending_approvals||0)} tone={h.pending_approvals?'warning':'good'} detail="High-risk commands"/>
   <HealthCard label="Failed commands" value={Number(h.failed_commands_24h||0)} tone={h.failed_commands_24h?'danger':'good'} detail="Last 24 hours"/>
   <HealthCard label="Critical signals" value={Number(h.critical_events_24h||0)} tone={h.critical_events_24h?'danger':'good'} detail="Last 24 hours"/><HealthCard label="Smart amenity links" value={locatedDevices.length} tone={locatedDevices.length?'good':'warning'} detail="Location-attached devices"/>
  </View>

  <View style={{gap:8}}><SectionHeader title="Smart Restroom convergence" body="Location-attached devices verify the Connected / Smart Restroom amenity automatically. Business confirmation and community evidence remain separate, and place.amenities_changed is emitted when published presence changes."/><View style={osCard}><Text style={{fontWeight:'900',color:osColors.ink}}>Amenity authority is converged</Text><Text style={{color:osColors.muted}}>Community → discovery/review evidence · Business owner/admin/manager → confirmation & QR · Device bridge → operational verification · KleenestOS → high-risk command approval.</Text></View></View>

  <View style={{gap:8}}><SectionHeader title="High-risk approvals" body="High-risk physical actions never auto-run. Business requests wait here for explicit platform-owner approval."/>
   {pending.length?pending.map((cmd:any)=><View key={String(cmd.id)} style={osCard}><Text style={{fontSize:16,fontWeight:'900',color:osColors.ink}}>{String(cmd.command).replaceAll('_',' ')}</Text><Text style={{color:osColors.muted}}>Device {String(cmd.device_id)} · {cmd.risk_class} · {new Date(cmd.requested_at).toLocaleString()}</Text><View style={{flexDirection:'row',gap:8,marginTop:8}}><Pressable disabled={busy} onPress={()=>void decide(String(cmd.id),true)} style={{backgroundColor:osColors.green,borderRadius:10,padding:10}}><Text style={{color:'#fff',fontWeight:'900'}}>Approve</Text></Pressable><Pressable disabled={busy} onPress={()=>void decide(String(cmd.id),false)} style={{borderWidth:1,borderColor:osColors.danger,borderRadius:10,padding:10}}><Text style={{color:osColors.danger,fontWeight:'900'}}>Reject</Text></Pressable></View></View>):<View style={osCard}><Text style={{color:osColors.muted}}>No high-risk device commands waiting.</Text></View>}
  </View>

  <View style={{gap:8}}><SectionHeader title="Connector health" body="Provider-neutral bridge health for Matter, MQTT, vendor clouds and future gateways."/>
   {(data?.connectors||[]).map((c:any)=><View key={String(c.id)} style={osCard}><Text style={{fontWeight:'900',color:osColors.ink}}>{c.name}</Text><Text style={{color:osColors.muted}}>{String(c.protocol).replaceAll('_',' ')} · {c.status} · control {c.control_enabled?'enabled':'off'}</Text>{c.last_error?<Text style={{color:osColors.danger}}>{c.last_error}</Text>:null}</View>)}
  </View>

  <View style={{gap:8}}><SectionHeader title="Command audit" body="Recent physical-device requests and outcomes remain auditable even after short-lived raw telemetry expires."/>
   {(data?.commands||[]).slice(0,60).map((cmd:any)=><View key={String(cmd.id)} style={osCard}><Text style={{fontWeight:'900',color:osColors.ink}}>{cmd.command} · {String(cmd.status).toUpperCase()}</Text><Text style={{color:osColors.muted}}>Risk {cmd.risk_class} · device {cmd.device_id} · attempts {cmd.attempt_count||0}</Text>{cmd.error?<Text style={{color:osColors.danger}}>{cmd.error}</Text>:null}</View>)}
  </View>
 </ScrollView>
}
