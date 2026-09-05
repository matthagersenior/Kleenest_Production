import fs from 'node:fs';

const failures=[];
const componentPath='apps/consumer-mobile/components/ReviewReportAction.tsx';
const screenPath='apps/consumer-mobile/app/location/[id].tsx';

for(const file of[componentPath,screenPath])if(!fs.existsSync(file))failures.push(`missing review-reporting file: ${file}`);
if(fs.existsSync('scripts/apply-consumer-review-reporting.mjs'))failures.push('install-time review-reporting source patch must not return; canonical behavior belongs in tracked source');
if(fs.existsSync('scripts/apply-consumer-review-score-guidance.mjs'))failures.push('install-time review-score source patch must not return; canonical behavior belongs in tracked source');

if(!failures.length){
  const component=fs.readFileSync(componentPath,'utf8');
  const screen=fs.readFileSync(screenPath,'utf8');

  for(const token of[
    'type SafetyReportReason',
    "value: 'unsafe'",
    "value: 'harassment'",
    "value: 'hate'",
    "value: 'sexual'",
    "value: 'privacy'",
    "value: 'spam'",
    "value: 'inaccurate'",
    "value: 'other'",
    'maxLength={1000}',
    'await reportReview(reviewId, reason, details)',
    'REVIEW_ALREADY_REPORTED_BY_USER',
    'accessibilityRole="radio"',
    'accessibilityLabel="Submit review report"',
  ])if(!component.includes(token))failures.push(`ReviewReportAction missing ${token}`);

  for(const token of[
    "import ReviewReportAction from '../../components/ReviewReportAction';",
    '<ReviewReportAction reviewId={String(item.id)}',
    'Review reported for moderation. Thank you for helping keep Kleenest trustworthy.',
  ])if(!screen.includes(token))failures.push(`Consumer location review reporting missing ${token}`);

  for(const forbidden of[
    "reportReview(reviewId,'other'",
    'onPress={()=>report(String(item.id))}',
    "import { reportReview } from '../../services/safety';",
  ])if(screen.includes(forbidden))failures.push(`Consumer location still contains immediate generic reporting path: ${forbidden}`);
}

if(failures.length){
  console.error('Native review reporting presentation audit failed:');
  for(const failure of failures)console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Native review reporting presentation audit passed against canonical tracked source.');
await import('./native-review-score-input-audit.mjs');
