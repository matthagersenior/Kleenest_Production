import { StyleSheet, Text, View } from 'react-native';
import { palette } from './ConsumerUI';

type Row=Record<string,any>;

export function isVerifiedRestroom(item:Row){return Boolean(item?.is_verified||String(item?.verification_status||'').toLowerCase()==='verified');}
export function restroomMarkerGlyph(item:Row){if(Boolean(item?.accessible))return '♿';if(Boolean(item?.changing_table))return '👶';if(isVerifiedRestroom(item))return '✓';const clean=Number(item?.cleanliness_pct);if(Number.isFinite(clean)&&clean>=85)return '✨';return '🚻';}
export function restroomMarkerLabel(item:Row){if(Boolean(item?.accessible))return 'Accessible restroom';if(Boolean(item?.changing_table))return 'Changing table or family feature';if(isVerifiedRestroom(item))return 'Verified restroom';const clean=Number(item?.cleanliness_pct);if(Number.isFinite(clean)&&clean>=85)return 'Highly rated cleanliness';return 'Restroom';}

export function RestroomSignals({item,compact=false}:{item:Row;compact?:boolean}){
 const signals:{icon:string;label:string}[]=[];
 if(isVerifiedRestroom(item))signals.push({icon:'✓',label:'Verified'});
 if(Boolean(item?.accessible))signals.push({icon:'♿',label:'Accessible'});
 if(Boolean(item?.changing_table))signals.push({icon:'👶',label:'Changing table'});
 const clean=Number(item?.cleanliness_pct);if(Number.isFinite(clean))signals.push({icon:'✨',label:`${Math.round(clean)}% clean`});
 const rating=Number(item?.rating);if(Number.isFinite(rating)&&rating>0)signals.push({icon:'★',label:rating.toFixed(1)});
 if(!signals.length)signals.push({icon:'🚻',label:'Restroom'});
 return <View style={styles.row}>{signals.slice(0,compact?4:6).map((signal,index)=><View key={`${signal.label}-${index}`} accessibilityLabel={signal.label} style={[styles.badge,compact&&styles.badgeCompact]}><Text style={styles.icon}>{signal.icon}</Text><Text style={[styles.label,compact&&styles.labelCompact]}>{signal.label}</Text></View>)}</View>;
}

export function MapLegend(){return <View style={styles.legend} accessibilityLabel="Map legend"><Text style={styles.legendTitle}>MAP LEGEND</Text><View style={styles.legendRow}><Legend icon="●" label="You"/><Legend icon="✓" label="Verified"/><Legend icon="♿" label="Accessible"/><Legend icon="👶" label="Family"/><Legend icon="✨" label="Very clean"/><Legend icon="🚻" label="Restroom"/></View></View>}
function Legend({icon,label}:{icon:string;label:string}){return <View style={styles.legendItem}><Text style={styles.legendIcon}>{icon}</Text><Text style={styles.legendLabel}>{label}</Text></View>}

const styles=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8},badge:{flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#eef4f0',borderWidth:1,borderColor:'#d5e2da',borderRadius:999,paddingHorizontal:8,paddingVertical:6},badgeCompact:{paddingHorizontal:7,paddingVertical:5},icon:{fontSize:13},label:{fontSize:9,fontWeight:'900',color:'#3f594b'},labelCompact:{fontSize:8},legend:{backgroundColor:'rgba(255,255,255,.96)',borderWidth:1,borderColor:'#d2dfd7',borderRadius:14,paddingHorizontal:9,paddingVertical:8,maxWidth:260},legendTitle:{fontSize:7,fontWeight:'900',letterSpacing:1,color:palette.green,marginBottom:5},legendRow:{flexDirection:'row',flexWrap:'wrap',gap:6},legendItem:{flexDirection:'row',alignItems:'center',gap:3},legendIcon:{fontSize:10,color:palette.green,fontWeight:'900'},legendLabel:{fontSize:7,fontWeight:'800',color:'#53675a'}});
