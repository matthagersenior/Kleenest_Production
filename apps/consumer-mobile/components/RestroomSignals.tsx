import { Image, StyleSheet, Text, View } from 'react-native';
import { palette } from './ConsumerUI';

type Row=Record<string,any>;
type Signal={icon:string;label:string};

const placeSignals:Record<string,Signal>={
 shopping:{icon:'🛍',label:'Shopping'},
 restaurant:{icon:'🍴',label:'Restaurant'},
 service:{icon:'🏢',label:'Service'},
 park:{icon:'🌳',label:'Park'},
 cafe:{icon:'☕',label:'Cafe'},
 restroom:{icon:'🚻',label:'Public restroom'},
 health:{icon:'🏥',label:'Health'},
 gas_station:{icon:'⛽',label:'Fuel / travel stop'},
 public_safety:{icon:'🛡',label:'Public safety'},
 library:{icon:'📚',label:'Library'},
 library_dropoff:{icon:'📚',label:'Library'},
 dog_park:{icon:'🐾',label:'Dog park'},
 government:{icon:'🏛',label:'Government'},
 brand:{icon:'🏢',label:'Business'},
};
const brandSignals:[RegExp,Signal][]=[
 [/\bstarbucks\b/i,{icon:'☕',label:'Starbucks'}],
 [/\bmcdonald'?s\b/i,{icon:'Ⓜ',label:"McDonald's"}],
 [/\bwalmart\b/i,{icon:'✳',label:'Walmart'}],
 [/\btarget\b/i,{icon:'◎',label:'Target'}],
 [/\bcostco\b/i,{icon:'Ⓒ',label:'Costco'}],
 [/\bwalgreens\b/i,{icon:'ⓦ',label:'Walgreens'}],
 [/\bcvs\b/i,{icon:'✚',label:'CVS'}],
 [/\blove'?s\b/i,{icon:'♥',label:"Love's"}],
 [/\bpilot\b/i,{icon:'Ⓟ',label:'Pilot'}],
 [/\bflying j\b/i,{icon:'Ⓙ',label:'Flying J'}],
 [/\bquiktrip\b|\bqt\b/i,{icon:'Ⓠ',label:'QuikTrip'}],
 [/\bu-?haul\b/i,{icon:'Ⓤ',label:'U-Haul'}],
 [/\bhome depot\b/i,{icon:'Ⓗ',label:'Home Depot'}],
 [/\blowe'?s\b/i,{icon:'Ⓛ',label:"Lowe's"}],
 [/\bkroger\b/i,{icon:'Ⓚ',label:'Kroger'}],
 [/\baldi\b/i,{icon:'Ⓐ',label:'ALDI'}],
 [/\bshell\b/i,{icon:'⛽',label:'Shell'}],
 [/\b(bp|exxon|mobil|chevron|circle k)\b/i,{icon:'⛽',label:'Fuel stop'}],
];

export function isVerifiedRestroom(item:Row){return Boolean(item?.is_verified||String(item?.verification_status||'').toLowerCase()==='verified'||String(item?.bathroom_verification_status||'').toLowerCase()==='verified');}
function identityText(item:Row){return [item?.business_name,item?.business?.name,item?.brand,item?.operator_name,item?.name].filter(Boolean).join(' ');}
export function placeSignal(item:Row):Signal{const identity=identityText(item);for(const [pattern,signal] of brandSignals)if(pattern.test(identity))return signal;return placeSignals[String(item?.place_type||item?.category||'').toLowerCase()]||{icon:'🚻',label:'Restroom location'};}
export function restroomMarkerGlyph(item:Row){return placeSignal(item).icon;}
export function restroomMarkerLabel(item:Row){const place=placeSignal(item);const extras=[isVerifiedRestroom(item)?'verified':null,Boolean(item?.accessible)?'accessible':null,Boolean(item?.changing_table)?'family feature':null].filter(Boolean).join(', ');return extras?`${place.label}, ${extras}`:place.label;}
function explicitBusinessName(item:Row){return String(item?.business_name||item?.business?.name||item?.brand||item?.operator_name||'').trim();}
function initials(name:string){return name.replace(/[^a-z0-9'& -]/gi,' ').trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();}
export function PlaceIcon({item,size=24}:{item:Row;size?:number}){
 const logo=String(item?.business_logo_url||item?.business?.logo_url||'').trim();
 const businessName=explicitBusinessName(item);
 const signal=placeSignal(item);
 if(logo)return <Image accessibilityLabel={`${businessName||item?.name||'Business'} logo`} source={{uri:logo}} resizeMode="contain" style={{width:size,height:size,borderRadius:Math.max(4,size*.2)}}/>;
 if(businessName)return <View accessibilityLabel={`${businessName} business icon`} style={{width:size,height:size,borderRadius:Math.max(6,size*.24),backgroundColor:palette.green,borderWidth:1,borderColor:'#fff',alignItems:'center',justifyContent:'center'}}><Text adjustsFontSizeToFit numberOfLines={1} style={{color:'#fff',fontWeight:'900',letterSpacing:-.4,fontSize:Math.max(8,size*.38)}}>{initials(businessName)}</Text></View>;
 return <Text accessibilityLabel={signal.label} style={{fontSize:size*.82}}>{signal.icon}</Text>;
}

export function RestroomSignals({item,compact=false}:{item:Row;compact?:boolean}){
 const signals:Signal[]=[];
 const place=placeSignal(item);signals.push(place);
 if(isVerifiedRestroom(item))signals.push({icon:'✓',label:'Verified'});
 if(Boolean(item?.accessible))signals.push({icon:'♿',label:'Accessible'});
 if(Boolean(item?.changing_table))signals.push({icon:'👶',label:'Changing table'});
 if(Boolean(item?.smart_bathroom))signals.push({icon:'◉',label:'Smart bathroom'});
 const clean=Number(item?.cleanliness_pct);if(Number.isFinite(clean))signals.push({icon:'✨',label:`${Math.round(clean)}% clean`});
 const rating=Number(item?.rating);if(Number.isFinite(rating)&&rating>0)signals.push({icon:'★',label:rating.toFixed(1)});
 return <View style={styles.row}>{signals.slice(0,compact?5:7).map((signal,index)=><View key={`${signal.label}-${index}`} accessibilityLabel={signal.label} style={[styles.badge,compact&&styles.badgeCompact]}><Text style={styles.icon}>{signal.icon}</Text><Text style={[styles.label,compact&&styles.labelCompact]}>{signal.label}</Text></View>)}</View>;
}

export function MapLegend(){return <View style={styles.legend} accessibilityLabel="Map legend"><Text style={styles.legendTitle}>MAP LEGEND</Text><View style={styles.legendRow}><Legend icon="●" label="You"/><Legend icon="▣" label="Business"/><Legend icon="🍴" label="Food"/><Legend icon="☕" label="Cafe"/><Legend icon="⛽" label="Travel"/><Legend icon="🛍" label="Shopping"/><Legend icon="🌳" label="Park"/><Legend icon="🚻" label="Restroom"/><Legend icon="✓" label="Verified"/><Legend icon="♿" label="Accessible"/><Legend icon="👶" label="Family"/></View></View>}
function Legend({icon,label}:{icon:string;label:string}){return <View style={styles.legendItem}><Text style={styles.legendIcon}>{icon}</Text><Text style={styles.legendLabel}>{label}</Text></View>}

const styles=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},badge:{flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#eef4f0',borderWidth:1,borderColor:'#d5e2da',borderRadius:999,paddingHorizontal:8,paddingVertical:6},badgeCompact:{paddingHorizontal:7,paddingVertical:5},icon:{fontSize:13},label:{fontSize:9,fontWeight:'900',color:'#3f594b'},labelCompact:{fontSize:8},legend:{backgroundColor:'rgba(255,255,255,.96)',borderWidth:1,borderColor:'#d2dfd7',borderRadius:14,paddingHorizontal:9,paddingVertical:8,maxWidth:280},legendTitle:{fontSize:7,fontWeight:'900',letterSpacing:1,color:palette.green,marginBottom:5},legendRow:{flexDirection:'row',flexWrap:'wrap',gap:6},legendItem:{flexDirection:'row',alignItems:'center',gap:3},legendIcon:{fontSize:10,color:palette.green,fontWeight:'900'},legendLabel:{fontSize:7,fontWeight:'800',color:'#53675a'}});
