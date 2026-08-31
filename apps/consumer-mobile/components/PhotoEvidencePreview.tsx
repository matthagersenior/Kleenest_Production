import { Image, StyleSheet, View } from 'react-native';

export default function PhotoEvidencePreview({photos,maxCount=3,size=96}:{photos:any[];maxCount?:number;size?:number}){
  const visible=(Array.isArray(photos)?photos:[]).filter(photo=>photo?.public_url).slice(0,Math.max(1,maxCount));
  if(!visible.length)return null;
  return <View style={s.row}>{visible.map(photo=><Image key={String(photo.storage_path||photo.public_url)} source={{uri:String(photo.public_url)}} accessibilityLabel="Restroom review evidence photo" style={[s.photo,{width:size,height:size}]}/>)}</View>;
}

const s=StyleSheet.create({row:{flexDirection:'row',gap:8,flexWrap:'wrap'},photo:{borderRadius:13,backgroundColor:'#e7eee9'}});
