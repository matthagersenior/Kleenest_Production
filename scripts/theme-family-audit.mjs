import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const theme=read('packages/mobile-core/src/theme.ts');
for(const token of ["'default'","'light'","'dark'","'system'","consumer:","progress:","game:","community:","business:","fleet:","platform:","resolveKleenestTheme","setKleenestThemeMode","subscribeKleenestTheme"]){
  if(!theme.includes(token))failures.push('Shared theme contract missing '+token);
}
for(const [label,path,context] of [
  ['Consumer','apps/consumer-mobile/app/_layout.tsx','consumer'],
  ['Business','apps/business-mobile/app/_layout.tsx','business'],
  ['Fleet','apps/fleet-mobile/app/_layout.tsx','fleet'],
  ['KleenestOS','apps/platform-mobile/app/_layout.tsx','platform'],
]){
  const source=read(path);
  if(!source.includes('loadKleenestThemeMode')||!source.includes('subscribeKleenestTheme'))failures.push(label+' shell must load and react to theme preference changes.');
  if(!source.includes("resolveKleenestTheme(themeMode,systemScheme==='dark','"+context+"')"))failures.push(label+' shell must resolve its own environment context.');
  if(!source.includes('theme.statusBar')||!source.includes('theme.accent')||!source.includes('theme.surface'))failures.push(label+' shell must apply theme colors to navigation chrome.');
}
for(const [label,path,context] of [
  ['Progress World','apps/consumer-mobile/app/progress.tsx','progress'],
  ['Game Center','apps/consumer-mobile/app/games.tsx','game'],
  ['Community','apps/consumer-mobile/app/social.tsx','community'],
]){
  const source=read(path);
  if(!source.includes("resolveKleenestTheme(themeMode,systemScheme==='dark','"+context+"')"))failures.push(label+' must use its contextual theme accent.');
  if(!source.includes('loadKleenestThemeMode')||!source.includes('subscribeKleenestTheme'))failures.push(label+' must react to appearance changes.');
}
const preferences=read('apps/consumer-mobile/app/preferences.tsx');
for(const token of ['KLEENEST_THEME_OPTIONS','chooseTheme','Default','Light','Dark','System'])if(!preferences.includes(token))failures.push('Consumer preferences missing theme control '+token);
for(const path of ['apps/business-mobile/app/account.tsx','apps/fleet-mobile/app/account.tsx','apps/platform-mobile/app/account.tsx']){
  const source=read(path);
  if(!source.includes('KLEENEST_THEME_OPTIONS')||!source.includes('chooseTheme'))failures.push(path+' must expose appearance controls.');
}
if(failures.length){
  console.error('Theme family audit failed:');
  for(const failure of failures)console.error('- '+failure);
  process.exit(1);
}
console.log('Theme family audit passed.');
