import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>{try{return fs.readFileSync(path.join(root,file),'utf8')}catch{return ''}};
function need(file,...needles){const content=read(file);for(const needle of needles){if(!content.includes(needle)){throw new Error(`${file} missing contract: ${needle}`)}}}

need('supabase/migrations/20260914202500_consumer_week_in_review_and_review_prompts.sql',
  'create or replace function public.my_week_in_review',
  'visit_review_prompt',
  'location_departures_review_prompt',
  'create or replace function internal.enqueue_week_in_review_notifications',
  'weekly_review_digest',
  'location_alerts',
  "'consumer-week-in-review'"
);
need('apps/consumer-mobile/services/weekInReview.ts','my_week_in_review','reviewReady','verificationAvailable');
need('apps/consumer-mobile/app/week-in-review.tsx','YOUR WEEK IN REVIEW','Review this visit','Presence detected');
need('apps/consumer-mobile/services/liveNetwork.ts','GeofencingEventType.Exit','notifyOnExit:true','consumer_presence_heartbeat');
need('apps/consumer-mobile/app/_layout.tsx','name="week-in-review"');
need('src/services/weekInReview.js','my_week_in_review');
need('src/runtime/WeekInReviewPage.jsx','Week in review','Review this visit');
need('src/runtime/App.jsx',"'/week-in-review'",'WrappedWeekInReview');
console.log('consumer week-in-review contract: OK');
