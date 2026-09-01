import { ReactNode } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { palette } from './ConsumerUI';

export function LegalDocument({ eyebrow, title, effective = 'September 1, 2026', children }:{eyebrow:string;title:string;effective?:string;children:ReactNode}) {
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.eyebrow}>{eyebrow}</Text><Text accessibilityRole="header" style={s.title}>{title}</Text><Text style={s.effective}>Effective {effective}</Text>
    <View style={s.card}>{children}</View>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.back}><Text style={s.backText}>Back</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

export function LegalSection({ title, children }:{title:string;children:ReactNode}) { return <View style={s.section}><Text accessibilityRole="header" style={s.sectionTitle}>{title}</Text><Text style={s.body}>{children}</Text></View>; }

const s=StyleSheet.create({safe:{flex:1,backgroundColor:palette.canvas},content:{padding:20,paddingBottom:50,gap:11},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.7,color:palette.muted},title:{fontSize:32,lineHeight:37,fontWeight:'900',color:palette.ink},effective:{fontSize:12,fontWeight:'800',color:palette.muted},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dce6df',borderRadius:20,padding:18,gap:18},section:{gap:5},sectionTitle:{fontSize:18,fontWeight:'900',color:palette.ink},body:{fontSize:14,lineHeight:22,color:palette.muted},back:{minHeight:48,backgroundColor:'#edf3ef',borderRadius:14,alignItems:'center',justifyContent:'center'},backText:{fontWeight:'900',color:palette.green}});
