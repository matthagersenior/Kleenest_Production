import { useEffect,useMemo,useState } from 'react';
import { RefreshControl,ScrollView,StyleSheet,Text,View } from 'react-native';
import { BarChart,BusinessCard,BusinessHero,DonutChart,SectionHeader,StatCard,TrendChart,businessColors } from './BusinessOS';
import { getBusinessAnalytics } from '../services/product';
import { currentBusinessId } from '../services/capabilityWorkflows';

type Row=Record<string,any>;
const labels:Record<string,string>={business_campaign_analytics:'Campaigns',business_engagement_analytics:'Engagement',business_location_analytics:'Locations',business_qr_detail:'QR',business_review_detail:'Reviews',business_benchmark_analytics:'Benchmarks',business_occupancy_analytics:'Occupancy',business_roi_analytics:'ROI',business_visitors_analytics:'Visitors',business_promotion_analytics:'Promotions'};
function list(value:any):Row[]{if(Array.isArray(value))return value;if(!value||typeof value!=='object')return[];for(const key of ['rows','items','data','results','locations','detail'])if(Array.isArray(value[key]))return value[key];return[]}
function facts(value:any):[string,string][]{if(!value||typeof value!=='object'||Array.isArray(value))return[];return Object.entries(value).filter(([,v])=>['string','number','boolean'].includes(typeof v)&&v!==null).slice(0,10).map(([k,v])=>[k,String(v)])}
function summarize(row:Row){for(const key of ['name','title','location_name','campaign_name','promotion_name','metric','segment'])if(row[key]!=null&&String(row[key]).trim())return String(row[key]);return'Analytics signal'}
function num(value:any){const n=Number(value);return Number.isFinite(n)?n:null}
function metric(value:any,keys:string[]){for(const row of [value,...list(value)])if(row&&typeof row==='object')for(const key of keys){const n=num(row[key]);if(n!==null)return n}return null}
function total(value:any,keys:string[]){const rows=list(value);let found=false,sum=0;for(const row of rows)for(const key of keys){const n=num(row?.[key]);if(n!==null){sum+=n;found=true;break}}return found?sum:metric(value,keys)}
function series(value:any,keys:string[]){const rows=list(value).slice(-12),values:number[]=[],seriesLabels:string[]=[];for(const row of rows){let v:number|null=null;for(const key of keys){v=num(row?.[key]);if(v!==null)break}if(v===null)continue;values.push(v);seriesLabels.push(String(row.date||row.day||row.period||row.created_at||row.label||values.length))}return{values,labels:seriesLabels}}
function format(value:number|null,kind:'number'|'percent'|'money'='number'){if(value===null)return'—';if(kind==='percent')return(Math.abs(value)<=1?value*100:value).toFixed(1)+'%';if(kind==='money')return'$'+value.toLocaleString(undefined,{maximumFractionDigits:0});return value.toLocaleString(undefined,{maximumFractionDigits:1})}

export default function BusinessAnalyticsDashboard(){
 const[data,setData]=useState<Record<string,any>>({}),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading analytics…');
 async function load(){setBusy(true);try{const id=await currentBusinessId();setData(await getBusinessAnalytics(id));setMessage('')}catch(e:any){setMessage(e?.message||'Analytics unavailable.')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 const sections=useMemo(()=>Object.entries(data||{}),[data]);
 const visitors=total(data.business_visitors_analytics,['visitors','visitor_count','unique_visitors','visits']);
 const qr=total(data.business_qr_detail,['scans','scan_count','redemptions','check_ins','engagements']);
 const reviews=total(data.business_review_detail,['review_count','reviews','count']);
 const roi=metric(data.business_roi_analytics,['roi','roi_pct','return_on_investment']);
 const revenue=total(data.business_roi_analytics,['revenue','attributed_revenue','value']);
 const occupancy=metric(data.business_occupancy_analytics,['occupancy_pct','occupancy','utilization_pct','utilization']);
 const reviewRows=list(data.business_review_detail),positiveReviews=reviewRows.filter(row=>Number(row.rating||row.stars||0)>=4).length;
 const visitorTrend=series(data.business_visitors_analytics,['visitors','visitor_count','unique_visitors','visits']);
 const engagementTrend=visitorTrend.values.length>=2?visitorTrend:series(data.business_engagement_analytics,['engagements','engagement_count','check_ins','visits','interactions']);
 const activityBars=[
  {label:'Visitors',value:visitors??list(data.business_visitors_analytics).length},
  {label:'QR',value:qr??list(data.business_qr_detail).length},
  {label:'Reviews',value:reviews??reviewRows.length},
  {label:'Campaigns',value:total(data.business_campaign_analytics,['engagements','conversions','check_ins','redemptions'])??list(data.business_campaign_analytics).length},
  {label:'Promotions',value:total(data.business_promotion_analytics,['redemptions','engagements','uses'])??list(data.business_promotion_analytics).length},
  {label:'Locations',value:total(data.business_location_analytics,['views','searches','check_ins','visits'])??list(data.business_location_analytics).length},
 ].filter(row=>row.value>0);

 return <ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={busy} onRefresh={load}/>} contentContainerStyle={s.page}>
  <BusinessHero eyebrow="BUSINESS ANALYTICS" title="See what changed, what matters, and where to act." body="A 30-day operating view across visitors, QR, reviews, campaigns, occupancy, ROI, benchmarks and locations—with raw detail still available below."/>
  {message?<Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}
  <View style={s.statGrid}><StatCard label="Visitors" value={format(visitors)} detail="Current analytics window" tone="teal"/><StatCard label="QR activity" value={format(qr)} detail="Scans, redemptions or check-ins" tone="blue"/><StatCard label="Reviews" value={format(reviews??(reviewRows.length||null))} detail="Customer trust signal" tone="gold"/><StatCard label="ROI" value={format(roi,'percent')} detail={revenue!==null?format(revenue,'money')+' attributed value':'Return on investment'} tone="purple"/><StatCard label="Occupancy" value={format(occupancy,'percent')} detail="Utilization signal" tone="coral"/></View>
  <View style={s.chartGrid}>{engagementTrend.values.length>=2?<View style={s.chartCell}><TrendChart title={visitorTrend.values.length>=2?'Visitor trend':'Engagement trend'} subtitle="Latest reported periods" values={engagementTrend.values} labels={engagementTrend.labels}/></View>:null}{activityBars.length?<View style={s.chartCell}><BarChart title="Activity by signal" subtitle="Comparable activity totals where sources expose counts" items={activityBars}/></View>:null}{reviewRows.length?<View style={s.chartCell}><DonutChart title="Positive review share" value={positiveReviews} total={reviewRows.length} label="4–5 star reviews"/></View>:null}</View>
  <View style={s.summaryCard}><SectionHeader title="Analytics coverage" body="Every returned analytics domain remains accessible, even when a source has no current-window activity."/><View style={s.coverageRow}><Text style={s.coverageValue}>{sections.length}</Text><Text style={s.meta}>domains available</Text><Text style={s.coverageValue}>{sections.filter(([,v])=>list(v).length||facts(v).length).length}</Text><Text style={s.meta}>with current data</Text></View></View>
  {sections.map(([key,value])=>{const rows=list(value),summary=facts(value);return <View key={key} style={s.section}><SectionHeader title={labels[key]||key.replaceAll('business_','').replaceAll('_',' ')} body={rows.length?String(rows.length)+' current record'+(rows.length===1?'':'s'):'Current-window summary'}/>{summary.length?<BusinessCard>{summary.map(([label,val])=><Fact key={label} label={label} value={val}/>)}</BusinessCard>:null}{rows.length?rows.slice(0,12).map((row,index)=><BusinessCard key={String(row.id||row.location_id||row.campaign_id||index)}><Text style={s.rowTitle}>{summarize(row)}</Text><View style={s.rowFacts}>{facts(row).slice(0,6).map(([label,val])=><Mini key={label} label={label} value={val}/>)}</View></BusinessCard>):!summary.length?<View style={s.empty}><Text style={s.meta}>No current {String(labels[key]||key).toLowerCase()} signal in this window.</Text></View>:null}</View>})}
 </ScrollView>
}
function Fact({label,value}:{label:string;value:string}){return <View style={s.fact}><Text style={s.factLabel}>{label.replaceAll('_',' ')}</Text><Text style={s.factValue}>{value}</Text></View>}
function Mini({label,value}:{label:string;value:string}){return <View style={s.mini}><Text style={s.miniValue} numberOfLines={1}>{value}</Text><Text style={s.miniLabel} numberOfLines={1}>{label.replaceAll('_',' ')}</Text></View>}
const s=StyleSheet.create({page:{padding:18,gap:15,backgroundColor:businessColors.paper,paddingBottom:70},message:{fontWeight:'700',color:'#596b61'},statGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},chartGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},chartCell:{flexGrow:1,flexBasis:300,minWidth:280},summaryCard:{backgroundColor:'#eef4f0',borderRadius:18,padding:15,gap:10,borderWidth:1,borderColor:businessColors.border},coverageRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',gap:8},coverageValue:{fontSize:24,fontWeight:'900',color:businessColors.green},meta:{fontSize:12,lineHeight:18,color:businessColors.muted},section:{gap:8},fact:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingVertical:5,borderBottomWidth:1,borderBottomColor:'#eef2ef'},factLabel:{fontSize:12,color:businessColors.muted,textTransform:'capitalize'},factValue:{fontSize:12,fontWeight:'900',color:'#21372a',textAlign:'right'},rowTitle:{fontSize:16,fontWeight:'900',color:businessColors.ink},rowFacts:{flexDirection:'row',flexWrap:'wrap',gap:7},mini:{backgroundColor:'#edf3ef',borderRadius:11,padding:9,minWidth:90,maxWidth:'48%',flexGrow:1},miniValue:{fontSize:14,fontWeight:'900',color:businessColors.green},miniLabel:{fontSize:9,fontWeight:'800',color:businessColors.muted,textTransform:'capitalize'},empty:{backgroundColor:'#eef3f0',borderRadius:14,padding:13}});
