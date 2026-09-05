import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { currentFleetBusinessId } from '../services/control';
import {
  activateEnterpriseCampaign,
  createEnterpriseCampaign,
  createEnterpriseNetwork,
  deleteEnterpriseCampaign,
  deleteEnterpriseNetwork,
  getPartnerAllocationRoi,
  getPartnerNetworkBenchmark,
  inviteEnterprisePartner,
  listEnterpriseNetworkCampaigns,
  listEnterpriseNetworkMembers,
  listEnterprisePartnerBusinesses,
  listOwnedEnterpriseNetworks,
  pauseEnterpriseCampaign,
  setEnterprisePartnerStatus,
  updateEnterpriseNetwork,
} from '../services/enterprise';

const idOf = (value: any) => String(value?.id || value?.membership_id || '');

type NetworkDetails = {
  members: any[];
  campaigns: any[];
  benchmark: any;
  allocation: any;
};

export default function Enterprise() {
  const [businessId, setBusinessId] = useState('');
  const [networks, setNetworks] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [details, setDetails] = useState<Record<string, NetworkDetails>>({});
  const [networkName, setNetworkName] = useState('Kleenest Enterprise Network');
  const [partnerByNetwork, setPartnerByNetwork] = useState<Record<string, string>>({});
  const [campaignNameByNetwork, setCampaignNameByNetwork] = useState<Record<string, string>>({});
  const [campaignGoalByNetwork, setCampaignGoalByNetwork] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading Enterprise Fleet…');

  async function load() {
    setBusy(true);
    try {
      const nextBusinessId = businessId || await currentFleetBusinessId();
      setBusinessId(nextBusinessId);
      const [nextNetworks, nextPartners] = await Promise.all([
        listOwnedEnterpriseNetworks(nextBusinessId),
        listEnterprisePartnerBusinesses(nextBusinessId),
      ]);
      setNetworks(nextNetworks);
      setPartners(nextPartners);
      const detailRows = await Promise.all(nextNetworks.map(async network => {
        const networkId = idOf(network);
        const [members, campaigns, benchmark, allocation] = await Promise.all([
          listEnterpriseNetworkMembers(networkId),
          listEnterpriseNetworkCampaigns(networkId),
          getPartnerNetworkBenchmark(networkId, 30).catch(() => null),
          getPartnerAllocationRoi(networkId, 30).catch(() => null),
        ]);
        return [networkId, { members, campaigns, benchmark, allocation }] as const;
      }));
      setDetails(Object.fromEntries(detailRows));
      setMessage('');
    } catch (error: any) {
      setMessage(error?.message || 'Enterprise entitlement is required for this Fleet workspace.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      setMessage(success);
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'Enterprise action failed.');
    } finally {
      setBusy(false);
    }
  }

  const campaignCount = Object.values(details).reduce((total, item) => total + item.campaigns.length, 0);

  return <ScrollView refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />} contentContainerStyle={s.page}>
    <View style={s.hero}>
      <Text style={s.eyebrow}>ENTERPRISE FLEET OPERATING SYSTEM</Text>
      <Text style={s.title}>Portfolio, partner and campaign control</Text>
      <Text style={s.copy}>Operate Enterprise networks, partner membership, Fleet campaigns, benchmarks and allocation performance from the same canonical business authority.</Text>
    </View>
    {message ? <Text style={s.message}>{message}</Text> : null}
    <View style={s.metrics}>
      <Metric label="Networks" value={networks.length} />
      <Metric label="Partners" value={partners.length} />
      <Metric label="Campaigns" value={campaignCount} />
    </View>

    <View style={s.card}>
      <Text style={s.cardTitle}>Create Enterprise network</Text>
      <TextInput value={networkName} onChangeText={setNetworkName} style={s.input} placeholder="Network name" />
      <Action label="Create network" disabled={busy || !networkName.trim()} onPress={() => run(() => createEnterpriseNetwork(networkName.trim()), 'Enterprise network created.')} />
    </View>

    {networks.map((network, index) => {
      const networkId = idOf(network);
      const networkTitle = String(network.name || `Network ${index + 1}`);
      const enabled = network.enabled !== false;
      const networkDetails = details[networkId] || { members: [], campaigns: [], benchmark: null, allocation: null };
      const partnerId = partnerByNetwork[networkId] || '';
      const campaignName = campaignNameByNetwork[networkId] || 'Fleet partner campaign';
      const campaignGoal = campaignGoalByNetwork[networkId] || 'Improve network service reliability';

      return <View key={networkId || String(index)} style={s.card}>
        <View style={s.spread}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{networkTitle}</Text>
            <Text style={s.meta}>{networkDetails.members.length} members · {networkDetails.campaigns.length} campaigns</Text>
          </View>
          <Text style={s.pill}>{enabled ? 'ENABLED' : 'PAUSED'}</Text>
        </View>

        <View style={s.actions}>
          <Action quiet label={enabled ? 'Disable' : 'Enable'} disabled={busy} onPress={() => run(() => updateEnterpriseNetwork(networkId, networkTitle, !enabled), 'Network state updated.')} />
          <Action danger label="Delete" disabled={busy} onPress={() => run(() => deleteEnterpriseNetwork(networkId), 'Network deleted.')} />
        </View>

        <Text style={s.sub}>Partner membership</Text>
        <TextInput
          value={partnerId}
          onChangeText={value => setPartnerByNetwork(current => ({ ...current, [networkId]: value }))}
          autoCapitalize="none"
          placeholder="Partner Business UUID"
          style={s.input}
        />
        <Action label="Invite partner" disabled={busy || !partnerId.trim()} onPress={() => run(() => inviteEnterprisePartner(networkId, partnerId.trim()), 'Partner invitation sent.')} />

        {networkDetails.members.map((member: any, memberIndex: number) => {
          const membershipId = idOf(member);
          return <View key={membershipId || String(memberIndex)} style={s.inner}>
            <Text style={s.cardTitle}>{String(member.business_name || member.name || 'Partner business')}</Text>
            <Text style={s.meta}>{String(member.status || 'pending')}</Text>
            <View style={s.actions}>
              <Action quiet label="Approve" disabled={busy || !membershipId} onPress={() => run(() => setEnterprisePartnerStatus(membershipId, 'active'), 'Partner approved.')} />
              <Action quiet label="Suspend" disabled={busy || !membershipId} onPress={() => run(() => setEnterprisePartnerStatus(membershipId, 'suspended'), 'Partner suspended.')} />
            </View>
          </View>;
        })}

        <Text style={s.sub}>Campaigns</Text>
        <TextInput
          value={campaignName}
          onChangeText={value => setCampaignNameByNetwork(current => ({ ...current, [networkId]: value }))}
          placeholder="Campaign name"
          style={s.input}
        />
        <TextInput
          value={campaignGoal}
          onChangeText={value => setCampaignGoalByNetwork(current => ({ ...current, [networkId]: value }))}
          placeholder="Campaign goal"
          style={s.input}
        />
        <Action
          label="Create campaign"
          disabled={busy || !campaignName.trim()}
          onPress={() => run(() => createEnterpriseCampaign(networkId, { name: campaignName.trim(), campaignType: 'fleet_partner', goal: campaignGoal.trim() }), 'Enterprise campaign created.')}
        />

        {networkDetails.campaigns.map((campaign: any, campaignIndex: number) => {
          const campaignId = idOf(campaign);
          const status = String(campaign.status || 'draft');
          return <View key={campaignId || String(campaignIndex)} style={s.inner}>
            <Text style={s.cardTitle}>{String(campaign.name || 'Campaign')}</Text>
            <Text style={s.meta}>{status} · {String(campaign.goal || '')}</Text>
            <View style={s.actions}>
              <Action quiet label={status === 'active' ? 'Pause' : 'Activate'} disabled={busy || !campaignId} onPress={() => run(() => status === 'active' ? pauseEnterpriseCampaign(campaignId) : activateEnterpriseCampaign(campaignId), 'Campaign status updated.')} />
              <Action danger label="Delete" disabled={busy || !campaignId} onPress={() => run(() => deleteEnterpriseCampaign(campaignId), 'Campaign deleted.')} />
            </View>
          </View>;
        })}

        <Summary title="30-day network benchmark" value={networkDetails.benchmark} />
        <Summary title="30-day allocation ROI" value={networkDetails.allocation} />
      </View>;
    })}

    <View style={s.card}>
      <Text style={s.cardTitle}>Eligible partner businesses</Text>
      {partners.slice(0, 50).map((partner: any, index: number) => <View key={String(partner.id || partner.business_id || index)} style={s.inner}>
        <Text style={s.cardTitle}>{String(partner.name || partner.business_name || 'Business')}</Text>
        <Text style={s.meta}>{[partner.tier, partner.city, partner.state].filter(Boolean).join(' · ') || 'Enterprise partner candidate'}</Text>
      </View>)}
    </View>
  </ScrollView>;
}

function Summary({ title, value }: { title: string; value: any }) {
  const entries = value && typeof value === 'object'
    ? Object.entries(value).filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry)).slice(0, 5)
    : [];
  return <View style={s.inner}>
    <Text style={s.sub}>{title}</Text>
    <Text style={s.meta}>{entries.length ? entries.map(([key, entry]) => `${key.replaceAll('_', ' ')}: ${String(entry)}`).join(' · ') : 'No current signal'}</Text>
  </View>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.meta}>{label}</Text></View>;
}

function Action({ label, onPress, disabled, quiet = false, danger = false }: { label: string; onPress: () => void | Promise<void>; disabled?: boolean; quiet?: boolean; danger?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[s.action, quiet && s.quiet, danger && s.danger, disabled && { opacity: .45 }]}>
    <Text style={[s.actionText, quiet && { color: '#244d39' }]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  page: { padding: 18, gap: 14, paddingBottom: 70, backgroundColor: '#f3f6f4' },
  hero: { backgroundColor: '#132b21', padding: 18, borderRadius: 22, gap: 6 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: '#bde4cf' },
  title: { fontSize: 27, fontWeight: '900', color: '#fff' },
  copy: { color: '#dce8e1', lineHeight: 20 },
  message: { fontWeight: '800', color: '#6b4d30' },
  metrics: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metric: { minWidth: '30%', flexGrow: 1, backgroundColor: '#fff', padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#dbe5de' },
  metricValue: { fontSize: 23, fontWeight: '900', color: '#173f2d' },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 18, borderWidth: 1, borderColor: '#dbe5de', gap: 9 },
  inner: { backgroundColor: '#f5f8f6', padding: 11, borderRadius: 13, gap: 5 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '900', color: '#102218' },
  sub: { fontSize: 12, fontWeight: '900', color: '#355344', textTransform: 'uppercase' },
  meta: { fontSize: 12, lineHeight: 18, color: '#66766e' },
  pill: { backgroundColor: '#edf3ef', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, fontSize: 10, fontWeight: '900', color: '#28533c' },
  input: { borderWidth: 1, borderColor: '#cbd9d0', borderRadius: 12, padding: 11, backgroundColor: '#fafcfb' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  action: { backgroundColor: '#173f2d', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 999 },
  quiet: { backgroundColor: '#edf3ef' },
  danger: { backgroundColor: '#7b2f2f' },
  actionText: { color: '#fff', fontWeight: '900' },
});
