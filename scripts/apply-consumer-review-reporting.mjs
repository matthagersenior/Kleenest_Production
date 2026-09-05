import fs from 'node:fs';

const file = new URL('../apps/consumer-mobile/app/location/[id].tsx', import.meta.url);
let source = fs.readFileSync(file, 'utf8');

const importOld = "import { reportReview } from '../../services/safety';";
const importNew = "import ReviewReportAction from '../../components/ReviewReportAction';";
if (!source.includes(importNew)) {
  if (!source.includes(importOld)) throw new Error('Consumer review-reporting patch contract drifted: safety import unavailable.');
  source = source.replace(importOld, importNew);
}

// Remove the legacy immediate generic report helper regardless of harmless whitespace/message drift.
source = source.replace(/\n\s*async function report\(reviewId:string\)\{try\{await reportReview\(reviewId,'other',[\s\S]*?\}\}\n(?=\s*async function checkIn\()/, '\n');

const oldAction = '<Pressable accessibilityRole="button" accessibilityLabel="Report review" style={s.report} onPress={()=>report(String(item.id))}><Text style={s.reportText}>Report review</Text></Pressable>';
const newAction = "<ReviewReportAction reviewId={String(item.id)} onReported={()=>setMessage('Review reported for moderation. Thank you for helping keep Kleenest trustworthy.')}/>";
if (!source.includes(newAction)) {
  if (!source.includes(oldAction)) throw new Error('Consumer review-reporting patch contract drifted: legacy review action unavailable.');
  source = source.replace(oldAction, newAction);
}

if (!source.includes(importNew)) throw new Error('Consumer review-reporting patch did not install ReviewReportAction.');
if (!source.includes('<ReviewReportAction reviewId={String(item.id)}')) throw new Error('Consumer review-reporting patch did not replace the immediate generic report action.');
if (source.includes("reportReview(reviewId,'other'") || source.includes('onPress={()=>report(String(item.id))}')) throw new Error('Consumer review-reporting patch left the generic immediate report path active.');

fs.writeFileSync(file, source);
console.log('Consumer review reporting patched: explicit reason selection, optional moderation context, duplicate-safe submission, and accessible review-card action.');
await import('./apply-consumer-review-score-guidance.mjs');
