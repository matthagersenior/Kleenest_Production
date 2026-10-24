import { findAdaptiveNearbyRestrooms } from '@kleenest/mobile-core';
import * as Location from 'expo-location';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { resolveConsumerSearchLocation } from '../services/locationResolver';
import { chooseConsumerWidgetCurrentArea, chooseConsumerWidgetNamedArea } from '../services/consumerWidgets';

const START_RADIUS_METERS = 1609;
const MAX_RADIUS_METERS = 40234;

export default function WidgetLocationScreen(){
  const params = useLocalSearchParams<{widgetId?:string;area?:string}>();
  const widgetId = Number(Array.isArray(params.widgetId)?params.widgetId[0]:params.widgetId);
  const validWidgetId = Number.isSafeInteger(widgetId)&&widgetId>0;
  const [area,setArea] = useState(String(params.area||''));
  const [working,setWorking] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');

  async function nearby(latitude:number,longitude:number){
    const result = await findAdaptiveNearbyRestrooms({
      latitude,longitude,
      requestedRadiusMeters:START_RADIUS_METERS,
      maxRadiusMeters:MAX_RADIUS_METERS,
      search:'',
      amenityNames:[],
      amenityMatch:'all',
      autoExpand:true,
      hardRadius:false,
      limit:40,
    });
    return result.rows||[];
  }

  async function selectCurrent(){
    if(working||!validWidgetId)return;
    setWorking(true);setError('');setMessage('');
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted')throw new Error('Allow location access to follow your phone, or choose a city instead.');
      const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      const rows=await nearby(position.coords.latitude,position.coords.longitude);
      await chooseConsumerWidgetCurrentArea(widgetId,rows);
      setMessage('Widget set to your current area. '+rows.length+' restroom result(s) returned. Open Kleenest to refresh as you move.');
    }catch(caught:any){
      setError(String(caught?.message||'Kleenest could not refresh your location. Try again.'));
    }finally{setWorking(false);}
  }

  async function selectNamedArea(){
    if(working||!validWidgetId)return;
    const query=area.trim();
    if(!query){setError('Enter a city, address or ZIP code first.');return;}
    setWorking(true);setError('');setMessage('');
    try{
      const match=await resolveConsumerSearchLocation(query);
      if(!match)throw new Error('Kleenest could not find that area. Try a city and state or a ZIP code.');
      const rows=await nearby(match.latitude,match.longitude);
      await chooseConsumerWidgetNamedArea(widgetId,String(match.label||query),rows);
      setMessage('Pinned '+String(match.label||query)+' to this widget. '+rows.length+' restroom result(s) returned. This location will not change when you search elsewhere.');
    }catch(caught:any){
      setError(String(caught?.message||'Could not save this area. Try again.'));
    }finally{setWorking(false);}
  }

  if(Platform.OS!=='android')return <View style={styles.page}><Text style={styles.title}>Android widget location</Text><Text style={styles.help}>This location picker is available in the Kleenest Android app.</Text></View>;
  return <KeyboardAvoidingView style={styles.page} behavior="height">
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Widget location</Text>
      <Text style={styles.help}>Decide where this home-screen widget searches. The selected area and recent results will be visible on your home screen.</Text>
      {!validWidgetId?<Text style={styles.error}>Open this screen by tapping the location line on a Kleenest widget.</Text>:null}
      <View style={styles.card}>
        <Text style={styles.heading}>Follow my phone</Text>
        <Text style={styles.help}>Use your current location when you open or refresh Kleenest. The widget does not run GPS in the background.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{disabled:working||!validWidgetId}} disabled={working||!validWidgetId} style={styles.button} onPress={()=>void selectCurrent()}>
          <Text style={styles.buttonLabel}>Use current location</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.heading}>Choose a different area</Text>
        <Text style={styles.help}>Pin a city, address, or ZIP code. It stays selected until you change it.</Text>
        <TextInput
          accessibilityLabel="Widget search city, address, or ZIP code"
          autoCapitalize="words" autoCorrect={false} returnKeyType="search"
          placeholder="Example: St. Louis, MO" placeholderTextColor="#96AC9E"
          value={area} onChangeText={setArea} onSubmitEditing={()=>void selectNamedArea()}
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityState={{disabled:working||!validWidgetId}} disabled={working||!validWidgetId} style={styles.button} onPress={()=>void selectNamedArea()}>
          <Text style={styles.buttonLabel}>Pin this area to widget</Text>
        </Pressable>
      </View>
      {working?<ActivityIndicator accessibilityLabel="Refreshing widget location" size="large" color="#72F1AF"/>:null}
      {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
      {message?<Text accessibilityRole="text" style={styles.success}>{message}</Text>:null}
      <Pressable accessibilityRole="button" onPress={()=>router.replace('/explore')} style={styles.link}>
        <Text style={styles.linkText}>Open Kleenest Explore</Text>
      </Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:'#071E16'},
  content:{padding:20,paddingBottom:60,gap:15},
  title:{fontSize:26,fontWeight:'900',color:'#72F1AF'},
  heading:{fontSize:18,fontWeight:'800',color:'#FFFFFF',marginBottom:8},
  help:{fontSize:15,lineHeight:22,color:'#CEE5D8'},
  card:{backgroundColor:'#113C2C',borderColor:'#316A53',borderWidth:1,borderRadius:14,padding:16,gap:12},
  input:{backgroundColor:'#FFFFFF',color:'#061C14',minHeight:48,borderRadius:9,paddingHorizontal:12,fontSize:17},
  button:{minHeight:48,justifyContent:'center',alignItems:'center',borderRadius:9,backgroundColor:'#72F1AF',paddingHorizontal:10},
  buttonLabel:{fontSize:16,fontWeight:'800',color:'#061C14'},
  error:{color:'#FFC8BD',fontSize:15,lineHeight:22,fontWeight:'700'},
  success:{color:'#72F1AF',fontSize:15,lineHeight:22,fontWeight:'700'},
  link:{paddingVertical:12,alignItems:'center'},
  linkText:{color:'#72F1AF',textDecorationLine:'underline',fontSize:15,fontWeight:'700'},
});
