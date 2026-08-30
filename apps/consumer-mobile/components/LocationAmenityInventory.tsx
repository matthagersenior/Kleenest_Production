import { listLocationAmenityInventory, type LocationAmenityInventoryItem } from '../services/amenities';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  return <View style={s.card}><Text style={s.eyebrow}>COMMUNITY AMENITY INVENTORY</Text><Text style={s.title}>What contributors have observed</Text>{items.map(item=><View style={s.row} key={item.amenity_id}><View style={{flex:1}}><Text style={s.name}>{item.name}</Text><Text style={s.meta}>{item.category||'Amenity'} · {item.sample_count||0} recent {item.sample_count===1?'report':'reports'}</Text></View><Text style={s.quantity}>{item.observed_quantity}</Text></View>)}{message?<Text style={s.message}>{message}</Text>:null}</View>;
}

const s=StyleSheet.create({card:{backgroundColor:'#fff',padding:18,borderRadius:20,borderWidth:1,borderColor:'#dde7e0',gap:9},eyebrow:{fontSize:12,fontWeight:'800',letterSpacing:2,color:'#4d6658'},title:{fontSize:18,fontWeight:'900',color:'#14231b'},row:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#f7faf8',padding:12,borderRadius:14},name:{fontWeight:'900',color:'#14231b'},meta:{fontSize:12,color:'#6c7c72',fontWeight:'700',marginTop:2},quantity:{fontSize:24,fontWeight:'900',color:'#173d2b'},message:{color:'#53645a',fontWeight:'700'}});
