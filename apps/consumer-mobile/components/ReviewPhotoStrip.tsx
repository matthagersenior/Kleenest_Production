import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { evidenceCountLabel, formatVisitEvidence } from '../services/evidenceFormatting';
import { getReviewEvidence, type ReviewEvidence } from '../services/reviewEvidence';
import { listReviewPhotos, type ReviewPhoto } from '../services/reviewPhotos';

export default function ReviewPhotoStrip({ reviewId, refreshToken=0, initialEvidence=null, initialPhotos=null }:{ reviewId:string; refreshToken?:number; initialEvidence?:ReviewEvidence|null; initialPhotos?:ReviewPhoto[]|null }) {
  const [photos,setPhotos]=useState<ReviewPhoto[]>(initialPhotos||[]);
  const [evidence,setEvidence]=useState<ReviewEvidence|null>(initialEvidence);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;setFailed(false);const evidenceRequest=initialEvidence?Promise.resolve(initialEvidence):getReviewEvidence(reviewId);const photoRequest=initialPhotos?Promise.resolve(initialPhotos):listReviewPhotos(reviewId);Promise.all([photoRequest,evidenceRequest]).then(([rows,nextEvidence])=>{if(active){setPhotos(rows);setEvidence(nextEvidence)}}).catch(()=>{if(active)setFailed(true)});return()=>{active=false}},[reviewId,refreshToken,initialEvidence,initialPhotos]);
  if(failed)return <Text style={s.note}>Review evidence could not be loaded.</Text>;
  const verified=Boolean(evidence?.verified_checked_in_at);
  if(!photos.length&&!verified&&!evidence?.amenity_evidence_count)return null;
  const provenance=formatVisitEvidence({
    verifiedAt:evidence?.verified_checked_in_at||null,
    verificationMethod:evidence?.verified_check_in_method||null,
    verifiedDistanceMeters:evidence?.verified_distance_meters??null,
  },{includeCounts:false});
  const photoCount=Number(evidence?.photo_evidence_count??photos.length),amenityCount=Number(evidence?.amenity_evidence_count??0);
  const evidenceParts=[evidenceCountLabel(photoCount,'photo','photos'),`${evidenceCountLabel(amenityCount,'amenity','amenities')} observed`];
  return <View style={s.wrap}>{verified?<View style={s.provenance}><Text style={s.verified}>✓ VERIFIED VISIT</Text>{provenance?<Text style={s.provenanceText}>{provenance}</Text>:null}<Text style={s.evidenceText}>{evidenceParts.join(' · ')}</Text></View>:null}{photos.length?<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{photos.map(photo=><Image key={photo.storage_path} source={{uri:photo.public_url}} style={s.photo}/>)}</ScrollView>:null}</View>;
}
const s=StyleSheet.create({wrap:{marginTop:8,gap:8},provenance:{backgroundColor:'#f1f7f3',borderWidth:1,borderColor:'#d7e6dc',borderRadius:12,padding:10,gap:3},verified:{fontSize:11,fontWeight:'900',letterSpacing:1,color:'#173d2b'},provenanceText:{fontSize:12,fontWeight:'700',color:'#40584a'},evidenceText:{fontSize:12,color:'#607268'},row:{gap:8},photo:{width:112,height:112,borderRadius:14,backgroundColor:'#e7eee9'},note:{fontSize:12,color:'#718078',fontWeight:'700'}});
