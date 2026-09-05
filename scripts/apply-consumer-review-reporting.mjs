import fs from 'node:fs';

const file = new URL('../apps/consumer-mobile/app/location/[id].tsx', import.meta.url);
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    "import { reportReview } from '../../services/safety';",
    "import ReviewReportAction from '../../components/ReviewReportAction';",
  ],
  [
    "  async function report(reviewId:string){try{await reportReview(reviewId,'other','Reported from a restroom review card.');setMessage('Review reported for moderation. Thank you for helping keep Kleenest trustworthy.')}catch(error:any){setMessage(error?.message||'Review could not be reported.')}}\n",
    '',
  ],
  [
    '<Pressable accessibilityRole="button" accessibilityLabel="Report review" style={s.report} onPress={()=>report(String(item.id))}><Text style={s.reportText}>Report review</Text></Pressable>',
    "<ReviewReportAction reviewId={String(item.id)} onReported={()=>setMessage('Review reported for moderation. Thank you for helping keep Kleenest trustworthy.')}/>",
  ],
];

for (const [from, to] of replacements) {
  if (to && source.includes(to)) continue;
  if (!source.includes(from)) {
    if (!to && !source.includes('async function report(reviewId:string)')) continue;
    throw new Error(`Consumer review-reporting patch contract drifted: missing ${from.slice(0, 100)}`);
  }
  source = source.replace(from, to);
}

if (!source.includes("import ReviewReportAction from '../../components/ReviewReportAction';")) {
  throw new Error('Consumer review-reporting patch did not install ReviewReportAction.');
}
if (!source.includes('<ReviewReportAction reviewId={String(item.id)}')) {
  throw new Error('Consumer review-reporting patch did not replace the immediate generic report action.');
}
if (source.includes("reportReview(reviewId,'other'")) {
  throw new Error('Consumer review-reporting patch left the generic immediate report path active.');
}

fs.writeFileSync(file, source);
console.log('Consumer review reporting patched: explicit reason selection, optional moderation context, duplicate-safe submission, and accessible review-card action.');
