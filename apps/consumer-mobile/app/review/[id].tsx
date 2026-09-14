import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { createMobileReview, getKleenestSupabaseClient, getMobileLocation } from '@kleenest/mobile-core';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette } from '../../components/ConsumerUI';
import { PlaceIcon } from '../../components/RestroomSignals';
import { clearContributionDraft, readContributionDraft, writeContributionDraft, type ContributionAmenityDraft } from '../../services/contributionDraft';
import { captureConsumerCoreLoopEvent } from '../../services/consumerTelemetry';
import { getConsumerLocationPresence, type ConsumerPresence } from '../../services/presence';
import { findLatestEligibleReviewCheckIn, type EligibleReviewCheckIn } from '../../services/reviewEligibility';
import { captureReviewPhoto, chooseReviewPhotos, uploadReviewPhotos, type ReviewPhotoDraft } from '../../services/reviewPhotos';
import { useConsumerTheme } from '../../services/theme';

const RATING_CHOICES=[
  {score:1,label:'Poor'},
  {score:2,label:'Fair'},
  {score:3,label:'Good'},
  {score:4,label:'Very good'},
  {score:5,label:'Excellent'},
] as const;

const CLEAN_CHOICES=[
  {score:20,emoji:'😖',label:'Dirty'},
  {score:50,emoji:'😐',label:'Okay'},
  {score:80,emoji:'🙂',label:'Clean'},
  {score:100,emoji:'✨',label:'Excellent'},
] as const;

function nearestCleanliness(value:string){
  const n=Number(value);
  if(!Number.isFinite(n))return '';
  return String(CLEAN_CHOICES.reduce((best,item)=>Math.abs(item.score-n)<Math.abs(best.score-n)?item:best,CLEAN_CHOICES[0]).score);
}

function friendlyReviewError(error:any){
  const detail=String(error?.message||'');
  if(/OUTSIDE_GEOFENCE|REVIEW_VISIT_UNAVAILABLE/i.test(detail))return "Kleenest hasn't seen a recent visit here yet. Open Kleenest while you're at the location, then review it there or shortly after you leave.";
  if(/AUTH_REQUIRED/i.test(detail))return 'Sign in to review this visit.';
  if(/LOCATION_REQUIRED/i.test(detail))return 'Kleenest needs location access to confirm this visit.';
  if(/REVIEW_ALREADY_EXISTS_FOR_CHECK_IN/i.test(detail))return 'You already reviewed this visit.';
  if(/LOCATION_NOT_VERIFIED/i.test(detail))return 'This location is not available for a verified review right now.';
  if(/permission/i.test(detail))return detail;
  return 'Your review could not be submitted yet. Your choices are still here so you can try again.';
}

export default function QuickReviewScreen(){
  const theme=useConsumerTheme();
  const{id}=useLocalSearchParams<{id:string}>();
  const locationId=String(id||'');
  const[place,setPlace]=useState<any>(null);
  const[presence,setPresence]=useState<ConsumerPresence|null>(null);
  const[eligible,setEligible]=useState<EligibleReviewCheckIn|null>(null);
  const[stars,setStars]=useState('');
  const[cleanliness,setCleanliness]=useState('');
  const[comment,setComment]=useState('');
  const[photos,setPhotos]=useState<ReviewPhotoDraft[]>([]);
  const[preservedAmenities,setPreservedAmenities]=useState<Record<string,ContributionAmenityDraft>>({});
  const[showMore,setShowMore]=useState(false);
  const[submitting,setSubmitting]=useState(false);
  const[hydrated,setHydrated]=useState(false);
  const[message,setMessage]=useState('');
  const[done,setDone]=useState(false);
  const[reviewId,setReviewId]=useState('');

  const ready=/^[1-5]$/.test(stars)&&['20','50','80','100'].includes(cleanliness);
  const address=useMemo(()=>[place?.address,place?.city,place?.state].filter(Boolean).join(', '),[place]);

  useEffect(()=>{
    let active=true;
    setHydrated(false);
    Promise.all([
      getMobileLocation(locationId),
      getConsumerLocationPresence(locationId).catch(()=>null),
      findLatestEligibleReviewCheckIn(locationId).catch(()=>null),
      readContributionDraft(locationId),
    ]).then(([nextPlace,nextPresence,nextEligible,draft])=>{
      if(!active)return;
      setPlace(nextPlace);
      setPresence(nextPresence);
      setEligible(nextEligible);
      if(draft){
        setStars(draft.stars==='5'&&draft.cleanliness===''?'':draft.stars);
        setCleanliness(draft.cleanliness?nearestCleanliness(draft.cleanliness):'');
        setComment(draft.comment||'');
        setPhotos(draft.reviewPhotos||[]);
        setPreservedAmenities(draft.amenityDraft||{});
        if(draft.comment||draft.reviewPhotos?.length)setShowMore(true);
      }
      captureConsumerCoreLoopEvent('review_started',locationId,{
        visitRecognized:Boolean(nextEligible||nextPresence?.check_in_available),
        insideLocation:Boolean(nextPresence?.inside_geofence),
      });
      if(nextPresence?.check_in_available){
        captureConsumerCoreLoopEvent('arrival_detected',locationId,{
          insideLocation:Boolean(nextPresence?.inside_geofence),
        });
      }
    }).catch(()=>setMessage('This location could not be loaded right now.')).finally(()=>{if(active)setHydrated(true)});
    return()=>{active=false};
  },[locationId]);

  useEffect(()=>{
    if(!hydrated||done||submitting)return;
    const timer=setTimeout(()=>{
      void writeContributionDraft({
        locationId,
        stars,
        cleanliness,
        comment,
        amenityDraft:preservedAmenities,
        reviewPhotos:photos,
      });
    },250);
    return()=>clearTimeout(timer);
  },[hydrated,done,submitting,locationId,stars,cleanliness,comment,preservedAmenities,photos]);

  async function addPhoto(source:'camera'|'library'){
    try{
      const remaining=Math.max(0,3-photos.length);
      if(!remaining){setMessage('You already selected 3 photos.');return}
      const picked=source==='camera'
        ? await captureReviewPhoto().then(photo=>photo?[photo]:[])
        : await chooseReviewPhotos(remaining);
      if(picked.length)setPhotos(current=>[...current,...picked].slice(0,3));
    }catch{setMessage('That photo could not be added. You can still submit the review without it.')}
  }

  async function submit(){
    if(!ready||submitting)return;
    setSubmitting(true);
    setMessage('');
    captureConsumerCoreLoopEvent('review_submit_attempt',locationId,{
      visitRecognized:Boolean(eligible||presence?.check_in_available),
      photoCount:photos.length,
      hasNote:Boolean(comment.trim()),
    });
    try{
      let review:any=null;
      let usedExistingVisit=false;
      const existing=eligible||await findLatestEligibleReviewCheckIn(locationId).catch(()=>null);
      if(existing){
        usedExistingVisit=true;
        review=await createMobileReview({
          locationId,
          checkInId:existing.id,
          stars:Number(stars),
          cleanlinessPct:Number(cleanliness),
          comment,
        });
      }else{
        const permission=await Location.requestForegroundPermissionsAsync();
        if(permission.status!=='granted'){
          throw new Error(permission.canAskAgain===false
            ?'Location permission is off. Enable location for Kleenest in your phone settings, then try again.'
            :'Location permission is needed to confirm this visit.');
        }
        let current=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}).catch(()=>null);
        if(!current)current=await Location.getLastKnownPositionAsync().catch(()=>null);
        if(!current)throw new Error('Location is not available yet. Try again when your phone has a location fix.');
        const{data,error}=await getKleenestSupabaseClient().rpc('consumer_quick_review',{
          p_location_id:locationId,
          p_lat:Number(current.coords.latitude),
          p_lng:Number(current.coords.longitude),
          p_stars:Number(stars),
          p_cleanliness_pct:Number(cleanliness),
          p_comment:comment.trim()||null,
        });
        if(error)throw error;
        review=(data as any)?.review||null;
      }

      const nextReviewId=String(review?.id||'');
      if(!nextReviewId)throw new Error('Review response was incomplete.');

      if(photos.length){
        try{
          const uploaded=await uploadReviewPhotos(nextReviewId,photos);
          if(uploaded.length)captureConsumerCoreLoopEvent('review_photo_added',locationId,{count:uploaded.length,phase:'submit'});
        }catch{
          setMessage('Your review was saved. The photo upload can be retried from the location page.');
        }
      }

      await clearContributionDraft(locationId);
      setReviewId(nextReviewId);
      setDone(true);
      captureConsumerCoreLoopEvent('review_submit_success',locationId,{
        usedExistingVisit,
        photoCount:photos.length,
        hasNote:Boolean(comment.trim()),
      });
    }catch(error:any){
      setMessage(friendlyReviewError(error));
      captureConsumerCoreLoopEvent('review_submit_failed',locationId,{
        reason:String(error?.message||'unknown').slice(0,160),
      });
    }finally{
      setSubmitting(false);
    }
  }

  async function addPhotoAfterReview(source:'camera'|'library'){
    if(!reviewId)return;
    try{
      const picked=source==='camera'
        ? await captureReviewPhoto().then(photo=>photo?[photo]:[])
        : await chooseReviewPhotos(1);
      if(!picked.length)return;
      const uploaded=await uploadReviewPhotos(reviewId,picked.slice(0,1));
      if(uploaded.length){
        captureConsumerCoreLoopEvent('review_photo_added',locationId,{count:uploaded.length,phase:'after_submit'});
        setMessage('Photo added to your review.');
      }
    }catch{setMessage('The review is saved, but that photo could not be added yet.')}
  }

  function finish(){
    captureConsumerCoreLoopEvent('review_done',locationId);
    router.back();
  }

  if(!place)return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><View style={s.loading}><Text style={[s.loadingTitle,{color:theme.ink}]}>Getting this bathroom ready…</Text>{message?<Text style={[s.body,{color:theme.muted}]}>{message}</Text>:null}</View></SafeAreaView>;

  if(done)return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.page}>
    <View style={[s.successCard,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <View style={[s.successIcon,{backgroundColor:theme.accent}]}><Text style={[s.successIconText,{color:theme.accentText}]}>✓</Text></View>
      <Text style={[s.successTitle,{color:theme.ink}]}>Review added</Text>
      <Text style={[s.body,{color:theme.muted}]}>Thanks. Your visit now helps the next person decide where to go.</Text>
      {message?<Text style={[s.message,{color:theme.muted}]}>{message}</Text>:null}
      <View style={s.afterActions}>
        <Pressable style={[s.secondary,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={()=>void addPhotoAfterReview('camera')}><Text style={[s.secondaryText,{color:theme.accent}]}>📷 Add a photo</Text></Pressable>
        <Pressable style={[s.secondary,{backgroundColor:theme.accentSoft,borderColor:theme.line}]} onPress={()=>router.replace('/location/'+locationId)}><Text style={[s.secondaryText,{color:theme.accent}]}>See location</Text></Pressable>
      </View>
      <Pressable style={[s.primary,{backgroundColor:theme.accent}]} onPress={finish}><Text style={[s.primaryText,{color:theme.accentText}]}>Done</Text></Pressable>
    </View>
  </ScrollView></SafeAreaView>;

  const visitReady=Boolean(eligible||presence?.check_in_available);

  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.topRow}><Pressable onPress={()=>router.back()} style={[s.back,{backgroundColor:theme.accentSoft}]}><Text style={[s.backText,{color:theme.accent}]}>‹ Back</Text></Pressable><Text style={[s.kicker,{color:theme.accent}]}>QUICK REVIEW</Text></View>

    <View style={[s.placeCard,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <PlaceIcon item={place} size={52}/>
      <View style={{flex:1}}><Text style={[s.placeName,{color:theme.ink}]}>{place.name||'Bathroom'}</Text><Text style={[s.address,{color:theme.muted}]}>{address||'Address unavailable'}</Text></View>
    </View>

    <View style={[s.visitCard,{backgroundColor:visitReady?theme.accentSoft:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.visitTitle,{color:theme.ink}]}>{visitReady?'Your visit is ready':'At this location now?'}</Text>
      <Text style={[s.body,{color:theme.muted}]}>{visitReady?'Review it now or shortly after you leave.':'Choose your rating below. When you submit, Kleenest will confirm the visit without making you do a separate check-in first.'}</Text>
    </View>

    <View style={[s.reviewCard,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.title,{color:theme.ink}]}>How was it?</Text>
      <Text style={[s.sectionLabel,{color:theme.muted}]}>OVERALL</Text>
      <View style={s.ratingRow}>{RATING_CHOICES.map(choice=>{const selected=stars===String(choice.score);return <Pressable key={choice.score} accessibilityRole="button" accessibilityState={{selected}} style={[s.ratingChoice,{backgroundColor:theme.surfaceRaised,borderColor:theme.line},selected&&{backgroundColor:theme.accent,borderColor:theme.accent}]} onPress={()=>setStars(String(choice.score))}><Text style={[s.ratingScore,{color:selected?theme.accentText:theme.ink}]}>{choice.score}★</Text><Text style={[s.ratingLabel,{color:selected?theme.accentText:theme.muted}]}>{choice.label}</Text></Pressable>})}</View>

      <Text style={[s.sectionLabel,{color:theme.muted}]}>CLEANLINESS</Text>
      <View style={s.cleanRow}>{CLEAN_CHOICES.map(choice=>{const selected=cleanliness===String(choice.score);return <Pressable key={choice.score} accessibilityRole="button" accessibilityState={{selected}} style={[s.cleanChoice,{backgroundColor:theme.surfaceRaised,borderColor:theme.line},selected&&{backgroundColor:theme.accentSoft,borderColor:theme.accent}]} onPress={()=>setCleanliness(String(choice.score))}><Text style={s.cleanEmoji}>{choice.emoji}</Text><Text style={[s.cleanLabel,{color:selected?theme.accent:theme.ink}]}>{choice.label}</Text></Pressable>})}</View>

      <Pressable accessibilityRole="button" style={[s.moreToggle,{borderColor:theme.line}]} onPress={()=>setShowMore(value=>!value)}><Text style={[s.moreToggleText,{color:theme.accent}]}>{showMore?'Hide optional details':'＋ Add a note or photo · optional'}</Text></Pressable>

      {showMore?<View style={s.optional}>
        <TextInput multiline value={comment} onChangeText={setComment} placeholder="Anything useful for the next person?" placeholderTextColor={theme.muted} style={[s.note,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
        <View style={s.photoButtons}>
          <Pressable disabled={photos.length>=3} style={[s.secondary,{backgroundColor:theme.accentSoft,borderColor:theme.line},photos.length>=3&&s.disabled]} onPress={()=>void addPhoto('camera')}><Text style={[s.secondaryText,{color:theme.accent}]}>📷 Take photo</Text></Pressable>
          <Pressable disabled={photos.length>=3} style={[s.secondary,{backgroundColor:theme.accentSoft,borderColor:theme.line},photos.length>=3&&s.disabled]} onPress={()=>void addPhoto('library')}><Text style={[s.secondaryText,{color:theme.accent}]}>Choose photo</Text></Pressable>
        </View>
        {photos.length?<View style={s.photoRow}>{photos.map((photo,index)=><View key={photo.uri+'-'+index} style={s.photoWrap}><Image source={{uri:photo.uri}} style={s.photo}/><Pressable style={[s.removePhoto,{backgroundColor:theme.accent}]} onPress={()=>setPhotos(current=>current.filter((_,i)=>i!==index))}><Text style={[s.removePhotoText,{color:theme.accentText}]}>×</Text></Pressable></View>)}</View>:null}
      </View>:null}

      {message?<Text style={[s.message,{color:theme.muted}]}>{message}</Text>:null}
      <Pressable disabled={!ready||submitting} style={[s.primary,{backgroundColor:theme.accent},(!ready||submitting)&&s.disabled]} onPress={()=>void submit()}><Text style={[s.primaryText,{color:theme.accentText}]}>{submitting?'Adding your review…':'Submit review'}</Text></Pressable>
      {!ready?<Text style={[s.helper,{color:theme.muted}]}>Choose one overall rating and one cleanliness option.</Text>:null}
    </View>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:palette.canvas},
  page:{padding:18,paddingBottom:40,gap:12},
  loading:{padding:22,gap:8},
  loadingTitle:{fontSize:22,fontWeight:'900'},
  topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  back:{paddingHorizontal:12,paddingVertical:8,borderRadius:999},
  backText:{fontWeight:'900'},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1.2},
  placeCard:{borderWidth:1,borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',gap:12},
  placeName:{fontSize:20,fontWeight:'900'},
  address:{fontSize:11,lineHeight:16,fontWeight:'700',marginTop:2},
  visitCard:{borderWidth:1,borderRadius:16,padding:13,gap:3},
  visitTitle:{fontSize:15,fontWeight:'900'},
  body:{fontSize:12,lineHeight:18,fontWeight:'700'},
  reviewCard:{borderWidth:1,borderRadius:22,padding:16,gap:12},
  title:{fontSize:28,fontWeight:'900'},
  sectionLabel:{fontSize:9,fontWeight:'900',letterSpacing:1.1,marginTop:2},
  ratingRow:{flexDirection:'row',gap:6},
  ratingChoice:{flex:1,minWidth:0,borderWidth:1,borderRadius:12,paddingVertical:10,paddingHorizontal:4,alignItems:'center',gap:2},
  ratingScore:{fontSize:13,fontWeight:'900'},
  ratingLabel:{fontSize:7,fontWeight:'800',textAlign:'center'},
  cleanRow:{flexDirection:'row',gap:7},
  cleanChoice:{flex:1,borderWidth:1,borderRadius:13,paddingVertical:10,paddingHorizontal:5,alignItems:'center',gap:3},
  cleanEmoji:{fontSize:21},
  cleanLabel:{fontSize:9,fontWeight:'900'},
  moreToggle:{borderTopWidth:1,paddingTop:12},
  moreToggleText:{fontSize:11,fontWeight:'900'},
  optional:{gap:9},
  note:{minHeight:82,borderWidth:1,borderRadius:13,padding:12,textAlignVertical:'top'},
  photoButtons:{flexDirection:'row',gap:8,flexWrap:'wrap'},
  secondary:{borderWidth:1,borderRadius:12,paddingHorizontal:12,paddingVertical:10},
  secondaryText:{fontSize:10,fontWeight:'900'},
  photoRow:{flexDirection:'row',gap:8,flexWrap:'wrap'},
  photoWrap:{position:'relative'},
  photo:{width:86,height:86,borderRadius:12},
  removePhoto:{position:'absolute',right:-5,top:-5,width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},
  removePhotoText:{fontSize:18,fontWeight:'900',lineHeight:20},
  primary:{borderRadius:14,paddingVertical:14,paddingHorizontal:14,alignItems:'center'},
  primaryText:{fontSize:15,fontWeight:'900'},
  disabled:{opacity:.45},
  helper:{fontSize:10,fontWeight:'700',textAlign:'center'},
  message:{fontSize:11,lineHeight:17,fontWeight:'800'},
  successCard:{marginTop:24,borderWidth:1,borderRadius:24,padding:20,gap:11,alignItems:'stretch'},
  successIcon:{width:54,height:54,borderRadius:27,alignItems:'center',justifyContent:'center',alignSelf:'center'},
  successIconText:{fontSize:27,fontWeight:'900'},
  successTitle:{fontSize:26,fontWeight:'900',textAlign:'center'},
  afterActions:{flexDirection:'row',gap:8,flexWrap:'wrap'},
});
