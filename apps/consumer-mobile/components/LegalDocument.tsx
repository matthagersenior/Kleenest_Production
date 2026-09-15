import { ReactNode } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { palette } from './ConsumerUI';
import { useConsumerTheme } from '../services/theme';

export function LegalDocument({ eyebrow, title, effective = 'September 1, 2026', children }:{eyebrow:string;title:string;effective?:string;children:ReactNode}) {
  const theme=useConsumerTheme();
  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.content}>
    <Text style={[s.eyebrow,{color:theme.accent}]}>{eyebrow}</Text><Text accessibilityRole="header" style={[s.title,{color:theme.ink}]}>{title}</Text><Text style={[s.effective,{color:theme.muted}]}>Effective {effective}</Text>
    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>{children}</View>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={[s.back,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.backText,{color:theme.accent}]}>Back</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

export function LegalSection({ title, children }:{title:string;children:ReactNode}) { const theme=useConsumerTheme(); return <View style={s.section}><Text accessibilityRole="header" style={[s.sectionTitle,{color:theme.ink}]}>{title}</Text><Text style={[s.body,{color:theme.muted}]}>{children}</Text></View>; }

const s=StyleSheet.create({safe:{flex:1,backgroundColor:palette.canvas},content:{padding:20,paddingBottom:50,gap:11},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.7,color:palette.muted},title:{fontSize:32,lineHeight:37,fontWeight:'900',color:palette.ink},effective:{fontSize:12,fontWeight:'800',color:palette.muted},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dce6df',borderRadius:20,padding:18,gap:18},section:{gap:5},sectionTitle:{fontSize:18,fontWeight:'900',color:palette.ink},body:{fontSize:14,lineHeight:22,color:palette.muted},back:{minHeight:48,backgroundColor:'#edf3ef',borderRadius:14,alignItems:'center',justifyContent:'center'},backText:{fontWeight:'900',color:palette.green}});
