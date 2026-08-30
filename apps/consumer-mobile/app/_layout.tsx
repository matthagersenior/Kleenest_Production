import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return <><StatusBar style="auto"/><Tabs screenOptions={{ headerTitle: 'Kleenest', tabBarLabelStyle: { fontWeight: '700' } }}><Tabs.Screen name="index" options={{ title: 'Home' }}/><Tabs.Screen name="explore" options={{ title: 'Explore' }}/><Tabs.Screen name="route" options={{ title: 'Route' }}/><Tabs.Screen name="profile" options={{ title: 'Profile' }}/><Tabs.Screen name="location" options={{ href: null }}/><Tabs.Screen name="saved" options={{ href: null }}/><Tabs.Screen name="activity" options={{ href: null }}/><Tabs.Screen name="notifications" options={{ href: null }}/><Tabs.Screen name="social" options={{ href: null }}/><Tabs.Screen name="membership" options={{ href: null }}/></Tabs></>;
}
