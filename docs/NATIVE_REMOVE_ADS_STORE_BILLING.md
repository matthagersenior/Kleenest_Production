# Native Remove Ads store billing

Kleenest Consumer uses a single lifetime non-consumable product for Remove Ads:

- Store product ID: `kleenest_remove_ads_lifetime`
- Price: $5 one-time
- Android checkout owner: Google Play
- iOS checkout owner: Apple App Store
- Entitlement: Consumer Premium / network ad suppression
- Scope: network ads only. Kleenest Sponsored recommendations remain visible and never change trust, freshness, verification, or organic ranking.

## User flow

The user opens **Profile → Membership**. The Premium card shows **Buy for $5** and **Restore purchase**. Google Play or Apple presents the native purchase sheet. Kleenest does not grant Premium from the client callback alone: the app sends the store transaction to the authenticated `verify-mobile-store-purchase` Edge Function. The server verifies it with Google Play Developer API or Apple App Store Server API, then records the transaction and grants the lifetime Premium entitlement. Only after server verification does the client finish/acknowledge the transaction.

A reinstall or device change uses **Restore purchase**. The store returns the owned non-consumable, Kleenest verifies it again, and the entitlement grant is idempotent.

## Store setup required before live checkout

Create a non-consumable product with the exact ID `kleenest_remove_ads_lifetime` in both Google Play Console and App Store Connect and set the consumer price to $5 in the intended storefronts. Store testing must use Google Play license testing / a Play test track on Android and StoreKit sandbox/TestFlight on iOS.

The verification Edge Function reads one grouped secret named `KLEENEST_IAP_CREDENTIALS_JSON`. Keep it only in Supabase Edge Function secrets; never place it in the app or repository.

Example shape:

```json
{
  "product_id": "kleenest_remove_ads_lifetime",
  "apple": {
    "issuer_id": "...",
    "key_id": "...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "bundle_id": "com.kleenest.app"
  },
  "google": {
    "client_email": "...@....iam.gserviceaccount.com",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "token_uri": "https://oauth2.googleapis.com/token",
    "package_name": "com.kleenest.app"
  }
}
```

The Google service account must have Play Console access sufficient to verify purchases. The Apple key must be authorized for App Store Server API transaction lookup.
