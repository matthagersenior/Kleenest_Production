import { listLocationAmenityInventory, type LocationAmenityInventoryItem } from '../services/amenities';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function freshnessLabel(value:string|null){if(!value)return'Freshness unknown';const time=new Date(value).getTime();if(!Number.isFinite(time))return'Freshness unknown';const hours=Math.max(0,Math.floor((Date.now()-time)/3600000));if(hours<1)return'Updated within the hour';if(hours<24)return`Updated ${hours}h ago`;const days=Math.floor(hours/24);if(days===1)return'Updated yesterday';if(days<30)return`Updated ${days}d ago`;const months=Math.max(1,Math.floor(days/30));return`Updated ${months}mo ago`;}
export default function LocationAmenityInventory({ locationId, refreshToken = 0 }:{ locationId:string; refreshToken?:number }) {
  const [items,setItems]=useState<LocationAmenityInventoryItem[]>([]);
  const [message,setMessage]=useState('');

  useEffect(()=>{
    if(!locationId)return;
    let active=true;
    listLocationAmenityInventory(locationId)
      .then(rows=>{if(active){setItems(rows.filter(row=>row.observed_quantity!=null));setMessage('')}})
      .catch(error=>{if(active)setMessage(error?.message||'Amenity inventory could not be loaded.')});
    return()=>{active=false};
  },[locationId,refreshToken]);

  if(!items.length&&!message)return null;
  return <View style={s.card}><Text style={s.eyebrow}>COMMUNITY AMENITY INVENTORY</Text><Text style={s.title}>What contributors have observed</Text><Text style={s.body}>Counts are community estimates based on recent verified review evidence.</Text>{items.map(item=><View style={s.row} key={item.amenity_id}><View style={{flex:1}}><Text style={s.name}>{item.name}</Text><Text style={s.meta}>{item.category||'Amenity'} · {item.sample_count||0} recent {item.sample_count===1?'report':'reports'}</Text><Text style={s.fresh}>{freshnessLabel(item.freshest_observed_at)}</Text></View><View style={s.quantityWrap}><Text style={s.quantity}>{item.observed_quantity}</Text><Text style={s.quantityLabel}>observed</Text></View></View>)}{message?<Text style={s.message}>{message}</Text>:null}</View>;
}

const s=StyleSheet.create({card:{backgroundColor:'#fff',padding:18,borderRadius:20,borderWidth:1,borderColor:'#dde7e0',gap:9},eyebrow:{fontSize:12,fontWeight:'800',letterSpacing:2,color:'#4d6658'},title:{fontSize:18,fontWeight:'900',color:'#14231b'},body:{fontSize:13,lineHeight:19,color:'#65756b'},row:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#f7faf8',padding:12,borderRadius:14},name:{fontWeight:'900',color:'#14231b'},meta:{fontSize:12,color:'#6c7c72',fontWeight:'700',marginTop:2},fresh:{fontSize:11,color:'#7a8b81',fontWeight:'700',marginTop:3},quantityWrap:{alignItems:'center'},quantity:{fontSize:24,fontWeight:'900',color:'#173d2b'},quantityLabel:{fontSize:10,fontWeight:'800',color:'#718078'},message:{color:'#53645a',fontWeight:'700'}});
