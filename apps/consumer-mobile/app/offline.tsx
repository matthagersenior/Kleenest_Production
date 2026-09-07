import { useEffect,useState } from 'react';
import { Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View } from 'react-native';
import { TrustStrip,palette } from '../components/ConsumerUI';
import { listOfflinePacks,listSavedRoutePlans,prepareRouteOfflinePack,readLocalOfflinePacks } from '../services/offline';

type Row=Record<string,any>;

export default function OfflineScreen(){
  const[routes,setRoutes]=useState<Row[]>([]);
  const[packs,setPacks]=useState<Row[]>([]);
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('Loading saved trips…');

  async function load(){
    let local:Row[]=[];
    try{
      local=await readLocalOfflinePacks();
      if(local.length){
        setPacks(local);
        setMessage(`${local.length} route pack${local.length===1?'':'s'} saved on this device.`);
      }
      const[r,remote]=await Promise.all([listSavedRoutePlans(),listOfflinePacks()]);
      setRoutes(r);
      const localById=new Map(local.map(pack=>[String(pack.id),pack]));
      const remoteIds=new Set((remote||[]).map(pack=>String(pack.id)));
      const merged=(remote||[]).map(pack=>{
        const cached=localById.get(String(pack.id));
        return{...pack,locations:cached?.locations||[],savedAt:cached?.savedAt,route_id:cached?.route_id};
      });
      for(const cached of local)if(!remoteIds.has(String(cached.id)))merged.push(cached);
      setPacks(merged);
      setMessage(local.length?`${local.length} route pack${local.length===1?'':'s'} saved on this device.`:'');
    }catch(e:any){
      if(local.length){
        setPacks(local);
        setMessage(`Offline mode · ${local.length} route pack${local.length===1?'':'s'} saved on this device.`);
      }else{
        setMessage(e?.message||'Offline trips could not be loaded.');
      }
    }
  }

  useEffect(()=>{void load()},[]);

  async function prepare(route:Row){
    const id=String(route.id||'');
    if(!id)return;
    setBusy(id);
    setMessage('Preparing canonical offline corridor…');
    try{
      const result=await prepareRouteOfflinePack(id,route.name||'Offline route');
      await load();
      setMessage(`Offline route pack is ready with ${result.packedLocations} restroom${result.packedLocations===1?'':'s'} saved on this device for the next 24 hours.`);
    }catch(e:any){
      setMessage(e?.message||'Offline route could not be prepared.');
    }finally{
      setBusy('');
    }
  }

  return <SafeAreaView style={s.safe}>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}>
        <Text style={s.eyebrow}>OFFLINE TRIPS</Text>
        <Text style={s.heroTitle}>Take trusted restroom context with you.</Text>
        <Text style={s.heroBody}>Saved routes prepare a canonical Supabase corridor, then copy that exact restroom snapshot onto this device. When the network disappears, the local copy remains readable until the pack expires.</Text>
        <TrustStrip items={['Canonical route sessions','24-hour device snapshots','No second source of truth']}/>
      </View>

      {message?<Text style={s.message} accessibilityLiveRegion="polite">{message}</Text>:null}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Saved routes</Text>
        {routes.length?routes.map(route=><View key={String(route.id)} style={s.card}>
          <Text style={s.cardTitle}>{route.name||'Saved route'}</Text>
          <Text style={s.meta}>{route.distance_miles!=null?`${route.distance_miles} mi`:''}{route.estimated_minutes!=null?` · about ${route.estimated_minutes} min`:''}</Text>
          <Pressable disabled={!!busy} style={[s.primary,!!busy&&{opacity:.5}]} onPress={()=>prepare(route)} accessibilityRole="button">
            <Text style={s.primaryText}>{busy===String(route.id)?'Preparing…':'Prepare offline corridor'}</Text>
          </Pressable>
        </View>):<Text style={s.body}>Save a route from the Route Planner first.</Text>}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Prepared packs</Text>
        {packs.length?packs.map(pack=>{
          const locations:Array<Row>=Array.isArray(pack.locations)?pack.locations:[];
          return <View key={String(pack.id)} style={s.card}>
            <Text style={s.cardTitle}>{pack.name||'Offline route'}</Text>
            <Text style={pack.status==='ready'?s.good:s.meta}>{String(pack.status||'unknown').toUpperCase()}</Text>
            <Text style={s.meta}>Expires {pack.expires_at?new Date(pack.expires_at).toLocaleString():'on server schedule'}</Text>
            {locations.length?<>
              <Text style={s.localCount}>{locations.length} restroom{locations.length===1?'':'s'} saved on this device</Text>
              {locations.slice(0,8).map((snapshot:Row,index:number)=><View key={String(snapshot.location_id||snapshot.id||index)} style={s.snapshotRow}>
                <View style={s.snapshotCopy}>
                  <Text style={s.snapshotName}>{snapshot.name||'Restroom'}</Text>
                  <Text style={s.snapshotMeta}>{snapshot.address||[snapshot.city,snapshot.state].filter(Boolean).join(', ')||'Address unavailable'}</Text>
                </View>
                <Text style={snapshot.is_verified?s.verified:s.meta}>{snapshot.is_verified?'VERIFIED':'LOCAL'}</Text>
              </View>)}
              {locations.length>8?<Text style={s.meta}>+ {locations.length-8} more stored in this pack</Text>:null}
            </>:<Text style={s.body}>This server pack is not stored on this device yet. Prepare the saved route again while online to make it truly offline-ready.</Text>}
          </View>;
        }):<Text style={s.body}>No offline packs prepared yet.</Text>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:palette.canvas},
  content:{padding:20,paddingBottom:44,gap:14},
  hero:{backgroundColor:palette.green,padding:20,borderRadius:26,gap:8},
  eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.7,color:'#bad0c2'},
  heroTitle:{fontSize:29,lineHeight:33,fontWeight:'900',color:'#fff'},
  heroBody:{fontSize:14,lineHeight:21,color:'#dce9e1'},
  message:{fontSize:12,fontWeight:'700',color:'#64736a'},
  section:{gap:9},
  sectionTitle:{fontSize:23,fontWeight:'900',color:palette.ink},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dce6df',borderRadius:18,padding:15,gap:6},
  cardTitle:{fontSize:17,fontWeight:'900',color:palette.ink},
  meta:{fontSize:11,lineHeight:17,color:palette.muted},
  good:{fontSize:11,fontWeight:'900',color:palette.green},
  body:{fontSize:13,lineHeight:20,color:palette.muted},
  primary:{alignSelf:'flex-start',backgroundColor:palette.green,paddingHorizontal:13,paddingVertical:10,borderRadius:12,marginTop:3},
  primaryText:{color:'#fff',fontWeight:'900'},
  localCount:{fontSize:12,fontWeight:'900',color:palette.ink,marginTop:5},
  snapshotRow:{flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:'#edf2ee',paddingTop:8,marginTop:2},
  snapshotCopy:{flex:1,gap:2},
  snapshotName:{fontSize:13,fontWeight:'900',color:palette.ink},
  snapshotMeta:{fontSize:11,lineHeight:16,color:palette.muted},
  verified:{fontSize:9,fontWeight:'900',color:palette.green},
});
