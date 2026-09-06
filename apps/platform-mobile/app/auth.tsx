import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { getOwnerAuthorization } from '../services/ownerAdmin';

const ownerRedirect = Linking.createURL('/auth', { scheme: 'kleenest-owner' });
type Mode = 'signin' | 'signup';

function messageOf(value: unknown) {
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'details', 'hint', 'code']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
  }
  return typeof value === 'string' && value.trim() ? value : 'Owner authentication could not be completed.';
}

async function verifyOwner() {
  const authorization = await getOwnerAuthorization();
  if (!authorization.authorized) throw new Error('This account exists, but it is not authorized for KleenestOS.');
  return authorization;
}

export default function OwnerAuth() {
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
    const parsed = Linking.parse(url);
    const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : '';
    if (!code) return false;
    const client = getKleenestSupabaseClient();
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      await verifyOwner();
      router.replace('/');
      return true;
    } catch (cause) {
      await client.auth.signOut({ scope: 'local' });
      setError(messageOf(cause));
      return false;
    } finally { setBusy(false); }
  }

  useEffect(() => {
    void Linking.getInitialURL().then(finishGoogle);
    const sub = Linking.addEventListener('url', event => { void finishGoogle(event.url); });
    return () => sub.remove();
  }, []);

  async function signIn() {
    if (!email.trim() || !password) return;
    const client = getKleenestSupabaseClient();
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      await verifyOwner();
      router.replace('/');
    } catch (cause) {
      await client.auth.signOut({ scope: 'local' });
      setError(messageOf(cause));
    } finally { setBusy(false); }
  }

  async function signUp() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return;
    if (password.length < 8) return setError('Use at least 8 characters for the owner account password.');
    if (password !== confirmPassword) return setError('The passwords do not match.');
    const client = getKleenestSupabaseClient();
    setBusy(true); setError(null); setNotice(null);
    try {
      const { data, error: signupError } = await client.auth.signUp({ email: cleanEmail, password, options: { emailRedirectTo: ownerRedirect } });
      if (signupError) throw signupError;
      if (data.session) {
        try { await verifyOwner(); router.replace('/'); return; }
        catch { await client.auth.signOut({ scope: 'local' }); }
      }
      setNotice('Account created. Confirm your email if prompted. KleenestOS owner/admin authority is granted separately and is never created by sign-up.');
      setMode('signin'); setPassword(''); setConfirmPassword('');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function google() {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { data, error: authError } = await getKleenestSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: ownerRedirect, skipBrowserRedirect: true } });
      if (authError) throw authError;
      if (!data.url) throw new Error('Google sign-in did not return an authorization URL.');
      await Linking.openURL(data.url);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  const creating = mode === 'signup';
  const submitDisabled = busy || !email.trim() || !password || (creating && !confirmPassword);
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
    <View style={s.hero}><Text style={s.eyebrow}>KLEENESTOS · PRIVATE CONTROL PLANE</Text><Text style={s.heroTitle}>{creating ? 'Create owner identity' : 'Owner sign in'}</Text><Text style={s.heroBody}>Authenticate first. KleenestOS verifies platform-owner or administrator authority before exposing privileged controls.</Text></View>
    <View style={s.modeRow}><ModeButton label="Sign in" active={!creating} onPress={() => { setMode('signin'); setError(null); setNotice(null); }} /><ModeButton label="Create account" active={creating} onPress={() => { setMode('signup'); setError(null); setNotice(null); }} /></View>
    {error ? <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : null}
    {notice ? <View style={s.notice}><Text style={s.noticeText}>{notice}</Text></View> : null}
    <Pressable disabled={busy} onPress={google} style={s.google}><Text style={s.googleText}>Continue with Google</Text></Pressable>
    <View style={s.divider}><View style={s.line}/><Text style={s.or}>OR</Text><View style={s.line}/></View>
    <View style={s.field}><Text style={s.label}>Owner email</Text><TextInput accessibilityLabel="Owner email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="owner@example.com" placeholderTextColor="#7f8d85" selectionColor="#132b21" cursorColor="#132b21" style={s.input}/></View>
    <View style={s.field}><Text style={s.label}>Owner password</Text><View style={s.passwordRow}><TextInput accessibilityLabel="Owner password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={creating ? 'new-password' : 'current-password'} textContentType={creating ? 'newPassword' : 'password'} placeholder={creating ? 'Create a password' : 'Enter owner password'} placeholderTextColor="#7f8d85" selectionColor="#132b21" cursorColor="#132b21" style={s.passwordInput}/><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide owner password' : 'Show owner password'} onPress={() => setShowPassword(v => !v)} style={s.visibility}><Text style={s.visibilityText}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable></View></View>
    {creating ? <View style={s.field}><Text style={s.label}>Confirm password</Text><TextInput accessibilityLabel="Confirm owner password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" placeholder="Re-enter password" placeholderTextColor="#7f8d85" selectionColor="#132b21" cursorColor="#132b21" style={s.input}/></View> : null}
    <Pressable disabled={submitDisabled} onPress={creating ? signUp : signIn} style={[s.primary, submitDisabled && s.disabled]}><Text style={s.primaryText}>{busy ? 'Working…' : creating ? 'Create owner account' : 'Sign in to KleenestOS'}</Text></Pressable>
  </ScrollView>;
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[s.modeButton, active && s.modeActive]}><Text style={[s.modeText, active && s.modeTextActive]}>{label}</Text></Pressable>; }

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 14, backgroundColor: '#f3f6f4' }, hero: { backgroundColor: '#102218', padding: 20, borderRadius: 24, gap: 7 }, eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#b9d2c2' }, heroTitle: { color: '#fff', fontSize: 30, fontWeight: '900' }, heroBody: { color: '#dce9e1', lineHeight: 21 }, modeRow: { flexDirection: 'row', gap: 8 }, modeButton: { flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: '#e7eee9', alignItems: 'center' }, modeActive: { backgroundColor: '#102218' }, modeText: { fontWeight: '900', color: '#31483c' }, modeTextActive: { color: '#fff' }, error: { color: '#9b2c2c', fontWeight: '700' }, notice: { backgroundColor: '#e6f3eb', borderRadius: 14, padding: 12 }, noticeText: { color: '#22563c', lineHeight: 20 }, google: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccd9d1', padding: 14, borderRadius: 14, alignItems: 'center' }, googleText: { fontWeight: '900', color: '#132b21' }, divider: { flexDirection: 'row', alignItems: 'center', gap: 10 }, line: { height: 1, flex: 1, backgroundColor: '#d4ddd7' }, or: { color: '#718078', fontWeight: '800', fontSize: 11 }, field: { gap: 6 }, label: { fontSize: 12, fontWeight: '900', color: '#31483c' }, input: { borderWidth: 1, borderColor: '#ccd9d1', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff', color: '#132b21', fontSize: 16 }, passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccd9d1', borderRadius: 14, backgroundColor: '#fff', overflow: 'hidden' }, passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, color: '#132b21', fontSize: 16 }, visibility: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: '#e0e8e3', backgroundColor: '#eef4f0' }, visibilityText: { fontWeight: '900', color: '#132b21' }, primary: { backgroundColor: '#102218', padding: 15, borderRadius: 14, alignItems: 'center' }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .45 },
});
