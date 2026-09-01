import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function Map({children,style}:any){return <View style={[styles.map,style]}><View style={styles.banner}><Text style={styles.bannerTitle}>MAP PREVIEW</Text><Text style={styles.bannerText}>Native MapLibre remains authoritative in the Android APK.</Text></View><View style={styles.markers}>{children}</View></View>}
export function Camera(){return null}
export function Marker({children,onPress}:any){return <Pressable accessibilityRole="button" onPress={onPress} style={styles.marker}>{children}</Pressable>}
export function GeoJSONSource({children}:any){return <>{children}</>}
export function Layer(){return null}

const styles=StyleSheet.create({
  map:{minHeight:260,backgroundColor:'#e3ece6',alignItems:'center',justifyContent:'center',padding:18,gap:14},
  banner:{maxWidth:420,backgroundColor:'rgba(255,255,255,.94)',borderRadius:16,padding:14,alignItems:'center'},
  bannerTitle:{fontSize:10,fontWeight:'900',letterSpacing:1.4,color:'#173d2b'},
  bannerText:{fontSize:12,lineHeight:18,textAlign:'center',color:'#5f7166',fontWeight:'700',marginTop:3},
  markers:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center',justifyContent:'center'},
  marker:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
});
