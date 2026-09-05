import fs from 'node:fs';

const profileFile=new URL('../apps/consumer-mobile/app/profile.tsx',import.meta.url);
let profile=fs.readFileSync(profileFile,'utf8');
const legacyPush="router.push('/play')";
const legacyRoute='route="/play"';
const beforePush=profile.split(legacyPush).length-1;
const beforeRoute=profile.split(legacyRoute).length-1;
profile=profile.split(legacyPush).join("router.push('/progress')");
profile=profile.split(legacyRoute).join('route="/progress"');
if(!profile.includes("router.push('/progress')")||!profile.includes('route="/progress"'))throw new Error('Consumer progression canonicalization did not produce the required /progress entry points.');
fs.writeFileSync(profileFile,profile);
console.log(`Consumer progression canonicalized to /progress (${beforePush} legacy action${beforePush===1?'':'s'}, ${beforeRoute} legacy hub link${beforeRoute===1?'':'s'} replaced).`);
