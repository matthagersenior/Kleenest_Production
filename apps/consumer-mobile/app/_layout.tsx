import * as Notifications from 'expo-notifications';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export default function RootLayout() {
  return <><StatusBar style="auto"/><Tabs screenOptions={{ headerTitle: 'Kleenest', tabBarLabelStyle: { fontWeight: '700' } }}><Tabs.Screen name="index" options={{ title: 'Home' }}/><Tabs.Screen name="explore" options={{ title: 'Explore' }}/><Tabs.Screen name="play" options={{ title: 'Play' }}/><Tabs.Screen name="social" options={{ title: 'Community' }}/><Tabs.Screen name="profile" options={{ title: 'Profile' }}/><Tabs.Screen name="route" options={{ href: null }}/><Tabs.Screen name="location/[id]" options={{ href: null }}/><Tabs.Screen name="contributor/[id]" options={{ href: null }}/><Tabs.Screen name="saved" options={{ href: null }}/><Tabs.Screen name="activity" options={{ href: null }}/><Tabs.Screen name="notifications" options={{ href: null }}/><Tabs.Screen name="membership" options={{ href: null }}/></Tabs></>;
}
