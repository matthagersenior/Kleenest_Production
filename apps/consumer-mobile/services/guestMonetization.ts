import { Platform } from 'react-native';
import { getKleenestGuestSessionId, getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { acquisitionSessionKey } from './acquisitionAttribution';

// First-party guest diagnostics are intentionally distinct from verified ad-network
// reporting and billable Kleenest Sponsored events. No GPS, IP or search text.
export type GuestMonetizationEvent =
  | 'sponsored_impression' | 'sponsored_click' | 'sponsored_dismiss'
  | 'network_slot_missing_config' | 'network_request_attempt'
  | 'network_impression' | 'network_no_fill'
  | 'install_upsell_view' | 'install_upsell_click' | 'upgrade_intent';

export function captureGuestMonetizationEvent(
  event: GuestMonetizationEvent,
  placementCode: string | null = null,
  campaignId: string | null = null,
  source: string | null = null,
) {
  void (async () => {
    const visitorKey = await acquisitionSessionKey();
    await getKleenestSupabaseClient().rpc('record_guest_monetization_event', {
      p_session_id: getKleenestGuestSessionId(),
      p_visitor_key: visitorKey,
      p_event_type: event,
      p_placement_code: placementCode,
      p_campaign_id: campaignId,
      p_source: source || Platform.OS,
    });
  })().catch(() => {
    // Diagnostics must never interrupt an ad, a search or navigation.
  });
}
