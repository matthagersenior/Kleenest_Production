import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { blockUser, getBlockState, reportReview, reportUser, unblockUser, type SafetyReportReason } from '../services/safety';
import { palette } from '../components/ConsumerUI';
import { useConsumerTheme } from '../services/theme';

const REASONS:{code:SafetyReportReason;label:string}[] = [{code:'harassment',label:'Harassment or bullying'},{code:'hate',label:'Hate or abusive content'},{code:'sexual',label:'Sexual or inappropriate content'},{code:'spam',label:'Spam or scam'},{code:'privacy',label:'Privacy or impersonation'},{code:'other',label:'Other safety concern'}];

export default function SafetyScreen() {
  const theme=useConsumerTheme();
  const params = useLocalSearchParams<{ userId?: string; reviewId?: string; context?: string; name?: string }>();
  const userId = String(params.userId || '');
  const reviewId = String(params.reviewId || '');
  const targetName = String(params.name || 'this contributor');
  const [reason, setReason] = useState<SafetyReportReason>(REASONS[0].code);
  const [details, setDetails] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!userId) return;
    getBlockState(userId).then(state => { setBlocked(state.blocked); setSignedIn(state.signedIn); }).catch(error => setMessage(error?.message || 'Safety controls could not be loaded.'));
  }, [userId]);

  async function submitReport() {
    if (busy || (!userId && !reviewId)) return;
    setBusy(true); setMessage('');
    try {
      if (reviewId) await reportReview(reviewId, reason, details);
      else await reportUser(userId, reason, details, String(params.context || 'profile'));
      setDetails('');
      setMessage('Report submitted for moderation review. Thank you for helping keep Kleenest safe.');
    } catch (error: any) {
      setMessage(error?.message || 'Report could not be submitted.');
    } finally { setBusy(false); }
  }

  async function toggleBlock() {
    if (busy || !userId) return;
    setBusy(true); setMessage('');
    try {
      if (blocked) { await unblockUser(userId); setBlocked(false); setMessage(`${targetName} is unblocked.`); }
      else { await blockUser(userId); setBlocked(true); setMessage(`${targetName} is blocked. Direct messaging between your accounts is now disabled.`); }
    } catch (error: any) {
      setMessage(error?.message || 'Block setting could not be changed.');
    } finally { setBusy(false); }
  }

  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={[s.eyebrow,{color:theme.accent}]}>SAFETY & MODERATION</Text>
    <Text accessibilityRole="header" style={[s.title,{color:theme.ink}]}>Report a concern</Text>
    <Text style={[s.body,{color:theme.muted}]}>Reports are private and reviewed for violations of Kleenest Community Guidelines. For immediate danger, contact local emergency services.</Text>
    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.cardTitle,{color:theme.ink}]}>What happened?</Text>
      <View style={s.reasons}>{REASONS.map(item => <Pressable accessibilityRole="radio" accessibilityState={{selected: reason === item.code}} key={item.code} onPress={() => setReason(item.code)} style={[s.reason,{backgroundColor:theme.surfaceRaised,borderColor:theme.line},reason === item.code && [s.reasonOn,{backgroundColor:theme.accent,borderColor:theme.accent}]]}><Text style={[s.reasonText,{color:theme.ink},reason === item.code && [s.reasonTextOn,{color:theme.accentText}]]}>{item.label}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="Report details" value={details} onChangeText={setDetails} multiline maxLength={2000} placeholder="Optional details that help our moderation team understand the issue" placeholderTextColor={theme.muted} style={[s.input,s.textarea,{backgroundColor:theme.surfaceRaised,borderColor:theme.line,color:theme.ink}]} />
      <Text style={[s.counter,{color:theme.muted}]}>{details.length}/2000</Text>
      <Pressable accessibilityRole="button" disabled={busy || (!userId && !reviewId)} onPress={submitReport} style={[s.primary,{backgroundColor:theme.accent},busy && s.disabled]}><Text style={[s.primaryText,{color:theme.accentText}]}>{busy ? 'Submitting…' : 'Submit report'}</Text></Pressable>
    </View>
    {userId ? <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.cardTitle,{color:theme.ink}]}>Block {targetName}</Text><Text style={[s.body,{color:theme.muted}]}>Blocking prevents direct messages in either direction. You can reverse this later.</Text>{signedIn ? <Pressable accessibilityRole="button" disabled={busy} onPress={toggleBlock} style={[blocked ? [s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}] : [s.danger,{backgroundColor:theme.danger}], busy && s.disabled]}><Text style={[blocked ? s.secondaryText : s.dangerText,{color:blocked?theme.accent:theme.accentText}]}>{blocked ? 'Unblock contributor' : 'Block contributor'}</Text></Pressable> : <Text style={[s.notice,{color:theme.muted}]}>Sign in to block contributors.</Text>}</View> : null}
    {message ? <View accessibilityRole="alert" style={[s.noticeBox,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}><Text style={[s.notice,{color:theme.ink}]}>{message}</Text></View> : null}
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.secondaryText,{color:theme.accent}]}>Back</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({safe:{flex:1,backgroundColor:palette.canvas},content:{padding:20,paddingBottom:44,gap:12},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.7,color:palette.muted},title:{fontSize:32,lineHeight:36,fontWeight:'900',color:palette.ink},body:{fontSize:14,lineHeight:21,color:palette.muted},card:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dce6df',borderRadius:20,padding:17,gap:10},cardTitle:{fontSize:19,fontWeight:'900',color:palette.ink},reasons:{gap:7},reason:{minHeight:46,justifyContent:'center',paddingHorizontal:13,borderRadius:13,backgroundColor:'#f1f5f2',borderWidth:1,borderColor:'#dce6df'},reasonOn:{backgroundColor:palette.green,borderColor:palette.green},reasonText:{fontWeight:'800',color:'#40584a'},reasonTextOn:{color:'#fff'},input:{borderWidth:1,borderColor:'#ccd9d1',borderRadius:13,padding:12,backgroundColor:'#fbfdfc'},textarea:{minHeight:120,textAlignVertical:'top'},counter:{alignSelf:'flex-end',fontSize:11,fontWeight:'700',color:palette.muted},primary:{minHeight:48,backgroundColor:palette.green,borderRadius:14,alignItems:'center',justifyContent:'center'},primaryText:{color:'#fff',fontWeight:'900'},danger:{minHeight:48,backgroundColor:'#742d25',borderRadius:14,alignItems:'center',justifyContent:'center'},dangerText:{color:'#fff',fontWeight:'900'},secondary:{minHeight:48,backgroundColor:'#edf3ef',borderRadius:14,alignItems:'center',justifyContent:'center',paddingHorizontal:14},secondaryText:{color:palette.green,fontWeight:'900'},disabled:{opacity:.5},noticeBox:{backgroundColor:'#eef4f0',borderRadius:14,padding:13},notice:{fontSize:13,lineHeight:19,fontWeight:'700',color:'#365344'}});
