import fs from 'node:fs';
const required=['apps/consumer-mobile/services/evidenceFormatting.ts','apps/consumer-mobile/components/ReviewPhotoStrip.tsx','apps/consumer-mobile/app/social.tsx','apps/consumer-mobile/app/activity.tsx'];
const failures=[];for(const file of required)if(!fs.existsSync(file))failures.push(`missing evidence presentation file: ${file}`);
if(!failures.length){
  const read=file=>fs.readFileSync(file,'utf8');
  const helper=read(required[0]),strip=read(required[1]),community=read(required[2]),activity=read(required[3]);
  for(const token of ['visitFreshness','verificationMethodLabel','verificationDistanceBucket','formatVisitEvidence',"'within 25 m'","'within 50 m'","'within 100 m'","'within 250 m'","'within 500 m'","'within 1 km'","'distance verified'"])if(!helper.includes(token))failures.push(`Shared evidence formatter missing token: ${token}`);
  if(!helper.includes("normalized==='gps'")||!helper.includes("normalized==='qr'"))failures.push('Shared evidence formatter must normalize GPS and QR verification labels.');
  for(const [name,source] of [['ReviewPhotoStrip',strip],['Community',community],['Activity',activity]]){
    if(!source.includes('formatVisitEvidence'))failures.push(`${name} must use the shared visit evidence formatter.`);
    if(source.includes('function visitFreshness'))failures.push(`${name} must not own a duplicate visit freshness formatter.`);
    if(source.includes('Math.round(item.verifiedDistanceMeters)')||source.includes('Math.round(distance)')||source.includes('m from restroom'))failures.push(`${name} must not expose precise rounded verification distance.`);
  }
  if(!strip.includes('✓ VERIFIED VISIT')||!community.includes('✓ VERIFIED VISIT')||!activity.includes('✓ VERIFIED VISIT'))failures.push('All public trust surfaces must use the canonical VERIFIED VISIT label.');
}
if(failures.length){console.error('Native evidence presentation audit failed:');for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}console.log('Native evidence presentation audit passed.');
