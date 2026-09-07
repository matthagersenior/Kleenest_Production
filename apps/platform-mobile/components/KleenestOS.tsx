import { useState,type ReactNode } from 'react';
import { Pressable,Text,View } from 'react-native';

export const osColors={ink:'#10261d',green:'#173f2d',mint:'#dcebe2',paper:'#f4f7f5',white:'#ffffff',muted:'#5e7066',border:'#d5e0d9',danger:'#8f2f2f',warning:'#8a5a18',good:'#1d6b43'};
export const osCard={backgroundColor:osColors.white,borderRadius:18,padding:15,borderWidth:1,borderColor:osColors.border,gap:7} as const;

export function OSHero({eyebrow,title,body,children}:{eyebrow:string;title:string;body:string;children?:ReactNode}){return <View style={{backgroundColor:osColors.ink,borderRadius:22,padding:18,gap:7}}><Text style={{color:'#bde4cf',fontWeight:'900',letterSpacing:1.3,fontSize:10}}>{eyebrow}</Text><Text style={{color:'white',fontSize:28,fontWeight:'900'}}>{title}</Text><Text style={{color:'#dce8e1',lineHeight:20}}>{body}</Text>{children}</View>}

export function StatusPill({label,tone='neutral'}:{label:string;tone?:'good'|'warning'|'danger'|'neutral'}){const background=tone==='good'?'#e1f3e9':tone==='warning'?'#f7ecd8':tone==='danger'?'#f7e2e2':'#eef2ef';const color=tone==='good'?osColors.good:tone==='warning'?osColors.warning:tone==='danger'?osColors.danger:osColors.muted;return <View style={{alignSelf:'flex-start',borderRadius:999,paddingHorizontal:9,paddingVertical:5,backgroundColor:background}}><Text style={{color,fontWeight:'900',fontSize:11}}>{label}</Text></View>}

export function HealthCard({label,value,detail,tone='neutral',onPress}:{label:string;value:string|number;detail?:string;tone?:'good'|'warning'|'danger'|'neutral';onPress?:()=>void}){const body=<View style={{...osCard,minWidth:145,flexGrow:1}}><StatusPill label={label} tone={tone}/><Text style={{fontSize:25,fontWeight:'900',color:osColors.ink}}>{String(value)}</Text>{detail?<Text style={{color:osColors.muted,lineHeight:18}}>{detail}</Text>:null}</View>;return onPress?<Pressable onPress={onPress} style={{flexGrow:1,flexBasis:145}}>{body}</Pressable>:body}

export function SectionHeader({title,body,actionLabel,onAction}:{title:string;body?:string;actionLabel?:string;onAction?:()=>void}){return <View style={{gap:4}}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}><Text style={{fontSize:19,fontWeight:'900',color:osColors.ink,flex:1}}>{title}</Text>{actionLabel&&onAction?<Pressable onPress={onAction}><Text style={{fontWeight:'900',color:osColors.green}}>{actionLabel}</Text></Pressable>:null}</View>{body?<Text style={{color:osColors.muted,lineHeight:19}}>{body}</Text>:null}</View>}

export function DiagnosticDisclosure({title,value}:{title:string;value:unknown}){const[open,setOpen]=useState(false);return <View style={osCard}><Pressable onPress={()=>setOpen(value=>!value)}><Text style={{fontWeight:'900',color:osColors.green}}>{open?'Hide':'Show'} {title}</Text></Pressable>{open?<Text selectable style={{fontFamily:'monospace',fontSize:11,color:osColors.muted}}>{JSON.stringify(value,null,2)}</Text>:null}</View>}
