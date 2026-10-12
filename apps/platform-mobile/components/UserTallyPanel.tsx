import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { HealthCard, SectionHeader, useOSCardStyle } from './KleenestOS';
import { usePlatformTheme } from '../services/theme';

type Tally = Record<string, any>;
export default function UserTallyPanel() {
  const theme = usePlatformTheme();
  const card = useOSCardStyle();
  const [data, setData] = useState<Tally | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await getKleenestSupabaseClient().rpc('owner_user_tally_snapshot');
      if (result.error) throw result.error;
      if (!result.data || !result.data.updated_at || ['current_accounts','total_signups_recorded','deleted_accounts_recorded','pending_deletion_requests','active_24h','active_7d','active_30d','guest_sessions_24h','guest_sessions_7d','guest_sessions_30d','signups_today','deletions_today','signups_7d','deletions_7d','signups_30d','deletions_30d'].some(key => typeof result.data[key] !== 'number' || !Number.isFinite(result.data[key]))) throw new Error('User tally returned an incomplete snapshot.');
      setData(result.data); setError('');
    } catch (cause: any) {
      setData(null); setError(cause?.message || 'User tally unavailable.');
    } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [load]);
  const count = (key: string) => typeof data?.[key] === 'number' && Number.isFinite(data[key]) ? data[key].toLocaleString() : 'Unavailable';
  const metrics = [
    ['Current accounts', 'current_accounts', 'Registered accounts that still exist'],
    ['Active · 24 hours', 'active_24h', 'Unique accounts using any Kleenest app'],
    ['Active · 7 days', 'active_7d', 'Each account counts once across devices'],
    ['Active · 30 days', 'active_30d', 'Recorded foreground usage, not sign-ins'],
    ['Signups recorded', 'total_signups_recorded', 'Existing accounts at baseline + new signups'],
    ['Accounts deleted', 'deleted_accounts_recorded', 'Completed deletions since tracking began'],
    ['Deletion requests', 'pending_deletion_requests', 'Pending requests; not completed deletions'],
    ['Guest sessions · 24 hours', 'guest_sessions_24h', 'Sessions, not unique people or registered users'],
  ];
  return <View style={{ gap: 10 }}>
    <SectionHeader title="People & Growth" body="Running account and usage tally" />
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void load(); }} style={card}>
      <Text style={{ color: theme.accent, fontWeight: '900' }}>{busy ? 'Refreshing user tally…' : 'Refresh user tally'}</Text>
      <Text style={{ color: theme.muted }}>{data ? `Updated ${new Date(data.updated_at).toLocaleString()} · refreshes every minute` : 'Counts unavailable until a successful refresh'}</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {metrics.map(([label, key, detail]) => <HealthCard key={key} label={label} value={count(key)} detail={detail} tone={data ? 'neutral' : 'warning'} />)}
    </View>
    <View style={{ ...card, gap: 10 }}>
      <Text style={{ color: theme.ink, fontWeight: '900' }}>Recorded new accounts / deleted / net change</Text>
      {['today', '7d', '30d'].map((period, i) => <View key={period} style={{ gap: 3 }}>
        <Text style={{ color: theme.ink, fontWeight: '800' }}>{['Today', 'Last 7 calendar days', 'Last 30 calendar days'][i]}</Text>
        <Text style={{ color: theme.muted }}>{count('signups_' + period)} new · {count('deletions_' + period)} deleted · {data ? (data['signups_' + period] - data['deletions_' + period]).toLocaleString() : 'Unavailable'} net</Text>
      </View>)}
      <Text style={{ color: theme.muted }}>Guest sessions: {count('guest_sessions_7d')} in 7 days · {count('guest_sessions_30d')} in 30 days.</Text>
      <Text style={{ color: theme.muted }}>Calendar totals use Central time. Active users use rolling time windows. Deleted accounts no longer count as current or active.</Text>
      <Text style={{ color: theme.muted }}>{data ? `Deletion tracking began ${new Date(data.tracking_since).toLocaleString()}. Earlier deleted accounts are not recoverable from this tally.` : 'Historical deletion coverage unavailable.'}</Text>
    </View>
  </View>;
}
