import fs from 'node:fs';

const failures=[];
const required={
  sql:'supabase/migrations/20261022190000_guest_monetization_funnel.sql',
  event:'apps/consumer-mobile/services/guestMonetization.ts',
  sponsor:'apps/consumer-mobile/services/sponsorship.ts',
  web:'apps/consumer-mobile/components/AdMobNativeSlot.tsx',
  native:'apps/consumer-mobile/components/AdMobNativeSlot.native.tsx',
  install:'apps/consumer-mobile/components/GuestInstallUpsell.tsx',
  explore:'apps/consumer-mobile/features/AdaptiveExploreScreen.tsx',
  membership:'apps/consumer-mobile/app/membership.tsx',
  webCheckout:'apps/consumer-mobile/components/StorePurchaseControls.tsx',
  owner:'apps/platform-mobile/app/guest-insights.tsx',
};
const read=(key)=>{const path=required[key];if(!fs.existsSync(path)){failures.push('Missing '+path);return ''}return fs.readFileSync(path,'utf8')};
const contents=Object.fromEntries(Object.keys(required).map(key=>[key,read(key)]));
function needs(key,...tokens){for(const token of tokens)if(!contents[key].includes(token))failures.push(required[key]+': missing '+token)}
needs('sql','private.guest_monetization_events','enable row level security','to anon,authenticated,service_role','not public.is_platform_owner_session()','owner_guest_monetization_snapshot','30 days','never a billable impression ledger');
needs('event','getKleenestGuestSessionId','acquisitionSessionKey','record_guest_monetization_event');
needs('sponsor','captureGuestMonetizationEvent','data.session.user.is_anonymous','record_sponsored_event');
needs('web','network_slot_missing_config','network_request_attempt','ADSENSE_WEB_DISPLAY_SLOT');
needs('native','network_request_attempt','network_impression','network_no_fill');
needs('install','install_upsell_view','install_upsell_click','upgrade_intent','router.push(\'/install\')');
needs('explore','<GuestInstallUpsell/>');
needs('membership','getMobileAccountSummary().catch(()=>null)');
needs('webCheckout','router.push(\'/install\')','Web browsers and installed PWAs cannot complete this native store purchase');
needs('owner','owner_guest_monetization_snapshot','Guest → Ads → Install → Upgrade','Ad revenue: not connected');
if(/paid|billing/.test(contents.event))failures.push('Guest event service must not claim billable ads');
if(failures.length){console.error('Guest monetization contract audit failed');for(const f of failures)console.error(' - '+f);process.exit(1)}
console.log('Guest monetization funnel contract audit passed.');
