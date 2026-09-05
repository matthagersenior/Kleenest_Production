import fs from 'node:fs';

const failures = [];
const componentPath = 'apps/consumer-mobile/components/ReviewReportAction.tsx';
const screenPath = 'apps/consumer-mobile/app/location/[id].tsx';
const patchPath = 'scripts/apply-consumer-review-reporting.mjs';

for (const file of [componentPath, screenPath, patchPath]) {
  if (!fs.existsSync(file)) failures.push(`missing review-reporting file: ${file}`);
}

if (!failures.length) {
  const component = fs.readFileSync(componentPath, 'utf8');
  const screen = fs.readFileSync(screenPath, 'utf8');
  const patch = fs.readFileSync(patchPath, 'utf8');

  for (const token of [
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
  ]) {
    if (!component.includes(token)) failures.push(`ReviewReportAction missing ${token}`);
  }

  for (const token of [
    "import ReviewReportAction from '../../components/ReviewReportAction';",
    '<ReviewReportAction reviewId={String(item.id)}',
  ]) {
    if (!screen.includes(token)) failures.push(`Consumer location review reporting missing ${token}`);
  }

  for (const forbidden of [
    "reportReview(reviewId,'other'",
    'onPress={()=>report(String(item.id))}',
  ]) {
    if (screen.includes(forbidden)) failures.push(`Consumer location still contains immediate generic reporting path: ${forbidden}`);
  }

  for (const token of [
    'Consumer review-reporting patch contract drifted',
    "import ReviewReportAction from '../../components/ReviewReportAction';",
    '<ReviewReportAction reviewId={String(item.id)}',
    "await import('./apply-consumer-review-score-guidance.mjs')",
  ]) {
    if (!patch.includes(token)) failures.push(`Review-reporting patch missing ${token}`);
  }
}

if (failures.length) {
  console.error('Native review reporting presentation audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Native review reporting presentation audit passed.');
await import('./native-review-score-input-audit.mjs');
