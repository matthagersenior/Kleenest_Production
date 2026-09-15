import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function requireText(path,text,label){
  const value=read(path);
  if(!value.includes(text))throw new Error(`${label}: expected ${path} to include ${JSON.stringify(text)}`);
}
function requireFile(path,label){
  if(!fs.existsSync(path))throw new Error(`${label}: missing ${path}`);
}

const migration='supabase/migrations/20260915101500_tell_kleenest_owner_queue_routing.sql';
requireFile(migration,'owner queue migration');
requireText(migration,"owner_queue",'owner queue storage');
requireText(migration,"ux_friction",'UX friction routing');
requireText(migration,"product_gap",'product-gap routing');
requireText(migration,"ideas",'ideas routing');
requireText(migration,"voice_of_customer",'voice-of-customer routing');
requireText(migration,"owner_list_feedback_queue",'owner feedback queue read');
requireText(migration,"owner_feedback_queue_summary",'owner feedback summary');
requireText(migration,"owner_update_feedback_event",'owner feedback lifecycle');
requireText(migration,"owner_queue='incident'",'incident queue separation');

requireText('apps/consumer-mobile/services/betaReporting.ts',"feedback_kind",'feedback fingerprint input');
requireText('apps/consumer-mobile/services/betaReporting.ts',"sentiment",'sentiment fingerprint input');
requireText('apps/consumer-mobile/components/BetaReportButton.tsx',"feedback_kind:'pulse'",'one-tap positive feedback routing');
requireText('apps/consumer-mobile/components/BetaReportButton.tsx',"pulse_only:true",'one-tap positive feedback provenance');

requireText('packages/mobile-core/src/betaReporting.ts',"FeedbackOwnerQueue",'mobile-core queue type');
requireText('packages/mobile-core/src/betaReporting.ts',"listOwnerFeedbackQueue",'mobile-core queue reader');
requireText('packages/mobile-core/src/betaReporting.ts',"getOwnerFeedbackQueueSummary",'mobile-core queue summary');
requireText('packages/mobile-core/src/betaReporting.ts',"updateOwnerFeedbackEvent",'mobile-core feedback lifecycle');

requireFile('apps/platform-mobile/app/feedback-inbox.tsx','KleenestOS feedback inbox');
requireText('apps/platform-mobile/app/feedback-inbox.tsx',"UX FRICTION",'UX queue presentation');
requireText('apps/platform-mobile/app/feedback-inbox.tsx',"PRODUCT GAPS",'product-gap presentation');
requireText('apps/platform-mobile/app/feedback-inbox.tsx',"IDEAS",'ideas presentation');
requireText('apps/platform-mobile/app/feedback-inbox.tsx',"VOICE OF CUSTOMER",'VoC presentation');

requireText('apps/platform-mobile/app/index.tsx',"'/feedback-inbox'",'KleenestOS home route');
requireText('apps/platform-mobile/app/_layout.tsx','name="feedback-inbox"','KleenestOS route registration');

console.log('Tell Kleenest owner queue audit passed: incidents, UX friction, product gaps, ideas, and voice-of-customer are explicitly routed and owner-visible.');
