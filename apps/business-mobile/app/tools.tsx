import { Link } from 'expo-router';
import { useMemo,useState } from 'react';
import { ScrollView,StyleSheet,Text,TextInput,View } from 'react-native';
import { BUSINESS_ACTIONS,BUSINESS_ACTION_GROUPS } from '../services/actionRegistry';
import { BusinessCard,BusinessHero,SectionHeader,businessColors } from '../components/BusinessOS';

export default function BusinessTools(){
 const[query,setQuery]=useState('');
 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase();
  if(!q)return BUSINESS_ACTIONS;
  return BUSINESS_ACTIONS.filter(item=>[
    item.title,item.description,item.group,item.route,...item.serviceActions,...(item.keywords||[])
  ].join(' ').toLowerCase().includes(q));
 },[query]);
 return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.page}>
  <BusinessHero eyebrow="BUSINESS ACTION CENTER" title="Every Business action, one place." body="Find the job you need to do, then jump directly to the screen that owns the action. This registry is audited against Business service mutations so backend capability cannot silently outgrow the UI."/>
  <BusinessCard>
   <Text style={s.label}>FIND A TOOL OR ACTION</Text>
   <TextInput accessibilityLabel="Search Business actions" value={query} onChangeText={setQuery} placeholder="Try: review reply, QR, staff, report, location, campaign…" placeholderTextColor="#829188" style={s.input}/>
   <Text style={s.meta}>{filtered.length} action group{filtered.length===1?'':'s'} matched</Text>
  </BusinessCard>
  {BUSINESS_ACTION_GROUPS.map(group=>{
   const rows=filtered.filter(item=>item.group===group);
   if(!rows.length)return null;
   return <View key={group} style={s.section}>
    <SectionHeader title={group} body={group==='Today'?'High-frequency actions that keep the Business running.':undefined}/>
    <View style={s.grid}>{rows.map(item=><Link key={item.id} href={item.route as any} asChild><BusinessCard style={s.actionCard}>
     <Text style={s.actionTitle}>{item.title}</Text>
     <Text style={s.meta}>{item.description}</Text>
     <View style={s.footer}><Text style={s.route}>{item.route.replace('/','').replaceAll('-',' ')}</Text><Text style={s.open}>OPEN →</Text></View>
    </BusinessCard></Link>)}</View>
   </View>;
  })}
 </ScrollView>
}

const s=StyleSheet.create({
 page:{padding:18,gap:16,backgroundColor:businessColors.paper,paddingBottom:70},
 label:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:businessColors.green},
 input:{borderWidth:1,borderColor:businessColors.border,borderRadius:13,paddingHorizontal:13,paddingVertical:12,backgroundColor:'#fafcfb',color:businessColors.ink,fontSize:14},
 meta:{fontSize:12,lineHeight:18,color:businessColors.muted},
 section:{gap:9},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:10},
 actionCard:{flexGrow:1,flexBasis:260,minWidth:250,maxWidth:520},
 actionTitle:{fontSize:16,lineHeight:21,fontWeight:'900',color:businessColors.ink},
 footer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,marginTop:4},
 route:{fontSize:9,fontWeight:'800',color:'#708178',textTransform:'uppercase'},
 open:{fontSize:10,fontWeight:'900',color:businessColors.green}
});
