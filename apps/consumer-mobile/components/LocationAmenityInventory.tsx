import { listLocationAmenityInventory, type LocationAmenityInventoryItem } from '../services/amenities';
import { visitFreshness } from '../services/evidenceFormatting';
import { getLocationTrustSummary, type LocationTrustSummary } from '../services/locationTrust';
import { trustConfidenceLabel, trustEvidenceLine } from '../services/routeTrust';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function freshnessLabel(value:string|null){if(!value)return'Freshness unknown';const time=new Date(value).getTime();if(!Number.isFinite(time))return'Freshness unknown';const hours=Math.max(0,Math.floor((Date.now()-time)/3600000));if(hours<1)return'Updated within the hour';if(hours<24)return`Updated ${hours}h ago`;const days=Math.floor(hours/24);if(days===1)return'Updated yesterday';if(days<30)return`Updated ${days}d ago`;const months=Math.max(1,Math.floor(days/30));return`Updated ${months}mo ago`;}
export default function LocationAmenityInventory({ locationId, refreshToken = 0 }:{ locationId:string; refreshToken?:number }) {
  const [items,setItems]=useState<LocationAmenityInventoryItem[]>([]);
  const [trust,setTrust]=useState<LocationTrustSummary|null>(null);
  const [message,setMessage]=useState('');

  useEffect(()=>{
    if(!locationId)return;
    let active=true;
    Promise.all([listLocationAmenityInventory(locationId),getLocationTrustSummary(locationId)])
      .then(([rows,summary])=>{if(active){setItems(rows.filter(row=>row.observed_quantity!=null));setTrust(summary);setMessage('')}})
      .catch(error=>{if(active)setMessage(error?.message||'Location evidence could not be loaded.')});
    return()=>{active=false};
  },[locationId,refreshToken]);

  if(!items.length&&!trust&&!message)return null;
  const verified=trust?.verified_visit_count||0,photos=trust?.photo_evidence_count||0,amenityEvidence=trust?.amenity_evidence_count||0,fresh=visitFreshness(trust?.latest_verified_at);
  return <View style={s.card}><Text style={s.eyebrow}>COMMUNITY TRUST SNAPSHOT</Text><View style={s.titleRow}><Text style={s.title}>Evidence behind this restroom</Text>{trust?<Text style={s.confidence}>{trustConfidenceLabel(trust)}</Text>:null}</View>{trust?<><Text style={s.evidenceLine}>{trustEvidenceLine(trust)}</Text><View style={s.trustRow}><View style={s.trustStat}><Text style={s.trustValue}>{verified}</Text><Text style={s.trustLabel}>verified visit{verified===1?'':'s'}</Text></View><View style={s.trustStat}><Text style={s.trustValue}>{photos}</Text><Text style={s.trustLabel}>photo{photos===1?'':'s'}</Text></View><View style={s.trustStat}><Text style={s.trustValue}>{amenityEvidence}</Text><Text style={s.trustLabel}>amenit{amenityEvidence===1?'y':'ies'}</Text></View></View><Text style={s.fresh}>{fresh?`Latest verified evidence ${fresh}`:'No published verified visit evidence yet.'}</Text></>:null}{items.length?<><Text style={s.eyebrow}>COMMUNITY AMENITY INVENTORY</Text><Text style={s.title}>What contributors have observed</Text><Text style={s.body}>Counts are community estimates based on recent verified review evidence.</Text>{items.map(item=><View style={s.row} key={item.amenity_id}><View style={{flex:1}}><Text style={s.name}>{item.name}</Text><Text style={s.meta}>{item.category||'Amenity'} · {item.sample_count||0} recent {item.sample_count===1?'report':'reports'}</Text><Text style={s.fresh}>{freshnessLabel(item.freshest_observed_at)}</Text></View><View style={s.quantityWrap}><Text style={s.quantity}>{item.observed_quantity}</Text><Text style={s.quantityLabel}>observed</Text></View></View>)}</>:null}{message?<Text style={s.message}>{message}</Text>:null}</View>;
}

const s=StyleSheet.create({card:{backgroundColor:'#fff',padding:18,borderRadius:20,borderWidth:1,borderColor:'#dde7e0',gap:9},eyebrow:{fontSize:12,fontWeight:'800',letterSpacing:2,color:'#4d6658',marginTop:4},titleRow:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:10},title:{fontSize:18,fontWeight:'900',color:'#14231b',flex:1},confidence:{fontSize:10,fontWeight:'900',color:'#173d2b',backgroundColor:'#dceee2',paddingHorizontal:9,paddingVertical:6,borderRadius:999,overflow:'hidden'},evidenceLine:{fontSize:12,fontWeight:'800',color:'#40584a'},body:{fontSize:13,lineHeight:19,color:'#65756b'},trustRow:{flexDirection:'row',gap:8},trustStat:{flex:1,backgroundColor:'#edf3ef',padding:11,borderRadius:13},trustValue:{fontSize:22,fontWeight:'900',color:'#173d2b'},trustLabel:{fontSize:10,fontWeight:'800',color:'#607168'},row:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#f7faf8',padding:12,borderRadius:14},name:{fontWeight:'900',color:'#14231b'},meta:{fontSize:12,color:'#6c7c72',fontWeight:'700',marginTop:2},fresh:{fontSize:11,color:'#7a8b81',fontWeight:'700',marginTop:3},quantityWrap:{alignItems:'center'},quantity:{fontSize:24,fontWeight:'900',color:'#173d2b'},quantityLabel:{fontSize:10,fontWeight:'800',color:'#718078'},message:{color:'#53645a',fontWeight:'700'}});
