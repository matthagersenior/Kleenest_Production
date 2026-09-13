import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { currentFleetBusinessId } from '../services/control';

const operatorOAuthReturnKey='kleenest.operator.oauth.return';
const webSiteOAuthRedirect=Platform.OS==='web'&&typeof window!=='undefined' ? `${window.location.origin}/Kleenest_Production/` : '';
const authRedirect=Platform.OS==='web'&&typeof window!=='undefined' ? `${window.location.origin}/Kleenest_Production/fleet/auth/` : Linking.createURL('auth', { scheme: 'kleenest-fleet', isTripleSlashed: false });
type Mode = 'signin' | 'signup';
function authParam(url: string, key: string) {
  try {
    const parsed = new URL(url);
    const queryValue = parsed.searchParams.get(key);
    if (queryValue) return queryValue;
    return new URLSearchParams(parsed.hash.replace(/^#/, '')).get(key) || '';
  } catch {
    return '';
  }
}

function rememberOperatorOAuthReturn(portal: 'business'|'fleet'|'owner', intent = '') {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.setItem(operatorOAuthReturnKey, JSON.stringify({ portal, intent })); } catch {}
}

function clearOperatorOAuthReturn() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try { window.localStorage.removeItem(operatorOAuthReturnKey); } catch {}
}

function messageOf(value: unknown) {
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'details', 'hint', 'code']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
  }
  return typeof value === 'string' && value.trim() ? value : 'Fleet authentication could not be completed.';
}

async function hasFleetAccess() { try { await currentFleetBusinessId(); return true; } catch { return false; } }

async function openBusinessSetup() {
  if (Platform.OS==='web'&&typeof window!=='undefined') {
    window.location.assign('/Kleenest_Production/business/get-started/?intent=fleet');
    return;
  }
  await Linking.openURL('https://matthagersenior.github.io/Kleenest_Production/business/auth/?mode=signin&intent=fleet');
}

export default function FleetAuth() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function finishGoogle(url: string | null) {
    if (!url) return false;
    const oauthError=authParam(url,'error_description')||authParam(url,'error');
    const code=authParam(url,'code');
    const access_token=authParam(url,'access_token');
    const refresh_token=authParam(url,'refresh_token');
    if(oauthError){clearOperatorOAuthReturn();setError(oauthError);return true;}
    if(!code&&!(access_token&&refresh_token))return false;
    const client = getKleenestSupabaseClient();
    setBusy(true); setError(null); setNotice(null);
    try {
      if(access_token&&refresh_token){
        const {error:sessionError}=await client.auth.setSession({access_token,refresh_token});
        if(sessionError)throw sessionError;
      }else{
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
      }
      clearOperatorOAuthReturn();
      if(Platform.OS==='web'&&typeof window!=='undefined')window.history.replaceState({},'',window.location.pathname);
      if(await hasFleetAccess())router.replace('/');
      else await openBusinessSetup();
      return true;
    } catch (cause) {
      clearOperatorOAuthReturn();
      setError(messageOf(cause));
      return true;
    } finally { setBusy(false); }
  }

  useEffect(() => {
    let active=true;
    const client=getKleenestSupabaseClient();
    void (async()=>{
      const handled=await finishGoogle(await Linking.getInitialURL());
      if(!active||handled)return;
      const {data}=await client.auth.getSession();
      if(!active||!data.session)return;
      if(await hasFleetAccess())router.replace('/');
      else await openBusinessSetup();
    })();
    const sub = Linking.addEventListener('url', event => { void finishGoogle(event.url); });
    return () => { active=false; sub.remove(); };
  }, []);

  async function signIn() {
    if (!email.trim() || !password) return;
    const client = getKleenestSupabaseClient();
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      if(await hasFleetAccess())router.replace('/');
      else await openBusinessSetup();
    } catch (cause) {
      setError(messageOf(cause));
    } finally { setBusy(false); }
  }

  async function signUp() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return;
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirmPassword) return setError('The passwords do not match.');
    const client = getKleenestSupabaseClient();
    setBusy(true); setError(null); setNotice(null);
    try {
      const { data, error: signupError } = await client.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: authRedirect } });
      if (signupError) throw signupError;
      if (data.session) {
        if(await hasFleetAccess())router.replace('/');
        else await openBusinessSetup();
        return;
      }
      setNotice('Account created. Confirm your email if prompted. After sign-in, Kleenest will route you through Business setup and recommend Fleet from your operation profile.');
      setMode('signin'); setPassword(''); setConfirmPassword('');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function google() {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      rememberOperatorOAuthReturn('fleet');
      const { data, error: authError } = await getKleenestSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: Platform.OS==='web'?webSiteOAuthRedirect:authRedirect, skipBrowserRedirect: Platform.OS!=='web' } });
      if (authError) throw authError;
      if (!data.url) throw new Error('Google sign-in did not return an authorization URL.');
      if(Platform.OS==='web'&&typeof window!=='undefined')window.location.assign(data.url);else await Linking.openURL(data.url);
    } catch (cause) { clearOperatorOAuthReturn(); setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  const creating = mode === 'signup';
  const submitDisabled = busy || !email.trim() || !password || (creating && !confirmPassword);
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
    <View style={s.hero}><Text style={s.eyebrow}>KLEENEST FLEET</Text><Text style={s.heroTitle}>{creating ? 'Create your account' : 'Fleet sign in'}</Text><Text style={s.heroBody}>Authenticate before opening route planning, dispatch, Live Network, assets, maintenance and field execution.</Text></View>
    <View style={s.modeRow}><ModeButton label="Sign in" active={!creating} onPress={() => { setMode('signin'); setError(null); setNotice(null); }} /><ModeButton label="Create account" active={creating} onPress={() => { setMode('signup'); setError(null); setNotice(null); }} /></View>
    {error ? <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : null}
    {notice ? <View style={s.notice}><Text style={s.noticeText}>{notice}</Text></View> : null}
    <Pressable disabled={busy} onPress={google} style={s.google}><Text style={s.googleText}>Continue with Google</Text></Pressable>
    <View style={s.divider}><View style={s.line}/><Text style={s.or}>OR</Text><View style={s.line}/></View>
    <View style={s.field}><Text style={s.label}>Fleet email</Text><TextInput accessibilityLabel="Fleet email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor="#78877f" selectionColor="#173f2d" cursorColor="#173f2d" style={s.input}/></View>
    <View style={s.field}><Text style={s.label}>Fleet password</Text><View style={s.passwordRow}><TextInput accessibilityLabel="Fleet password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={creating ? 'new-password' : 'current-password'} textContentType={creating ? 'newPassword' : 'password'} placeholder={creating ? 'Create a password' : 'Enter your password'} placeholderTextColor="#78877f" selectionColor="#173f2d" cursorColor="#173f2d" style={s.passwordInput}/><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide fleet password' : 'Show fleet password'} onPress={() => setShowPassword(v => !v)} style={s.visibility}><Text style={s.visibilityText}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable></View></View>
    {creating ? <View style={s.field}><Text style={s.label}>Confirm password</Text><TextInput accessibilityLabel="Confirm fleet password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" placeholder="Re-enter password" placeholderTextColor="#78877f" selectionColor="#173f2d" cursorColor="#173f2d" style={s.input}/></View> : null}
    <Pressable disabled={submitDisabled} onPress={creating ? signUp : signIn} style={[s.primary, submitDisabled && s.disabled]}><Text style={s.primaryText}>{busy ? 'Working…' : creating ? 'Create Fleet account' : 'Sign in to Fleet'}</Text></Pressable>
  </ScrollView>;
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[s.modeButton, active && s.modeActive]}><Text style={[s.modeText, active && s.modeTextActive]}>{label}</Text></Pressable>; }

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 14, backgroundColor: '#f3f6f4' }, hero: { backgroundColor: '#173f2d', padding: 20, borderRadius: 24, gap: 7 }, eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#bfe0cd' }, heroTitle: { color: '#fff', fontSize: 30, fontWeight: '900' }, heroBody: { color: '#dce9e2', lineHeight: 21 }, modeRow: { flexDirection: 'row', gap: 8 }, modeButton: { flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: '#e7eee9', alignItems: 'center' }, modeActive: { backgroundColor: '#173f2d' }, modeText: { fontWeight: '900', color: '#31483c' }, modeTextActive: { color: '#fff' }, error: { color: '#9b2c2c', fontWeight: '700' }, notice: { backgroundColor: '#e6f3eb', borderRadius: 14, padding: 12 }, noticeText: { color: '#22563c', lineHeight: 20 }, google: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccd9d1', padding: 14, borderRadius: 14, alignItems: 'center' }, googleText: { fontWeight: '900', color: '#173f2d' }, divider: { flexDirection: 'row', alignItems: 'center', gap: 10 }, line: { height: 1, flex: 1, backgroundColor: '#d4ddd7' }, or: { color: '#718078', fontWeight: '800', fontSize: 11 }, field: { gap: 6 }, label: { fontWeight: '900', color: '#365245' }, input: { borderWidth: 1, borderColor: '#ccd9d1', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff', color: '#132b21', fontSize: 16 }, passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccd9d1', borderRadius: 14, backgroundColor: '#fff', overflow: 'hidden' }, passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, color: '#132b21', fontSize: 16 }, visibility: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: '#e0e8e3', backgroundColor: '#edf3ef' }, visibilityText: { fontWeight: '900', color: '#173f2d' }, primary: { backgroundColor: '#173f2d', padding: 15, borderRadius: 14, alignItems: 'center' }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .45 },
});