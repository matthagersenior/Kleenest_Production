import { Link,router } from 'expo-router';
import { useEffect,useState } from 'react';
import { ActivityIndicator,Pressable,ScrollView,Text,View } from 'react-native';
import { acceptCurrentPolicies,getCurrentPolicyVersions,hasCurrentPolicyAcceptance } from '../services/safety';

const terms=[
  'Use Kleenest lawfully and provide truthful information. Do not manipulate ratings, rewards, check-ins, QR codes, location data, businesses, or other users.',
  'Community content must follow the Community Guidelines. Kleenest may remove content, limit features, suspend accounts, or preserve evidence when needed for safety, integrity, legal compliance, or abuse prevention.',
  'Location, cleanliness, amenity, accessibility, routing, AI, and community information can change. Verify critical conditions yourself and do not treat Kleenest as an emergency service.',
  'Rewards, XP, contests, campaigns, quests, missions, challenges, and other progression features may have eligibility, fraud-prevention, geographic, time, inventory, and account-standing requirements.',
];
const community=[
  'No harassment, threats, hate, sexual exploitation, impersonation, scams, spam, doxxing, privacy violations, or instructions intended to cause harm.',
  'Reviews and reports must reflect genuine experiences. Do not fabricate visits, coordinate manipulation, retaliate against reviewers, or trade incentives for deceptive content.',
  'Use Report for unsafe, abusive, deceptive, or inappropriate content and Block when you do not want interaction with another contributor.',
  'Moderation decisions may consider reports, account history, verification evidence, automated abuse signals, appeals, and applicable law.',
];
const privacy=[
  'Kleenest processes account, profile, device, app-use, location, check-in, review, social, notification, QR, progression, support, safety, and diagnostic data as needed for the features you use.',
  'Precise/background location is used only for location-enabled features such as nearby discovery, verified arrival/check-in, Live Network, geofencing, routing, and related notifications when permission is granted.',
  'Public contributions such as reviews and profile information you choose to publish can be visible to other users. Safety reports and moderation evidence are restricted to authorized workflows.',
  'You can request account deletion in Account control. Deletion may retain limited records when required for security, fraud prevention, dispute resolution, legal obligations, or de-identification integrity.',
];
function Section({title,items}:{title:string;items:string[]}){return <View style={card}><Text style={heading}>{title}</Text>{items.map((item,index)=><Text key={index} style={body}>• {item}</Text>)}</View>}
export default function LegalCenter(){
  const[loading,setLoading]=useState(true),[accepted,setAccepted]=useState(false),[versions,setVersions]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  useEffect(()=>{Promise.all([hasCurrentPolicyAcceptance(),getCurrentPolicyVersions()]).then(([ok,v])=>{setAccepted(ok);setVersions(v as Record<string,string>)}).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>setLoading(false))},[]);
  async function accept(){setBusy(true);setError(null);try{await acceptCurrentPolicies();setAccepted(true);router.back()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  if(loading)return <View style={center}><ActivityIndicator size="large"/></View>;
  return <ScrollView contentContainerStyle={page}>
    <View style={hero}><Text style={eyebrow}>SAFETY + LEGAL</Text><Text style={title}>Kleenest policies</Text><Text style={heroBody}>These policies protect the trust network, contributors, businesses, and location data that Kleenest depends on.</Text></View>
    {error?<View style={errorCard}><Text style={errorText}>{error}</Text></View>:null}
    <View style={card}><Text style={heading}>Current versions</Text><Text style={body}>Terms: {versions.terms||'current'} · Community: {versions.community||'current'} · Privacy: {versions.privacy||'current'}</Text><Text style={[body,{fontWeight:'800'}]}>{accepted?'Accepted for this account':'Acceptance required before posting user-generated content or sending messages.'}</Text></View>
    <Section title="Terms of Use" items={terms}/><Section title="Community Guidelines" items={community}/><Section title="Privacy" items={privacy}/>
    <View style={card}><Text style={heading}>Your controls</Text><Text style={body}>Report unsafe content or contributors from their content/profile. Blocked contributors cannot continue direct interaction with you. You can manage blocked users and account deletion from Profile.</Text><Link href="/blocked-users" asChild><Pressable style={secondary}><Text style={secondaryText}>Manage blocked users</Text></Pressable></Link><Link href="/account-deletion" asChild><Pressable style={secondary}><Text style={secondaryText}>Account deletion</Text></Pressable></Link></View>
    {!accepted?<Pressable disabled={busy} onPress={accept} style={[primary,busy&&{opacity:.55}]} accessibilityRole="button"><Text style={primaryText}>{busy?'Saving…':'Accept Terms + Community Guidelines'}</Text></Pressable>:null}
    <Text style={foot}>By accepting, you confirm that you have reviewed the current Terms of Use and Community Guidelines and acknowledge the Privacy information shown here. Policy changes that require renewed consent will require acceptance again.</Text>
  </ScrollView>
}
const page={padding:16,paddingBottom:80,gap:14,backgroundColor:'#f3f6f4' as const},center={flex:1,justifyContent:'center' as const},hero={backgroundColor:'#173f2d' as const,borderRadius:22,padding:18,gap:7},eyebrow={color:'#bfe0cd' as const,fontWeight:'900' as const,letterSpacing:1.1},title={fontSize:28,fontWeight:'900' as const,color:'white' as const},heroBody={color:'#e1eee6' as const,lineHeight:20},card={backgroundColor:'white' as const,borderRadius:18,padding:16,gap:9},heading={fontSize:19,fontWeight:'900' as const,color:'#173024' as const},body={color:'#42564a' as const,lineHeight:20},primary={backgroundColor:'#173f2d' as const,borderRadius:14,padding:15,alignItems:'center' as const},primaryText={color:'white' as const,fontWeight:'900' as const},secondary={alignSelf:'flex-start' as const,backgroundColor:'#edf3ef' as const,borderRadius:999,paddingHorizontal:14,paddingVertical:10},secondaryText={color:'#244d39' as const,fontWeight:'900' as const},foot={fontSize:12,color:'#6b7a72' as const,lineHeight:18},errorCard={backgroundColor:'#fae7e7' as const,borderRadius:14,padding:12},errorText={color:'#8f2f2f' as const,fontWeight:'800' as const};