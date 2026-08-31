import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listReviewPhotos, type ReviewPhoto } from '../services/reviewPhotos';

export default function ReviewPhotoStrip({ reviewId, refreshToken=0 }:{ reviewId:string; refreshToken?:number }) {
  const [photos,setPhotos]=useState<ReviewPhoto[]>([]);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;setFailed(false);listReviewPhotos(reviewId).then(rows=>{if(active)setPhotos(rows)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[reviewId,refreshToken]);
  if(failed)return <Text style={s.note}>Review photos could not be loaded.</Text>;
  if(!photos.length)return null;
  return <View style={s.wrap}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{photos.map(photo=><Image key={photo.storage_path} source={{uri:photo.public_url}} style={s.photo}/>)}</ScrollView></View>;
}
const s=StyleSheet.create({wrap:{marginTop:4},row:{gap:8},photo:{width:112,height:112,borderRadius:14,backgroundColor:'#e7eee9'},note:{fontSize:12,color:'#718078',fontWeight:'700'}});
