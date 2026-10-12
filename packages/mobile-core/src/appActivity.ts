import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { getKleenestSupabaseClient } from './client';

const guestSession = 'guest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);

/** Foreground usage only. Auth changes refresh the identity; tokens refreshing are not activity. */
export function useAppActivity(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let inFlight = false;
    const client = getKleenestSupabaseClient();
    const visible = () => AppState.currentState === 'active' &&
      (Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible');
    const sync = async () => {
      if (stopped || inFlight || !visible()) return;
      inFlight = true;
      try { await client.rpc('record_app_activity', { p_guest_session: guestSession }); }
      catch { /* Analytics must never block the user's app. */ }
      finally { inFlight = false; }
    };
    void sync();
    const timer = setInterval(() => { void sync(); }, 60_000);
    const state = AppState.addEventListener('change', () => { void sync(); });
    const { data: auth } = client.auth.onAuthStateChange(() => { setTimeout(() => { void sync(); }, 0); });
    const onVisible = () => { void sync(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true; clearInterval(timer); state.remove(); auth.subscription.unsubscribe();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
