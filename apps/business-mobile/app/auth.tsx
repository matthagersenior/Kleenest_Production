import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { listBusinessWorkspaceOptions } from '../services/capabilityWorkflows';

const googleRedirect = Linking.createURL('/auth', { scheme: 'kleenest-business' });
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
  return typeof value === 'string' && value.trim() ? value : 'Authentication could not be completed.';
}

async function verifyBusinessAccess() {
  const rows = await listBusinessWorkspaceOptions();
  if (!rows.length) throw new Error('This account is signed in, but no Kleenest Business workspace is assigned yet.');
}

export default function BusinessAuth() {
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
    setBusy(true); setError(null); setNotice(null);
    const client = getKleenestSupabaseClient();
    try {
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      await verifyBusinessAccess();
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
    setBusy(true); setError(null); setNotice(null);
    const client = getKleenestSupabaseClient();
    try {
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      await verifyBusinessAccess();
      router.replace('/');
    } catch (cause) {
      await client.auth.signOut({ scope: 'local' });
      setError(messageOf(cause));
    } finally { setBusy(false); }
  }

  async function signUp() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) return;
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirmPassword) return setError('The passwords do not match.');
    setBusy(true); setError(null); setNotice(null);
    try {
      const { data, error: signupError } = await getKleenestSupabaseClient().auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: googleRedirect },
      });
      if (signupError) throw signupError;
      if (data.session) {
        try { await verifyBusinessAccess(); router.replace('/'); return; }
        catch { await getKleenestSupabaseClient().auth.signOut({ scope: 'local' }); }
      }
      setNotice('Account created. Confirm your email if prompted. A Business workspace must still be assigned or claimed before Business controls unlock.');
      setMode('signin'); setPassword(''); setConfirmPassword('');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function google() {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { data, error: authError } = await getKleenestSupabaseClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: googleRedirect, skipBrowserRedirect: true },
      });
      if (authError) throw authError;
      if (!data.url) throw new Error('Google sign-in did not return an authorization URL.');
      await Linking.openURL(data.url);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  const creating = mode === 'signup';
  const submitDisabled = busy || !email.trim() || !password || (creating && !confirmPassword);
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
    <View style={s.hero}><Text style={s.eyebrow}>KLEENEST BUSINESS</Text><Text style={s.heroTitle}>{creating ? 'Create your account' : 'Welcome back'}</Text><Text style={s.heroBody}>Sign in before entering the Business control center. Workspace roles and capabilities are verified by the server.</Text></View>
    <View style={s.modeRow}><ModeButton label="Sign in" active={!creating} onPress={() => { setMode('signin'); setError(null); setNotice(null); }} /><ModeButton label="Create account" active={creating} onPress={() => { setMode('signup'); setError(null); setNotice(null); }} /></View>
    {error ? <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : null}
    {notice ? <View style={s.notice}><Text style={s.noticeText}>{notice}</Text></View> : null}
    <Pressable disabled={busy} onPress={google} style={s.google}><Text style={s.googleText}>Continue with Google</Text></Pressable>
    <View style={s.divider}><View style={s.line}/><Text style={s.or}>OR</Text><View style={s.line}/></View>
    <View style={s.field}><Text style={s.label}>Email</Text><TextInput accessibilityLabel="Business email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" placeholderTextColor="#78877f" selectionColor="#173f2d" cursorColor="#173f2d" style={s.input}/></View>
    <View style={s.field}><Text style={s.label}>Password</Text><View style={s.passwordRow}><TextInput accessibilityLabel="Business password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={creating ? 'new-password' : 'current-password'} textContentType={creating ? 'newPassword' : 'password'} placeholder={creating ? 'Create a password' : 'Enter your password'} placeholderTextColor="#78877f" selectionColor="#173f2d" cursorColor="#173f2d" style={s.passwordInput}/><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide business password' : 'Show business password'} onPress={() => setShowPassword(v => !v)} style={s.visibility}><Text style={s.visibilityText}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable></View></View>
    {creating ? <View style={s.field}><Text style={s.label}>Confirm password</Text><TextInput accessibilityLabel="Confirm business password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" placeholder="Re-enter password" placeholderTextColor="#78877f" selectionColor="#173f2d" cursorColor="#173f2d" style={s.input}/></View> : null}
    <Pressable disabled={submitDisabled} onPress={creating ? signUp : signIn} style={[s.primary, submitDisabled && s.disabled]}><Text style={s.primaryText}>{busy ? 'Working…' : creating ? 'Create Business account' : 'Sign in to Business'}</Text></Pressable>
  </ScrollView>;
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.modeButton, active && s.modeActive]}><Text style={[s.modeText, active && s.modeTextActive]}>{label}</Text></Pressable>; }

const s = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 14, backgroundColor: '#f3f6f4' }, hero: { backgroundColor: '#173f2d', borderRadius: 24, padding: 20, gap: 7 }, eyebrow: { color: '#bfe0cd', fontWeight: '900', letterSpacing: 1.4, fontSize: 10 }, heroTitle: { color: '#fff', fontSize: 30, fontWeight: '900' }, heroBody: { color: '#dce9e2', lineHeight: 21 }, modeRow: { flexDirection: 'row', gap: 8 }, modeButton: { flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: '#e7eee9', alignItems: 'center' }, modeActive: { backgroundColor: '#173f2d' }, modeText: { fontWeight: '900', color: '#31483c' }, modeTextActive: { color: '#fff' }, error: { color: '#922f2f', fontWeight: '700' }, notice: { backgroundColor: '#e4f3ea', borderRadius: 14, padding: 12 }, noticeText: { color: '#22553a', lineHeight: 20 }, google: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd9d0', padding: 14, borderRadius: 14, alignItems: 'center' }, googleText: { color: '#173f2d', fontWeight: '900' }, divider: { flexDirection: 'row', alignItems: 'center', gap: 10 }, line: { height: 1, flex: 1, backgroundColor: '#d4ddd7' }, or: { color: '#718078', fontWeight: '800', fontSize: 11 }, field: { gap: 6 }, label: { fontWeight: '900', color: '#365245' }, input: { borderWidth: 1, borderColor: '#cbd9d0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: '#fff', color: '#132b21', fontSize: 16 }, passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd9d0', borderRadius: 14, backgroundColor: '#fff', overflow: 'hidden' }, passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, color: '#132b21', fontSize: 16 }, visibility: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 16, borderLeftWidth: 1, borderLeftColor: '#e0e8e3', backgroundColor: '#edf3ef' }, visibilityText: { fontWeight: '900', color: '#173f2d' }, primary: { backgroundColor: '#173f2d', padding: 15, borderRadius: 14, alignItems: 'center' }, primaryText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .45 },
});
