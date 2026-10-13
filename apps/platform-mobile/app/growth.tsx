import { ScrollView } from 'react-native';
import { OSHero } from '../components/KleenestOS';
import UserTallyPanel from '../components/UserTallyPanel';
import { usePlatformTheme } from '../services/theme';

export default function UserGrowthWorkspace() {
  const theme = usePlatformTheme();
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 84, backgroundColor: theme.canvas }}>
    <OSHero eyebrow="KLEENESTOS · LIVE ACCOUNT ANALYTICS" title="USER GROWTH WORKSPACE" body="Track who is joining, who is returning, how many accounts are active, and how the community is changing over time." />
    <UserTallyPanel />
  </ScrollView>;
}
