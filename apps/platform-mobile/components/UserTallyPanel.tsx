import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { AppState, Pressable, Text, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { HealthCard, SectionHeader, useOSCardStyle } from './KleenestOS';
import { usePlatformTheme } from '../services/theme';

type Tally = Record<string, any>;
export default function UserTallyPanel() {
  const theme = usePlatformTheme();
  const card = useOSCardStyle();
  const [data, setData] = useState<Tally | null>(null);
  const [funnel, setFunnel] = useState<Tally | null>(null);
  const [funnelError, setFunnelError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await getKleenestSupabaseClient().rpc('owner_user_tally_snapshot');
      if (result.error) throw result.error;
      if (!result.data || !result.data.updated_at || ['current_accounts','total_signups_recorded','deleted_accounts_recorded','pending_deletion_requests','active_24h','active_7d','active_30d','returning_24h','returning_7d','returning_30d','guest_sessions_24h','guest_sessions_7d','guest_sessions_30d','signups_today','deletions_today','signups_7d','deletions_7d','signups_30d','deletions_30d'].some(key => typeof result.data[key] !== 'number' || !Number.isFinite(result.data[key]))) throw new Error('User tally returned an incomplete snapshot.');
      setData(result.data); setError('');
      // A reporting failure must never hide the authoritative registered-user tally.
      try {
        const snapshot = await getKleenestSupabaseClient().rpc('owner_consumer_signup_funnel', {p_days:7});
        if (snapshot.error) throw snapshot.error;
        if (!snapshot.data?.updated_at) throw new Error('Signup funnel snapshot incomplete.');
        setFunnel(snapshot.data); setFunnelError('');
      } catch (cause: any) {
        setFunnel(null); setFunnelError(cause?.message || 'Signup funnel data unavailable.');
      }
    } catch (cause: any) {
      setData(null); setFunnel(null); setError(cause?.message || 'User tally unavailable.');
    } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [load]);
  const count = (key: string) => typeof data?.[key] === 'number' && Number.isFinite(data[key]) ? data[key].toLocaleString() : 'Unavailable';
  const funnelCount = (key: string) => typeof funnel?.[key] === 'number' && Number.isFinite(funnel[key]) ? funnel[key].toLocaleString() : 'Unavailable';
  const metrics = [
    ['Current accounts', 'current_accounts', 'Registered accounts that still exist'],
    ['Active · 24 hours', 'active_24h', 'Unique accounts using any Kleenest app'],
    ['Active · 7 days', 'active_7d', 'Each account counts once across devices'],
    ['Active · 30 days', 'active_30d', 'Recorded foreground usage, not sign-ins'],
    ['Returning · 24 hours', 'returning_24h', 'Previously registered accounts active in this window'],
    ['Returning · 7 days', 'returning_7d', 'Accounts registered before this 7-day window and active in it'],
    ['Returning · 30 days', 'returning_30d', 'Accounts registered before this 30-day window and active in it'],
    ['Signups recorded', 'total_signups_recorded', 'Existing accounts at baseline + new signups'],
    ['Accounts deleted', 'deleted_accounts_recorded', 'Completed deletions since tracking began'],
    ['Deletion requests', 'pending_deletion_requests', 'Pending requests; not completed deletions'],
    ['Guest sessions · 24 hours', 'guest_sessions_24h', 'Sessions, not unique people or registered users'],
  ];
  return <View style={{ gap: 10 }}>
    <SectionHeader title="People & Growth" body="New and returning users at a glance; full account and usage tally below" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <HealthCard label="Current accounts" value={count('current_accounts')} detail="Registered users still on Kleenest" tone={data ? 'neutral' : 'warning'} />
      <HealthCard label="New users · 7 days" value={count('signups_7d')} detail="New registered accounts this week" tone={data ? 'neutral' : 'warning'} />
      <HealthCard label="Returning users · 7 days" value={count('returning_7d')} detail="Existing users active this week" tone={data ? 'neutral' : 'warning'} />
    </View>
    <SectionHeader title="Signup & Referrals · 7 days" body="Distinct tracked sessions at each step, alongside actual new accounts. A view or install click is not a new user." />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      <HealthCard label="Actual new accounts" value={funnelCount('registered_accounts_created')} detail="Auth accounts created in rolling 7 days" tone={funnel ? 'neutral' : 'warning'} />
      <HealthCard label="Signup screen views" value={funnelCount('signup_views')} detail="Tracked sessions opening the signup form" tone="neutral" />
      <HealthCard label="Email signup submits" value={funnelCount('signup_submissions')} detail="Validated form submissions attempted" tone="neutral" />
      <HealthCard label="Check email to confirm" value={funnelCount('email_confirmation_pending')} detail="Signup flows needing email confirmation" tone="neutral" />
      <HealthCard label="Signup failures" value={funnelCount('signup_errors')} detail="Errors reported by the signup form" tone={funnel?.signup_errors ? 'warning' : 'neutral'} />
      <HealthCard label="Google signup starts" value={funnelCount('google_signup_starts')} detail="OAuth attempts, not verified new accounts" tone="neutral" />
      <HealthCard label="Referral shares" value={funnelCount('sharing_sessions')} detail="Sessions that shared a Kleenest link" tone="neutral" />
      <HealthCard label="Guest entries" value={funnelCount('continue_guest')} detail="Install-center and signup-screen guest actions" tone="neutral" />
      <HealthCard label="Install requests" value={funnelCount('install_intent')} detail="Intent only; not proof of installation" tone="neutral" />
      <HealthCard label="Installed app evidence" value={funnelCount('installed_evidence')} detail="Browser install event or standalone launch" tone="neutral" />
    </View>
    {funnelError ? <Text accessibilityRole="alert" style={{ color: theme.warning }}>{funnelError}</Text> : null}
    <Link href="/guest-insights" asChild><Pressable accessibilityRole="button" style={{...card,gap:4,borderColor:theme.accent}}><Text style={{fontSize:17,fontWeight:'900',color:theme.accent}}>Open Guest Insights →</Text><Text style={{color:theme.muted}}>View anonymous sessions, returning visitor IDs, location selection, navigation, conversion and friction.</Text></Pressable></Link>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void load(); }} style={card}>
      <Text style={{ color: theme.accent, fontWeight: '900' }}>{busy ? 'Refreshing user tally…' : 'Refresh user tally'}</Text>
      <Text style={{ color: theme.muted }}>{data ? `Updated ${new Date(data.updated_at).toLocaleString()} · refreshes every minute` : 'Counts unavailable until a successful refresh'}</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {metrics.map(([label, key, detail]) => <HealthCard key={key} label={label} value={count(key)} detail={detail} tone={data ? 'neutral' : 'warning'} />)}
    </View>
    <View style={{ ...card, gap: 10 }}>
      <Text style={{ color: theme.ink, fontWeight: '900' }}>New users · deleted accounts · net change</Text>
      {['today', '7d', '30d'].map((period, i) => <View key={period} style={{ gap: 3 }}>
        <Text style={{ color: theme.ink, fontWeight: '800' }}>{['Today', 'Last 7 calendar days', 'Last 30 calendar days'][i]}</Text>
        <Text style={{ color: theme.muted }}>{count('signups_' + period)} new · {count('deletions_' + period)} deleted · {data ? (data['signups_' + period] - data['deletions_' + period]).toLocaleString() : 'Unavailable'} net</Text>
      </View>)}
      <Text style={{ color: theme.muted }}>Guest sessions: {count('guest_sessions_7d')} in 7 days · {count('guest_sessions_30d')} in 30 days.</Text>
      <Text style={{ color: theme.muted }}>Calendar totals use Central time. Active and returning users use rolling time windows. Returning means an existing registered account with recorded app activity during that window.</Text>
      <Text style={{ color: theme.muted }}>{data ? `Deletion tracking began ${new Date(data.tracking_since).toLocaleString()}. Earlier deleted accounts are not recoverable from this tally.` : 'Historical deletion coverage unavailable.'}</Text>
    </View>
  </View>;
}
