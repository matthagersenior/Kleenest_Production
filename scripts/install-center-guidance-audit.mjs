import fs from 'node:fs';

const file='apps/consumer-mobile/app/install.tsx';
const source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const failures=[];
const must=(condition,message)=>{if(!condition)failures.push(message)};

must(Boolean(source),'Installation Center route is missing.');
for(const token of [
  'WHICH INSTALL SHOULD I CHOOSE?',
  'Recommended for most Android users',
  'Share → Add to Dock → Add',
  'Edit Actions',
  'Kleenest-Consumer.apk',
  'DOWNLOAD ANDROID APK',
  'COPY APK LINK',
  'VIEW SHA-256 CHECKSUM',
  'If you have never installed a web app before',
]){
  must(source.includes(token),`Installation Center beginner guidance is missing: ${token}`);
}
must(source.includes("browserKind==='safari'"),'Mac Safari must have explicit browser-specific installation guidance.');

if(failures.length){
  console.error(`Installation Center guidance audit failed with ${failures.length} gap(s):`);
  failures.forEach(f=>console.error('- '+f));
  process.exit(1);
}
console.log('Installation Center beginner guidance audit passed.');
