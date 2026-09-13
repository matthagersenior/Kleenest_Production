import { useEffect,useMemo,useState } from 'react';
import { Pressable,RefreshControl,ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { BusinessCard,BusinessHero,SectionHeader,businessColors } from '../components/BusinessOS';
import { currentBusinessId } from '../services/capabilityWorkflows';
import { createSmartRestroomQr,setSmartRestroomAmenity,smartDeviceCommand,smartDeviceManifest,smartDeviceSetAutomationRule,smartRestroomSnapshot,upsertSmartDevice,upsertSmartDeviceConnector,type SmartDeviceManifest } from '../services/smartDevices';

const protocols=['matter_bridge','mqtt_bridge','vendor_cloud','generic_gateway','manual'] as const;
const cleanList=(value:string)=>value.split(',').map(x=>x.trim()).filter(Boolean);

export default function SmartDevices(){
 const[businessId,setBusinessId]=useState(''),[data,setData]=useState<SmartDeviceManifest|null>(null),[smart,setSmart]=useState<any>(null),[deviceLocationId,setDeviceLocationId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const[connectorName,setConnectorName]=useState('Facility bridge'),[protocolIndex,setProtocolIndex]=useState(0),[partnerId,setPartnerId]=useState(''),[connectorControl,setConnectorControl]=useState(false);
 const[deviceControl,setDeviceControl]=useState(false);
 const[deviceName,setDeviceName]=useState(''),[externalId,setExternalId]=useState(''),[deviceType,setDeviceType]=useState('sensor'),[capabilities,setCapabilities]=useState('read:status');
 const[automationName,setAutomationName]=useState(''),[eventType,setEventType]=useState('device.alert'),[automationCommand,setAutomationCommand]=useState('');
 async function load(){setBusy(true);try{const id=businessId||await currentBusinessId();setBusinessId(id);const[manifest,snapshot]=await Promise.all([smartDeviceManifest(id),smartRestroomSnapshot(id)]);setData(manifest);setSmart(snapshot);if(!deviceLocationId&&snapshot?.locations?.[0]?.id)setDeviceLocationId(String(snapshot.locations[0].id));setMessage('')}catch(e:any){setMessage(e?.message||'Smart-device workspace unavailable.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 const firstConnector=data?.connectors?.[0],firstDevice=data?.devices?.[0];
 const health=data?.health||{total_devices:0,online_devices:0,offline_devices:0,open_commands:0,critical_events_24h:0};
 const commandsFor=(device:any)=>((device?.capabilities||[]) as string[]).filter(x=>x.startsWith('command:')).map(x=>x.slice(8)).filter(x=>x&&x!=='*');
 async function run(fn:()=>Promise<unknown>,ok:string){setBusy(true);try{await fn();setMessage(ok);await load()}catch(e:any){setMessage(e?.message||'Smart-device action failed.')}finally{setBusy(false)}}
 const statusTone=useMemo(()=>health.critical_events_24h?'ATTENTION':health.offline_devices?'DEGRADED':'READY',[health]);
 return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <BusinessHero eyebrow="CONNECTED OPERATIONS" title="Smart Devices" body="Register provider-neutral bridges, watch Device health, send explicitly declared commands, and automate safe responses without coupling Kleenest to one hardware vendor."/>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  <View style={s.metrics}><Metric label="Device health" value={statusTone}/><Metric label="Online" value={health.online_devices}/><Metric label="Open commands" value={health.open_commands}/><Metric label="Critical · 24h" value={health.critical_events_24h}/></View>

  <BusinessCard><SectionHeader title="Connected / Smart Restroom amenity" body="Community observations, Business confirmation and live device verification remain separate evidence signals. Owner/admin/manager can confirm the amenity or publish a QR that asks users to verify it."/>
   <View style={s.metrics}><Metric label="Smart locations" value={smart?.summary?.smart_locations||0}/><Metric label="Device verified" value={smart?.summary?.device_verified||0}/><Metric label="Smart QR" value={smart?.summary?.smart_qr_codes||0}/></View>
   {(smart?.locations||[]).map((row:any)=><View key={String(row.id)} style={s.rule}><View style={s.row}><View style={{flex:1}}><Text style={s.title}>{row.name}</Text><Text style={s.meta}>{row.business_confirmed?'Business confirmed':'Not business-confirmed'} · {row.device_count||0} device{Number(row.device_count||0)===1?'':'s'} · {row.community_present||0} community present</Text></View><Text style={s.badge}>{row.smart_bathroom?'SMART':'STANDARD'}</Text></View><View style={s.actions}><Pressable style={s.command} disabled={busy} onPress={()=>run(()=>setSmartRestroomAmenity(businessId,String(row.id),!row.business_confirmed),row.business_confirmed?'Business confirmation removed; device/community evidence remains independent.':'Smart Restroom confirmed by Business.')}><Text style={s.commandText}>{row.business_confirmed?'Remove Business confirmation':'Confirm Smart Restroom'}</Text></Pressable><Pressable style={s.command} disabled={busy} onPress={()=>run(()=>createSmartRestroomQr(businessId,String(row.id),'contribute'),'Smart Restroom confirmation QR created in QR Studio.')}><Text style={s.commandText}>Create verification QR</Text></Pressable></View></View>)}
  </BusinessCard>

  <BusinessCard><SectionHeader title="Attach new devices to a location" body="Location attachment automatically verifies the Smart Restroom amenity while the device remains enabled."/>
   <View style={s.actions}>{(smart?.locations||[]).map((row:any)=><Pressable key={String(row.id)} style={[s.choice,deviceLocationId===String(row.id)&&{borderColor:businessColors.green,borderWidth:2}]} onPress={()=>setDeviceLocationId(String(row.id))}><Text style={s.choiceText}>{row.name}</Text></Pressable>)}</View>
  </BusinessCard>

  <BusinessCard><SectionHeader title="Connect a bridge" body="Matter, MQTT and vendor clouds connect through a bridge/partner identity. Kleenest never needs a vendor password in the app."/>
   <TextInput value={connectorName} onChangeText={setConnectorName} placeholder="Connector name" style={s.input}/>
   <Pressable style={s.choice} onPress={()=>setProtocolIndex(v=>(v+1)%protocols.length)}><Text style={s.choiceText}>Protocol · {protocols[protocolIndex].replaceAll('_',' ')}</Text></Pressable>
   {protocols[protocolIndex]!=='manual'?<TextInput value={partnerId} onChangeText={setPartnerId} autoCapitalize="none" placeholder="Partner bridge ID (from Developer Platform)" style={s.input}/>:<Text style={s.meta}>Manual mode is a safe simulator for pilots; no hardware partner is required.</Text>}
   <Pressable style={s.choice} onPress={()=>setConnectorControl(v=>!v)}><Text style={s.choiceText}>Connector control · {connectorControl?'enabled':'off'}</Text></Pressable>
   <Pressable disabled={busy||!businessId||!connectorName.trim()||(protocols[protocolIndex]!=='manual'&&!partnerId.trim())} style={s.primary} onPress={()=>run(()=>upsertSmartDeviceConnector({businessId,name:connectorName.trim(),protocol:protocols[protocolIndex],locationId:deviceLocationId||null,platformPartnerId:protocols[protocolIndex]==='manual'?null:partnerId.trim(),controlEnabled:connectorControl,telemetryEnabled:true}), 'Connector registered with explicit control state.')}><Text style={s.primaryText}>Register connector</Text></Pressable>
  </BusinessCard>

  <View style={s.section}><SectionHeader title="Connector controls" body="Pairing and physical-control state are explicit and can be changed without recreating the connector."/>
   {(data?.connectors||[]).map((connector:any)=><BusinessCard key={String(connector.id)}><View style={s.row}><View style={{flex:1}}><Text style={s.title}>{connector.name}</Text><Text style={s.meta}>{String(connector.protocol).replaceAll('_',' ')} · {connector.platform_partner_id?'paired':'not paired'} · {connector.status}</Text></View><Text style={s.badge}>{connector.control_enabled?'CONTROL ON':'CONTROL OFF'}</Text></View><Pressable disabled={busy} style={s.command} onPress={()=>run(()=>upsertSmartDeviceConnector({businessId,connectorId:String(connector.id),name:String(connector.name),protocol:String(connector.protocol),locationId:connector.location_id?String(connector.location_id):null,platformPartnerId:connector.platform_partner_id?String(connector.platform_partner_id):null,controlEnabled:!connector.control_enabled,telemetryEnabled:Boolean(connector.telemetry_enabled),capabilities:Array.isArray(connector.capabilities)?connector.capabilities:[],metadata:connector.metadata||{}}),connector.control_enabled?'Connector control disabled.':'Connector control enabled.')}><Text style={s.commandText}>{connector.control_enabled?'Disable':'Enable'} connector control</Text></Pressable></BusinessCard>)}
  </View>

  <BusinessCard><SectionHeader title="Register a device" body={firstConnector?'Attach a device identity and declare only the capabilities this hardware actually supports.':'Register a connector first.'}/>
   <TextInput value={deviceName} onChangeText={setDeviceName} placeholder="Device name" style={s.input}/>
   <TextInput value={externalId} onChangeText={setExternalId} placeholder="Bridge / vendor device ID" style={s.input}/>
   <TextInput value={deviceType} onChangeText={setDeviceType} placeholder="Type: occupancy, dispenser, leak, air…" style={s.input}/>
   <TextInput value={capabilities} onChangeText={setCapabilities} placeholder="Capabilities, comma separated (e.g. read:level, command:dispense)" style={s.input}/>
   <Pressable style={s.choice} onPress={()=>setDeviceControl(v=>!v)}><Text style={s.choiceText}>Device control · {deviceControl?'enabled':'off'}</Text></Pressable>
   <Pressable disabled={busy||!firstConnector||!deviceName.trim()||!externalId.trim()} style={s.primary} onPress={()=>run(()=>upsertSmartDevice({businessId,connectorId:String(firstConnector.id),externalDeviceId:externalId.trim(),name:deviceName.trim(),deviceType:deviceType.trim()||'sensor',locationId:deviceLocationId||null,capabilities:cleanList(capabilities),controlEnabled:deviceControl,telemetryEnabled:true}), 'Device registered with least-privilege capabilities and explicit control state.')}><Text style={s.primaryText}>Register device</Text></Pressable>
  </BusinessCard>

  <View style={s.section}><SectionHeader title="Devices & actions" body="Only commands declared by the device can be queued. High-risk commands are held for KleenestOS approval."/>
   {(data?.devices||[]).map((device:any)=><BusinessCard key={String(device.id)}>
    <View style={s.row}><View style={{flex:1}}><Text style={s.title}>{device.name}</Text><Text style={s.meta}>{device.device_type} · {device.status} · {device.external_device_id}</Text></View><Text style={s.badge}>{device.control_enabled?'CONTROL ON':'READ ONLY'}</Text></View>
    <Text style={s.meta}>{((device.capabilities||[]) as string[]).join(' · ')||'No declared capabilities'}</Text>
    <Pressable disabled={busy} style={s.command} onPress={()=>run(()=>upsertSmartDevice({businessId,deviceId:String(device.id),connectorId:String(device.connector_id),externalDeviceId:String(device.external_device_id),name:String(device.name),locationId:device.location_id?String(device.location_id):null,deviceType:String(device.device_type||'sensor'),manufacturer:device.manufacturer??null,model:device.model??null,firmwareVersion:device.firmware_version??null,capabilities:Array.isArray(device.capabilities)?device.capabilities:[],tags:Array.isArray(device.tags)?device.tags:[],controlEnabled:!device.control_enabled,telemetryEnabled:Boolean(device.telemetry_enabled),metadata:device.metadata||{}}),device.control_enabled?'Device control disabled.':'Device control enabled.')}><Text style={s.commandText}>{device.control_enabled?'Disable':'Enable'} device control</Text></Pressable>
    <View style={s.actions}>{commandsFor(device).map(command=><View key={command} style={s.actions}><Pressable disabled={busy} style={s.command} onPress={()=>run(()=>smartDeviceCommand({businessId,deviceId:String(device.id),command}),`Command queued: ${command}`)}><Text style={s.commandText}>Send command · {command}</Text></Pressable>{device.location_id?<Pressable disabled={busy} style={s.command} onPress={()=>run(()=>createSmartRestroomQr(businessId,String(device.location_id),'command',String(device.id),command),`Command QR created: ${command}`)}><Text style={s.commandText}>Create QR · {command}</Text></Pressable>:null}</View>)}</View>
   </BusinessCard>)}
   {!data?.devices?.length?<BusinessCard><Text style={s.meta}>No Smart Devices registered yet. The control plane is ready when hardware is.</Text></BusinessCard>:null}
  </View>

  <BusinessCard><SectionHeader title="Automation" body="Create a cooldown-protected event rule. High-risk commands cannot be automated."/>
   <TextInput value={automationName} onChangeText={setAutomationName} placeholder="Automation name" style={s.input}/>
   <TextInput value={eventType} onChangeText={setEventType} placeholder="Trigger event type" style={s.input}/>
   <TextInput value={automationCommand} onChangeText={setAutomationCommand} placeholder="Command to send" style={s.input}/>
   <Pressable disabled={busy||!firstDevice||!automationName.trim()||!eventType.trim()||!automationCommand.trim()} style={s.primary} onPress={()=>run(()=>smartDeviceSetAutomationRule({businessId,name:automationName.trim(),triggerType:'event_type',triggerConfig:{event_type:eventType.trim()},deviceId:String(firstDevice.id),command:automationCommand.trim(),cooldownSeconds:300}), 'Automation saved.')}><Text style={s.primaryText}>Save automation</Text></Pressable>
   {(data?.automations||[]).map((rule:any)=><View key={String(rule.id)} style={s.rule}><Text style={s.title}>{rule.name}</Text><Text style={s.meta}>{rule.trigger_type} → {rule.command} · {rule.enabled?'ON':'OFF'}</Text></View>)}
  </BusinessCard>

  <BusinessCard><SectionHeader title="Recent signals" body="Raw telemetry is short-lived by design; operational state and command history remain auditable."/>
   {(data?.recent_events||[]).slice(0,20).map((e:any)=><Text key={String(e.id)} style={s.meta}>{e.severity?.toUpperCase()} · {e.event_type}{e.metric?` · ${e.metric}=${e.value_numeric??e.value_text??'—'}`:''}</Text>)}
  </BusinessCard>
 </ScrollView>
}
function Metric({label,value}:{label:string;value:string|number}){return <View style={s.metric}><Text style={s.metricValue}>{String(value)}</Text><Text style={s.meta}>{label}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:14,backgroundColor:businessColors.paper,paddingBottom:70},section:{gap:9},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},metric:{backgroundColor:'#fff',borderWidth:1,borderColor:businessColors.border,borderRadius:15,padding:12,minWidth:130,flexGrow:1},metricValue:{fontSize:18,fontWeight:'900',color:businessColors.green},message:{backgroundColor:'#fff7db',padding:11,borderRadius:12,color:'#6c5614'},input:{borderWidth:1,borderColor:businessColors.border,borderRadius:12,padding:11,color:businessColors.ink,backgroundColor:'#fff'},choice:{borderWidth:1,borderColor:businessColors.border,borderRadius:12,padding:11,backgroundColor:'#f6faf7'},choiceText:{fontWeight:'800',color:businessColors.green,textTransform:'capitalize'},primary:{backgroundColor:businessColors.green,padding:12,borderRadius:12,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900'},row:{flexDirection:'row',alignItems:'center',gap:8},title:{fontWeight:'900',fontSize:15,color:businessColors.ink},meta:{fontSize:12,lineHeight:18,color:businessColors.muted},badge:{fontSize:9,fontWeight:'900',color:businessColors.green,backgroundColor:'#e6f3eb',paddingHorizontal:8,paddingVertical:5,borderRadius:999},actions:{gap:7,marginTop:6},command:{borderWidth:1,borderColor:businessColors.green,borderRadius:10,padding:10},commandText:{fontWeight:'900',color:businessColors.green},rule:{paddingVertical:8,borderTopWidth:1,borderColor:businessColors.border}});
