import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePlatformTheme } from '../services/theme';
import {
  classifyOwnerLocationDuplicate, getOwnerDuplicateCounts, listOwnerLocationDuplicates,
  type DuplicateCase, type DuplicateLocation, type DuplicateStatus,
} from '../services/locationDedup';

const statuses: {key: DuplicateStatus;label: string}[] = [
  {key:'pending',label:'Review'},
  {key:'needs_geocoding',label:'Coordinates'},
  {key:'confirmed',label:'Confirmed'},
  {key:'co_located',label:'Shared building'},
  {key:'different_businesses',label:'Distinct'},
  {key:'resolved',label:'Resolved'},
];

function distance(value: number | null) {
  if(value === null || value === undefined) return 'Distance unknown';
  return value < 1000 ? `${Math.round(value)} m apart` : `${(value/1000).toFixed(1)} km apart`;
}

function locationLabel(location?: DuplicateLocation) {
  if(!location) return 'Unavailable location';
  return [location.address, location.city, location.state].filter(Boolean).join(', ') || 'No street address';
}

export default function LocationDuplicates() {
  const theme = usePlatformTheme();
  const [status, setStatus] = useState<DuplicateStatus>('pending');
  const [counts, setCounts] = useState<Partial<Record<DuplicateStatus,number>>>({});
  const [rows, setRows] = useState<DuplicateCase[]>([]);
  const [notes, setNotes] = useState<Record<number,string>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<number|null>(null);
  const [error, setError] = useState('');
  async function load(next: DuplicateStatus = status) {
    setBusy(true); setError('');
    try {
      const [cases, nextCounts] = await Promise.all([
        listOwnerLocationDuplicates(next), getOwnerDuplicateCounts(),
      ]);
      setRows(cases); setCounts(nextCounts);
    } catch(e:unknown) {
      setError(e instanceof Error ? e.message : 'Unable to load duplicate review queue');
      setRows([]);
    } finally { setBusy(false); }
  }
  useEffect(() => { void load(status); }, [status]);

  async function classify(item: DuplicateCase, next: DuplicateStatus) {
    setSaving(item.id);setError('');
    try {
      await classifyOwnerLocationDuplicate(item.id,next,notes[item.id] ?? item.review_notes ?? '');
      await load(status);
    } catch(e:unknown) {
      setError(e instanceof Error ? e.message : 'Unable to save review decision');
    } finally { setSaving(null); }
  }

  function LocationCard({record,label}:{record?:DuplicateLocation;label:string}) {
    return <View style={[s.location,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.muted}]}>{label}</Text>
      <Text style={[s.name,{color:theme.ink}]}>{record?.name ?? 'Location not found'}</Text>
      <Text style={[s.detail,{color:theme.muted}]}>{locationLabel(record)}</Text>
      <Text style={[s.detail,{color:theme.muted}]}>{record?.source_dataset ?? 'Unknown source'} · {record?.source_external_id ?? 'No source ID'}</Text>
      {record?.latitude !== null && record?.latitude !== undefined
        ? <Text style={[s.detail,{color:theme.muted}]}>{Number(record.latitude).toFixed(5)}, {Number(record.longitude).toFixed(5)}</Text>
        : null}
      {record?.is_active === false ? <Text style={[s.detail,{color:theme.success}]}>Archived canonical alias</Text> : null}
    </View>;
  }

  return <ScrollView style={{backgroundColor:theme.canvas}}
    refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void load(status)}/>}
    contentContainerStyle={s.page}>
    <View style={[s.hero,{backgroundColor:theme.accent}]}>
      <Text style={[s.kicker,{color:theme.accentText}]}>KLEENESTOS · DATA INTEGRITY</Text>
      <Text style={[s.heading,{color:theme.accentText}]}>Location duplicate review</Text>
      <Text style={[s.heroText,{color:theme.accentText}]}>Compare canonical records, investigate conflicting map coordinates, and classify shared-building tenants without deleting businesses.</Text>
    </View>
    <View style={s.filters}>{statuses.map(item=>
      <Pressable key={item.key} accessibilityRole="button" onPress={()=>setStatus(item.key)}
        style={[s.tab,{backgroundColor:item.key===status?theme.accent:theme.surface,borderColor:item.key===status?theme.accent:theme.line}]}>
        <Text style={{color:item.key===status?theme.accentText:theme.ink,fontWeight:'800',fontSize:12}}>{item.label} ({counts[item.key] ?? '…'})</Text>
      </Pressable>)}</View>
    <Text style={[s.note,{color:theme.muted}]}>Matching names or coordinates are evidence, not proof. Marking “Confirmed” does not merge or delete anything. Shared-building businesses remain distinct.</Text>
    {error ? <Text style={{color:theme.danger,fontWeight:'700'}}>{error}</Text> : null}
    {busy && !rows.length ? <ActivityIndicator/> : null}
    {rows.map(item=><View key={item.id} style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.rule,{color:theme.ink}]}>{item.rule.replaceAll('_',' ')} · {distance(item.distance_m)}</Text>
      <Text style={[s.note,{color:theme.muted}]}>Match confidence: {Math.round(Number(item.confidence)*100)}% · Case #{item.id}</Text>
      <LocationCard label="RECORD A" record={item.first}/>
      <LocationCard label="RECORD B" record={item.second}/>
      <TextInput
        accessibilityLabel={`Review notes for case ${item.id}`}
        placeholder="Evidence / reasoning (optional)"
        placeholderTextColor={theme.muted}
        multiline
        value={notes[item.id] ?? item.review_notes ?? ''}
        onChangeText={value=>setNotes(current=>({...current,[item.id]:value}))}
        style={[s.input,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]}/>
      <View style={s.actions}>
        {([
          ['confirmed','Same business'],
          ['different_businesses','Different businesses'],
          ['co_located','Same building, separate'],
          ['needs_geocoding','Wrong coordinates'],
          ['resolved','Close case'],
        ] as [DuplicateStatus,string][]).filter(([target])=>target!==item.status).map(([target,label])=>
          <Pressable key={target} accessibilityRole="button" disabled={saving!==null||busy}
            onPress={()=>void classify(item,target)}
            style={[s.action,{borderColor:theme.line,backgroundColor:theme.surfaceRaised,opacity:saving !== null ? 0.5 : 1}]}>
            <Text style={{color:theme.ink,fontWeight:'800',fontSize:12}}>{label}</Text>
          </Pressable>)}
      </View>
    </View>)}
    {!busy&&!rows.length&&!error ? <Text style={[s.note,{color:theme.muted}]}>No cases in this category.</Text> : null}
    {rows.length >= 80 ? <Text style={[s.note,{color:theme.muted}]}>Showing the first 80 cases, highest confidence first. Classify cases to advance the queue.</Text> : null}
  </ScrollView>;
}
const s=StyleSheet.create({
  page:{padding:16,paddingBottom:80,gap:14},
  hero:{padding:18,borderRadius:20,gap:7},
  kicker:{fontSize:10,fontWeight:'900',letterSpacing:1},
  heading:{fontSize:26,fontWeight:'900'},
  heroText:{fontSize:13,lineHeight:20},
  filters:{flexDirection:'row',flexWrap:'wrap',gap:7},
  tab:{paddingHorizontal:10,paddingVertical:8,borderRadius:999,borderWidth:1},
  note:{fontSize:12,lineHeight:18},
  card:{borderWidth:1,borderRadius:16,padding:14,gap:9},
  rule:{fontSize:15,fontWeight:'900',textTransform:'capitalize'},
  location:{borderWidth:1,borderRadius:12,padding:12,gap:4},
  name:{fontSize:15,fontWeight:'800'},
  detail:{fontSize:12,lineHeight:17},
  input:{borderWidth:1,borderRadius:10,minHeight:54,padding:10,fontSize:13,textAlignVertical:'top'},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  action:{paddingHorizontal:10,paddingVertical:8,borderRadius:10,borderWidth:1}
});
