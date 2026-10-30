import { Platform } from 'react-native';

type BrowserChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
type DeferredInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BrowserChoice>;
};
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'error';
let pendingPrompt: DeferredInstallEvent | null = null;
const observers = new Set<(available: boolean) => void>();
function notify() { for (const listener of observers) listener(Boolean(pendingPrompt)); }

// Installed by the root layout, not only the installation route: beforeinstallprompt
// can occur well before visitors reach /install.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    pendingPrompt = event as DeferredInstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    pendingPrompt = null;
    notify();
  });
}
export function hasPendingConsumerInstallPrompt() { return Boolean(pendingPrompt); }
export function subscribeConsumerInstallPrompt(listener: (available: boolean) => void) {
  observers.add(listener);
  listener(Boolean(pendingPrompt));
  return () => { observers.delete(listener); };
}
export async function requestConsumerInstallPrompt(): Promise<InstallOutcome> {
  const active = pendingPrompt;
  if (!active) return 'unavailable';
  pendingPrompt = null; // Browser prompt events may only be used once.
  notify();
  try {
    await active.prompt();
    const choice = await active.userChoice;
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'error';
  }
}
