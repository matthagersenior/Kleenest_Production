import * as Notifications from 'expo-notifications';
import { markMobileNotificationRead } from '@kleenest/mobile-core';
import { router, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { notificationDestination } from '../services/notificationRouting';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

async function openNotificationResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const data = response.notification.request.content.data || {};
  const notificationId = typeof data.notification_id === 'string' ? data.notification_id : '';
  if (notificationId) await markMobileNotificationRead(notificationId).catch(() => {});
  const destination = notificationDestination({ type: typeof data.type === 'string' ? data.type : null, data });
  if (destination) router.push(destination as any);
}

export default function RootLayout() {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(response => void openNotificationResponse(response)).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(response => { void openNotificationResponse(response); });
    return () => subscription.remove();
  }, []);
  return <><StatusBar style="auto"/><Tabs screenOptions={{ headerTitle: 'Kleenest', tabBarLabelStyle: { fontWeight: '700' } }}><Tabs.Screen name="index" options={{ title: 'Home' }}/><Tabs.Screen name="explore" options={{ title: 'Explore' }}/><Tabs.Screen name="play" options={{ title: 'Play' }}/><Tabs.Screen name="social" options={{ title: 'Community' }}/><Tabs.Screen name="profile" options={{ title: 'Profile' }}/><Tabs.Screen name="games" options={{ href: null }}/><Tabs.Screen name="route" options={{ href: null }}/><Tabs.Screen name="location/[id]" options={{ href: null }}/><Tabs.Screen name="contributor/[id]" options={{ href: null }}/><Tabs.Screen name="saved" options={{ href: null }}/><Tabs.Screen name="activity" options={{ href: null }}/><Tabs.Screen name="notifications" options={{ href: null }}/><Tabs.Screen name="membership" options={{ href: null }}/></Tabs></>;
}
