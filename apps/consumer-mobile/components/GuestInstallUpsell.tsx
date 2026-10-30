import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureAcquisitionEvent } from '../services/acquisitionAttribution';
import { captureGuestMonetizationEvent } from '../services/guestMonetization';
import { requestConsumerInstallPrompt } from '../services/consumerInstallPrompt';
import { useConsumerTheme } from '../services/theme';
import { useConsumerWebExperience } from '../services/webExperience';

const CARD_ID = 'kleenest-guest-install-cta';
const IMPRESSION_KEY = 'kleenest.guest.install-cta-last-visible.v1';
const IMPRESSION_COOLDOWN_MS = 30 * 60 * 1000;
let lastRecordedImpressionAt = 0;

// Old releases counted component mounts even when the card was off screen.
// Record an actual viewable card, at most once per active browser visit.
function recordViewableInstallCard() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const now = Date.now();
  let previous = lastRecordedImpressionAt;
  try {
    const stored = Number(window.localStorage.getItem(IMPRESSION_KEY) || 0);
    if (Number.isFinite(stored)) previous = Math.max(previous, stored);
  } catch { /* Private browsing must not block installations. */ }
  if (previous > 0 && now >= previous && now - previous < IMPRESSION_COOLDOWN_MS) return;
  lastRecordedImpressionAt = now;
  try { window.localStorage.setItem(IMPRESSION_KEY, String(now)); } catch {}
  captureGuestMonetizationEvent('install_upsell_view', null, null, 'explore_results');
}

export function GuestInstallUpsell() {
  const theme = useConsumerTheme();
  const { ready, signedIn } = useConsumerWebExperience();
  const visible = ready && !signedIn;
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined'
      || typeof IntersectionObserver === 'undefined') return;
    let observer: IntersectionObserver | null = null;
    const frame = window.requestAnimationFrame(() => {
      const node = document.getElementById(CARD_ID);
      if (!node) return;
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
          recordViewableInstallCard();
          observer?.disconnect();
        }
      }, { threshold: [0.5] });
      observer.observe(node);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [visible]);
  if (!visible) return null;

  function install() {
    captureGuestMonetizationEvent('install_upsell_click', null, null, 'explore_results');
    captureAcquisitionEvent('install_intent', { metadata: { source: 'explore_results', method: 'install_cta' } });
    // The browser's native prompt must be invoked in direct response to the tap.
    void (async () => {
      const outcome = await requestConsumerInstallPrompt();
      if (outcome === 'accepted' || outcome === 'dismissed') {
        captureAcquisitionEvent(
          outcome === 'accepted' ? 'install_prompt_accepted' : 'install_prompt_dismissed',
          { metadata: { source: 'explore_results', method: 'pwa' } },
        );
      }
      // Accepting a browser prompt is NOT a confirmed install.
      if (outcome !== 'accepted') {
        router.push('/install?utm_source=guest_explore&utm_medium=in_app&utm_campaign=guest_install_cta' as any);
      }
    })();
  }
  function createAccount() {
    // Free registration is not Remove Ads ($5) purchase intent.
    captureAcquisitionEvent('signup_intent', { metadata: { source: 'explore_results', method: 'free_account_cta' } });
    router.push('/signup?mode=signup&returnTo=%2Fexplore' as any);
  }
  return <View nativeID={CARD_ID} style={[styles.card, { backgroundColor: theme.surfaceRaised, borderColor: theme.line }]}>
    <Text style={[styles.title, { color: theme.ink }]}>{Platform.OS === 'web' ? 'Find your next restroom faster.' : 'Remember the places you trust.'}</Text>
    <Text style={[styles.body, { color: theme.muted }]}>{Platform.OS === 'web'
      ? 'Install Kleenest free for one-tap Home Screen access. No account required.'
      : 'Create a free account to keep saved places and routes across visits.'}</Text>
    <View style={styles.actions}>
      {Platform.OS === 'web' ? <Pressable accessibilityRole="button" accessibilityLabel="Install Kleenest free" accessibilityHint="Installs directly when the browser supports it, or opens device-specific instructions" onPress={install} style={[styles.primary, { backgroundColor: theme.accent }]}>
        <Text style={[styles.primaryText, { color: theme.accentText }]}>Install Kleenest free</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Create a free Kleenest account" onPress={createAccount} style={[styles.secondary, { borderColor: theme.line }]}>
        <Text style={[styles.secondaryText, { color: theme.accent }]}>Save places with a free account</Text>
      </Pressable>
    </View>
    <Text style={[styles.note, { color: theme.muted }]}>Keep exploring as a guest anytime.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 13, gap: 9, marginVertical: 8 },
  title: { fontSize: 16, fontWeight: '900' },
  body: { fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { borderRadius: 10, minHeight: 48, paddingHorizontal: 13, paddingVertical: 10, justifyContent: 'center' },
  primaryText: { fontSize: 14, fontWeight: '900' },
  secondary: { borderWidth: 1, borderRadius: 10, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  secondaryText: { fontSize: 12, fontWeight: '800' },
  note: { fontSize: 11, lineHeight: 15 },
});
