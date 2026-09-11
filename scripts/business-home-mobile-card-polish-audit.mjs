import fs from 'node:fs';

const path='apps/business-mobile/app/index.tsx';
const source=fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
const failures=[];
const need=token=>{if(!source.includes(token))failures.push('Business Home missing '+token);};

for(const token of [
  'actionHeader',
  'actionFooter',
  'actionCta',
  'actionCtaText',
  'actionGroupLabel',
  "minWidth:0",
  "flexWrap:'wrap'",
  "flexBasis:150",
  "alignItems:'stretch'"
]) need(token);

if(/actionTile:\{[^\n]*flexDirection:'row'/.test(source)) failures.push('ActionTile must not remain a single horizontal row.');
if(/<Text style=\{s\.chevron\}>/.test(source)) failures.push('Inline chevron still crowds the tool card.');
if(/sectionHeader:\{[^\n]*flexDirection:'row'/.test(source)) failures.push('Section header must stack on narrow screens.');

if(failures.length){
  console.error('Business Home mobile card polish audit failed:');
  for(const failure of failures) console.error('- '+failure);
  process.exit(1);
}
console.log('Business Home mobile card polish audit passed.');
