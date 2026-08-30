import fs from 'node:fs';
const required=['apps/consumer-mobile/services/community.ts','apps/consumer-mobile/app/location/[id].tsx'];
const failures=[];
for(const file of required) if(!fs.existsSync(file)) failures.push(`missing native community authority file: ${file}`);
if(!failures.length){
  const service=fs.readFileSync('apps/consumer-mobile/services/community.ts','utf8');
  const location=fs.readFileSync('apps/consumer-mobile/app/location/[id].tsx','utf8');
  if(!service.includes("rpc('toggle_review_like'")) failures.push('Helpful-review mutation must use toggle_review_like RPC.');
  if(service.includes("from('review_likes')")) failures.push('Native client must not mutate review_likes directly.');
  if(!location.includes('toggleHelpfulReview')||!location.includes('Helpful')) failures.push('Location community reviews must expose the canonical Helpful action.');
  if(!location.includes('Useful reviews can earn contributor badges')) failures.push('Helpful action must explain contributor-quality progression.');
}
if(failures.length){console.error('Native community authority audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log('Native community authority audit passed.');
