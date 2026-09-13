import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg,{Circle,Line,Path,Rect} from 'react-native-svg';

export const businessColors={
  ink:'#10261d',green:'#173f2d',green2:'#245a40',mint:'#dcebe2',paper:'#f4f7f5',white:'#ffffff',
  muted:'#64766b',border:'#d5e0d9',gold:'#d9b86b',teal:'#2f7e72',blue:'#4d73a7',purple:'#7b5aa6',
  coral:'#b96557',warning:'#9a6a22',danger:'#9a3f3f',good:'#1f7448'
};

const shadow=Platform.OS==='web'?({boxShadow:'0 12px 30px rgba(15,48,32,.08)'} as any):{shadowColor:'#10261d',shadowOpacity:.08,shadowRadius:12,shadowOffset:{width:0,height:7},elevation:2};

export function BusinessCard({children,style}:{children:ReactNode;style?:any}){return <View style={[s.card,shadow,style]}>{children}</View>}

export function BusinessHero({eyebrow,title,body,children}:{eyebrow:string;title:string;body:string;children?:ReactNode}){
 return <View style={s.hero}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.heroTitle}>{title}</Text><Text style={s.heroBody}>{body}</Text>{children}</View>
}

export function SectionHeader({title,body,actionLabel,onAction}:{title:string;body?:string;actionLabel?:string;onAction?:()=>void}){
 return <View style={{gap:4}}><View style={s.spread}><Text style={s.sectionTitle}>{title}</Text>{actionLabel&&onAction?<Pressable onPress={onAction}><Text style={s.actionLink}>{actionLabel}</Text></Pressable>:null}</View>{body?<Text style={s.meta}>{body}</Text>:null}</View>
}

export function StatCard({label,value,detail,tone='green'}:{label:string;value:string|number;detail?:string;tone?:'green'|'gold'|'teal'|'blue'|'purple'|'coral'}){
 const color=tone==='gold'?businessColors.gold:tone==='teal'?businessColors.teal:tone==='blue'?businessColors.blue:tone==='purple'?businessColors.purple:tone==='coral'?businessColors.coral:businessColors.green;
 return <BusinessCard style={{flexGrow:1,flexBasis:150,minWidth:145}}><View style={[s.statAccent,{backgroundColor:color}]}/><Text style={s.statValue}>{String(value)}</Text><Text style={s.statLabel}>{label}</Text>{detail?<Text style={s.meta}>{detail}</Text>:null}</BusinessCard>
}

function clamp(v:number,min:number,max:number){return Math.min(max,Math.max(min,v))}
function pathFor(values:number[],width:number,height:number){
 if(!values.length)return'';
 const max=Math.max(...values,1),min=Math.min(...values,0),range=Math.max(1,max-min);
 return values.map((value,index)=>{
  const x=values.length===1?width/2:(index/(values.length-1))*width;
  const y=height-((value-min)/range)*height;
  return `${index===0?'M':'L'} ${x.toFixed(2)} ${clamp(y,2,height-2).toFixed(2)}`;
 }).join(' ');
}

export function TrendChart({title,subtitle,values,labels=[]}:{title:string;subtitle?:string;values:number[];labels?:string[]}){
 const clean=values.map(v=>Number.isFinite(v)?v:0).slice(-12),w=320,h=112,path=pathFor(clean,w,h);
 const last=clean.at(-1)??0,first=clean[0]??0,delta=last-first;
 return <BusinessCard><View style={s.spread}><View style={{flex:1}}><Text style={s.chartTitle}>{title}</Text>{subtitle?<Text style={s.meta}>{subtitle}</Text>:null}</View><Text style={[s.delta,delta<0&&{color:businessColors.coral}]}>{delta>0?'+':''}{delta.toLocaleString()}</Text></View><View style={s.chartWrap}><Svg width="100%" height={130} viewBox={`0 0 ${w} 130`}><Line x1="0" y1="112" x2={w} y2="112" stroke="#dbe4dd" strokeWidth="1"/><Path d={path} fill="none" stroke={businessColors.teal} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{clean.map((v,i)=>{const max=Math.max(...clean,1),min=Math.min(...clean,0),range=Math.max(1,max-min),x=clean.length===1?w/2:(i/(clean.length-1))*w,y=h-((v-min)/range)*h;return <Circle key={i} cx={x} cy={clamp(y,2,h-2)} r={i===clean.length-1?5:3} fill={i===clean.length-1?businessColors.gold:businessColors.teal}/>})}</Svg></View>{labels.length?<View style={s.labelRow}>{labels.slice(-4).map((label,i)=><Text key={`${label}:${i}`} style={s.axisLabel}>{label}</Text>)}</View>:null}</BusinessCard>
}

export function BarChart({title,subtitle,items}:{title:string;subtitle?:string;items:{label:string;value:number}[]}){
 const rows=items.filter(x=>Number.isFinite(x.value)).slice(0,8),max=Math.max(...rows.map(x=>Math.max(0,x.value)),1);
 const palette=[businessColors.green,businessColors.teal,businessColors.blue,businessColors.gold,businessColors.purple,businessColors.coral];
 return <BusinessCard><Text style={s.chartTitle}>{title}</Text>{subtitle?<Text style={s.meta}>{subtitle}</Text>:null}<View style={{gap:10,marginTop:7}}>{rows.map((row,index)=><View key={row.label} style={{gap:4}}><View style={s.spread}><Text style={s.barLabel}>{row.label}</Text><Text style={s.barValue}>{row.value.toLocaleString()}</Text></View><View style={s.track}><View style={[s.fill,{width:`${Math.max(3,(Math.max(0,row.value)/max)*100)}%`,backgroundColor:palette[index%palette.length]}]}/></View></View>)}</View></BusinessCard>
}

export function DonutChart({title,value,total,label}:{title:string;value:number;total:number;label:string}){
 const pct=total>0?clamp(value/total,0,1):0,r=42,circ=2*Math.PI*r,dash=circ*pct;
 return <BusinessCard><Text style={s.chartTitle}>{title}</Text><View style={s.donutRow}><Svg width={118} height={118} viewBox="0 0 118 118"><Circle cx="59" cy="59" r={r} fill="none" stroke="#e5ece7" strokeWidth="14"/><Circle cx="59" cy="59" r={r} fill="none" stroke={businessColors.green2} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${dash} ${circ-dash}`} rotation="-90" origin="59,59"/></Svg><View style={{flex:1,gap:3}}><Text style={s.donutValue}>{Math.round(pct*100)}%</Text><Text style={s.statLabel}>{label}</Text><Text style={s.meta}>{value.toLocaleString()} of {total.toLocaleString()}</Text></View></View></BusinessCard>
}

export function InsightCallout({title,body,tone='good',actionLabel,onPress}:{title:string;body:string;tone?:'good'|'warning'|'danger';actionLabel?:string;onPress?:()=>void}){
 const border=tone==='danger'?'#e4bebe':tone==='warning'?'#e7d0a4':'#bfdcc9',background=tone==='danger'?'#fff7f7':tone==='warning'?'#fffaf0':'#f3faf6';
 return <View style={[s.callout,{borderColor:border,backgroundColor:background}]}><View style={{flex:1,gap:3}}><Text style={s.calloutTitle}>{title}</Text><Text style={s.meta}>{body}</Text></View>{actionLabel&&onPress?<Pressable onPress={onPress}><Text style={s.actionLink}>{actionLabel}</Text></Pressable>:null}</View>
}

const s=StyleSheet.create({
 card:{backgroundColor:businessColors.white,borderRadius:20,padding:16,borderWidth:1,borderColor:businessColors.border,gap:7},
 hero:{backgroundColor:businessColors.ink,borderRadius:26,padding:20,gap:7},
 eyebrow:{color:'#bde4cf',fontSize:10,fontWeight:'900',letterSpacing:1.35},
 heroTitle:{color:'#fff',fontSize:29,lineHeight:34,fontWeight:'900'},
 heroBody:{color:'#dce8e1',fontSize:14,lineHeight:21},
 sectionTitle:{fontSize:20,fontWeight:'900',color:businessColors.ink},
 meta:{fontSize:12,lineHeight:18,color:businessColors.muted},
 spread:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10},
 actionLink:{fontSize:11,fontWeight:'900',color:businessColors.green},
 statAccent:{height:5,width:38,borderRadius:999,marginBottom:3},
 statValue:{fontSize:26,fontWeight:'900',color:businessColors.ink},
 statLabel:{fontSize:11,fontWeight:'900',color:'#385144'},
 chartTitle:{fontSize:17,fontWeight:'900',color:businessColors.ink},
 chartWrap:{marginTop:5,overflow:'hidden'},
 delta:{fontSize:14,fontWeight:'900',color:businessColors.good},
 labelRow:{flexDirection:'row',justifyContent:'space-between',gap:8},
 axisLabel:{fontSize:9,fontWeight:'800',color:'#849188'},
 barLabel:{fontSize:11,fontWeight:'800',color:'#42564a',flex:1},
 barValue:{fontSize:11,fontWeight:'900',color:businessColors.ink},
 track:{height:9,backgroundColor:'#edf2ee',borderRadius:999,overflow:'hidden'},
 fill:{height:9,borderRadius:999},
 donutRow:{flexDirection:'row',alignItems:'center',gap:13},
 donutValue:{fontSize:31,fontWeight:'900',color:businessColors.ink},
 callout:{borderWidth:1,borderRadius:17,padding:14,flexDirection:'row',alignItems:'center',gap:12},
 calloutTitle:{fontSize:14,fontWeight:'900',color:businessColors.ink}
});
