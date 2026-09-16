import * as SecureStore from 'expo-secure-store';

export type KleenestThemeMode=
  'default'|'light'|'dark'|'system'|'early-access'|
  'fall'|'halloween'|'thanksgiving'|'christmas'|
  'clean-slate'|'midnight-transit'|'neon-city'|'trailblazer'|'founders'|'verified-gold'|
  'civic-atlas'|'road-warrior'|'community-builder'|'data-guardian'|
  'spring-renewal'|'summer-roadtrip'|'stl-edition'|'chicago-edition';
export type KleenestThemeContext='consumer'|'progress'|'game'|'community'|'business'|'fleet'|'platform';

export type KleenestTheme={
  mode:KleenestThemeMode;
  resolved:'light'|'dark';
  context:KleenestThemeContext;
  canvas:string;
  surface:string;
  surfaceRaised:string;
  ink:string;
  muted:string;
  line:string;
  accent:string;
  accentSoft:string;
  accentText:string;
  danger:string;
  warning:string;
  success:string;
  statusBar:'light'|'dark';
};

export const KLEENEST_THEME_OPTIONS:ReadonlyArray<{value:KleenestThemeMode;label:string;description:string}>=[
  {value:'default',label:'Default',description:'Kleenest branded light environment.'},
  {value:'light',label:'Light',description:'Bright, high-contrast surfaces.'},
  {value:'dark',label:'Dark',description:'Low-light surfaces with preserved context accents.'},
  {value:'system',label:'System',description:'Follow this device or browser appearance.'},
  {value:'early-access',label:'Early Access',description:'Limited beta theme for the people helping shape Kleenest before launch.'},
  {value:'founders',label:'Founders Edition',description:'Permanent early-builder identity with obsidian, mint and restrained gold.'},
  {value:'clean-slate',label:'Clean Slate',description:'Ultra-clear, clinical surfaces for accuracy-first contributors.'},
  {value:'midnight-transit',label:'Midnight Transit',description:'Deep transit navy with electric route accents for late-night explorers.'},
  {value:'neon-city',label:'Neon City',description:'Dense-market night energy with glowing cyan and magenta signals.'},
  {value:'trailblazer',label:'Trailblazer',description:'Topographic field colors for people who expand the map.'},
  {value:'verified-gold',label:'Verified Gold',description:'Charcoal and gold prestige reserved for high-trust contributors.'},
  {value:'civic-atlas',label:'Civic Atlas',description:'Cartographic paper, civic blue and map-grid precision.'},
  {value:'road-warrior',label:'Road Warrior',description:'Asphalt, safety orange and highway-white for frequent travelers.'},
  {value:'community-builder',label:'Community Builder',description:'Warm social surfaces for people whose contributions help others.'},
  {value:'data-guardian',label:'Data Guardian',description:'Radar-grid dark mode for verification and data-quality specialists.'},
  {value:'spring-renewal',label:'Spring Renewal',description:'Fresh mint, blossom and rain-washed surfaces.'},
  {value:'summer-roadtrip',label:'Summer Roadtrip',description:'Sky, sand and roadside citrus for warm-weather travel.'},
  {value:'stl-edition',label:'St. Louis Edition',description:'A regional Arch-inspired edition for meaningful St. Louis network contribution.'},
  {value:'chicago-edition',label:'Chicago Edition',description:'Lakefront blue, steel and signal red for Chicago-area contribution.'},
  {value:'fall',label:'Autumn Trail',description:'Seasonal reward · parchment, copper, leaves and moss.'},
  {value:'halloween',label:'Night Watch',description:'Seasonal reward · pumpkin fire, moonlight and midnight violet.'},
  {value:'thanksgiving',label:'Harvest Table',description:'Seasonal reward · cranberry, walnut, copper and harvest gold.'},
  {value:'christmas',label:'Winter Guardian',description:'Seasonal reward · evergreen night, snow, winter red and gold.'},
];

export const KLEENEST_SEASONAL_THEME_MODES:ReadonlyArray<KleenestThemeMode>=['spring-renewal','summer-roadtrip','fall','halloween','thanksgiving','christmas'];
export const KLEENEST_REWARD_THEME_MODES:ReadonlyArray<KleenestThemeMode>=[
  'founders','clean-slate','midnight-transit','neon-city','trailblazer','verified-gold','civic-atlas','road-warrior',
  'community-builder','data-guardian','spring-renewal','summer-roadtrip','stl-edition','chicago-edition',
  'fall','halloween','thanksgiving','christmas'
];
export function isKleenestSeasonalThemeMode(mode:KleenestThemeMode|string):mode is KleenestThemeMode{return KLEENEST_SEASONAL_THEME_MODES.includes(mode as KleenestThemeMode)}
export function isKleenestRewardThemeMode(mode:KleenestThemeMode|string):mode is KleenestThemeMode{return KLEENEST_REWARD_THEME_MODES.includes(mode as KleenestThemeMode)}

const STORAGE_KEY='kleenest.theme.mode.v1';
const MODES=new Set<KleenestThemeMode>(KLEENEST_THEME_OPTIONS.map(option=>option.value));
const listeners=new Set<(mode:KleenestThemeMode)=>void>();
let currentMode:KleenestThemeMode='default';

const earlyAccessAccents:Record<KleenestThemeContext,{accent:string;soft:string}>={
  consumer:{accent:'#5de2c2',soft:'#153b38'},
  progress:{accent:'#ffd166',soft:'#3c321b'},
  game:{accent:'#c2a7ff',soft:'#30264d'},
  community:{accent:'#66d9ff',soft:'#183846'},
  business:{accent:'#7de3b2',soft:'#173c30'},
  fleet:{accent:'#7ab8ff',soft:'#1a304b'},
  platform:{accent:'#e39bff',soft:'#392647'},
};

type ThemeEdition={
  resolved:'light'|'dark';canvas:string;surface:string;surfaceRaised:string;ink:string;muted:string;line:string;
  accents:Record<KleenestThemeContext,string>;soft:string;accentText:string;danger:string;warning:string;success:string;statusBar:'light'|'dark';
};
const sameAccents=(value:string):Record<KleenestThemeContext,string>=>({
 consumer:value,progress:value,game:value,community:value,business:value,fleet:value,platform:value,
});
const specialEditions:Partial<Record<KleenestThemeMode,ThemeEdition>>={
  'clean-slate':{resolved:'light',canvas:'#e9f1ee',surface:'#ffffff',surfaceRaised:'#e8f0ee',ink:'#10211d',muted:'#52645f',line:'#bccdc8',accents:sameAccents('#247466'),soft:'#dcece7',accentText:'#ffffff',danger:'#9a3838',warning:'#90631d',success:'#247466',statusBar:'dark'},
  'midnight-transit':{resolved:'dark',canvas:'#070d18',surface:'#101b2d',surfaceRaised:'#182943',ink:'#f5f8ff',muted:'#b4c3d8',line:'#334a69',accents:sameAccents('#72b8ff'),soft:'#173653',accentText:'#06101a',danger:'#ff7f8c',warning:'#ffc86a',success:'#72d4b4',statusBar:'light'},
  'neon-city':{resolved:'dark',canvas:'#05070b',surface:'#11151d',surfaceRaised:'#1b2230',ink:'#f9fbff',muted:'#bbc4d1',line:'#3a4658',accents:{consumer:'#44f1dd',progress:'#ffd65c',game:'#d684ff',community:'#5edcff',business:'#74f2a7',fleet:'#73aaff',platform:'#ff7ad9'},soft:'#172d34',accentText:'#041311',danger:'#ff6281',warning:'#ffd65c',success:'#44f1a6',statusBar:'light'},
  trailblazer:{resolved:'light',canvas:'#eee8d8',surface:'#fffaf0',surfaceRaised:'#e0d7bf',ink:'#263326',muted:'#5e6650',line:'#c6b994',accents:sameAccents('#4d7044'),soft:'#dce5cf',accentText:'#ffffff',danger:'#8b4338',warning:'#8a651c',success:'#4d7044',statusBar:'dark'},
  founders:{resolved:'dark',canvas:'#050a09',surface:'#101a17',surfaceRaised:'#192a25',ink:'#fbfdfc',muted:'#bccbc5',line:'#3a544b',accents:sameAccents('#66e3c4'),soft:'#173931',accentText:'#07120f',danger:'#ff8490',warning:'#e5bf65',success:'#66e3c4',statusBar:'light'},
  'verified-gold':{resolved:'dark',canvas:'#0a0a09',surface:'#171714',surfaceRaised:'#24231e',ink:'#fffdf7',muted:'#c8c2ad',line:'#5a5236',accents:sameAccents('#e7c45d'),soft:'#3b3216',accentText:'#1a1505',danger:'#ff7c7c',warning:'#e7c45d',success:'#88d2a2',statusBar:'light'},
  'civic-atlas':{resolved:'light',canvas:'#edf1ef',surface:'#fffdf8',surfaceRaised:'#e0e7e4',ink:'#172d39',muted:'#536875',line:'#bdc9ca',accents:sameAccents('#315f78'),soft:'#dce8ed',accentText:'#ffffff',danger:'#934241',warning:'#8b651f',success:'#41745b',statusBar:'dark'},
  'road-warrior':{resolved:'dark',canvas:'#111314',surface:'#1d2022',surfaceRaised:'#2b3033',ink:'#f8faf9',muted:'#bec5c2',line:'#50595a',accents:sameAccents('#f39a43'),soft:'#45301d',accentText:'#1a0f05',danger:'#ff7777',warning:'#f6c25d',success:'#78cf9d',statusBar:'light'},
  'community-builder':{resolved:'light',canvas:'#f6eee9',surface:'#fffaf6',surfaceRaised:'#ecdcd4',ink:'#382623',muted:'#755d57',line:'#d7bbb0',accents:{consumer:'#b85b4d',progress:'#9a6b22',game:'#80516c',community:'#2d7b78',business:'#4c765d',fleet:'#526f87',platform:'#8a546e'},soft:'#f0ddd6',accentText:'#ffffff',danger:'#9b3f42',warning:'#9b6a24',success:'#39745b',statusBar:'dark'},
  'data-guardian':{resolved:'dark',canvas:'#06100e',surface:'#0e1f1b',surfaceRaised:'#17332d',ink:'#ecfff9',muted:'#afd0c5',line:'#2e5a50',accents:sameAccents('#51e3b8'),soft:'#143b32',accentText:'#04120d',danger:'#ff7786',warning:'#eacb63',success:'#51e3b8',statusBar:'light'},
  'spring-renewal':{resolved:'light',canvas:'#eef7ef',surface:'#fffefd',surfaceRaised:'#e2efe3',ink:'#203222',muted:'#617364',line:'#c3d5c4',accents:sameAccents('#4f8b66'),soft:'#dff0e3',accentText:'#ffffff',danger:'#a14a55',warning:'#9d742d',success:'#4f8b66',statusBar:'dark'},
  'summer-roadtrip':{resolved:'light',canvas:'#edf7fb',surface:'#fffdf7',surfaceRaised:'#e6efe9',ink:'#20313a',muted:'#5d7079',line:'#bed0d7',accents:sameAccents('#e57b37'),soft:'#fde7d6',accentText:'#ffffff',danger:'#a54242',warning:'#a8681e',success:'#3d8066',statusBar:'dark'},
  'stl-edition':{resolved:'dark',canvas:'#0c1420',surface:'#152335',surfaceRaised:'#20344d',ink:'#f8fbff',muted:'#b9c8d9',line:'#405a76',accents:sameAccents('#f4c45f'),soft:'#3a321d',accentText:'#17200a',danger:'#e96b74',warning:'#f4c45f',success:'#78d0a2',statusBar:'light'},
  'chicago-edition':{resolved:'dark',canvas:'#09121c',surface:'#122338',surfaceRaised:'#1d3551',ink:'#f5f9ff',muted:'#b6c7da',line:'#3d5875',accents:sameAccents('#71b7ed'),soft:'#173552',accentText:'#07131e',danger:'#ef6d74',warning:'#e6bf63',success:'#72d0ad',statusBar:'light'},
  fall:{resolved:'light',canvas:'#e9ead8',surface:'#fbf8ea',surfaceRaised:'#ddd9b8',ink:'#21311f',muted:'#526042',line:'#c2bd92',accents:{consumer:'#9d5728',progress:'#99671f',game:'#71553a',community:'#5d7040',business:'#526b3b',fleet:'#536b54',platform:'#5f7138'},soft:'#dfe0be',accentText:'#ffffff',danger:'#963f36',warning:'#8b631c',success:'#4f7047',statusBar:'dark'},
  halloween:{resolved:'dark',canvas:'#050208',surface:'#1b1024',surfaceRaised:'#332040',ink:'#fff7ed',muted:'#c9b8cf',line:'#594068',accents:{consumer:'#ff8a2b',progress:'#f4c95d',game:'#b58cff',community:'#6fe7d8',business:'#83d483',fleet:'#73a9ff',platform:'#d787ff'},soft:'#33203f',accentText:'#140a04',danger:'#ff718b',warning:'#ffb347',success:'#6fe7d8',statusBar:'light'},
  thanksgiving:{resolved:'light',canvas:'#f3e6df',surface:'#fff8f3',surfaceRaised:'#e8cfc3',ink:'#321d1b',muted:'#76564f',line:'#d6b7aa',accents:{consumer:'#8f3438',progress:'#8a5e20',game:'#70455b',community:'#874b3c',business:'#5f5937',fleet:'#684b40',platform:'#7f3d38'},soft:'#ecd1c7',accentText:'#ffffff',danger:'#8d3138',warning:'#8b5d1d',success:'#56633b',statusBar:'dark'},
  christmas:{resolved:'dark',canvas:'#07130f',surface:'#0e211a',surfaceRaised:'#163126',ink:'#f7fbf9',muted:'#b6c9c0',line:'#315044',accents:{consumer:'#f0c75e',progress:'#f0c75e',game:'#8fd9c7',community:'#7fcdf2',business:'#91d186',fleet:'#9ac4f4',platform:'#f0c75e'},soft:'#193d30',accentText:'#102018',danger:'#ef6a6a',warning:'#f0c75e',success:'#83d6a6',statusBar:'light'},
};

const accents:Record<KleenestThemeContext,{light:string;dark:string;soft:string;softDark:string}>={
  consumer:{light:'#2f6f4e',dark:'#74c99a',soft:'#e0efe6',softDark:'#193426'},
  progress:{light:'#9b6518',dark:'#e8b75f',soft:'#f6ead2',softDark:'#3a2c16'},
  game:{light:'#6550b8',dark:'#b8a8ff',soft:'#ece8fb',softDark:'#292342'},
  community:{light:'#286f72',dark:'#7bc9cb',soft:'#e0f0f0',softDark:'#193538'},
  business:{light:'#176c58',dark:'#72cdb0',soft:'#dff0e9',softDark:'#17372f'},
  fleet:{light:'#315f8c',dark:'#8ab9e8',soft:'#e2ebf4',softDark:'#1b3044'},
  platform:{light:'#65548f',dark:'#bdabe8',soft:'#ece8f5',softDark:'#2b2440'},
};

function validMode(value:unknown):value is KleenestThemeMode{return typeof value==='string'&&MODES.has(value as KleenestThemeMode)}
function browserStorage(){
  const root=globalThis as any;
  try{return root?.localStorage??root?.window?.localStorage??null}catch{return null}
}

export function getKleenestThemeMode(){return currentMode}

export async function loadKleenestThemeMode():Promise<KleenestThemeMode>{
  let stored:string|null=null;
  const local=browserStorage();
  if(local){
    try{stored=local.getItem(STORAGE_KEY)}catch{}
  }else{
    try{stored=await SecureStore.getItemAsync(STORAGE_KEY)}catch{}
  }
  currentMode=validMode(stored)?stored:'default';
  return currentMode;
}

export async function setKleenestThemeMode(mode:KleenestThemeMode){
  if(!validMode(mode))throw new Error('Unsupported Kleenest theme mode.');
  currentMode=mode;
  const local=browserStorage();
  if(local){
    try{local.setItem(STORAGE_KEY,mode)}catch{}
  }else{
    try{await SecureStore.setItemAsync(STORAGE_KEY,mode)}catch{}
  }
  for(const listener of listeners)listener(mode);
  return mode;
}

export function subscribeKleenestTheme(listener:(mode:KleenestThemeMode)=>void){
  listeners.add(listener);
  return()=>listeners.delete(listener);
}

export function resolveKleenestTheme(mode:KleenestThemeMode,systemDark=false,context:KleenestThemeContext='consumer'):KleenestTheme{
  const earlyAccess=mode==='early-access';
  const edition=specialEditions[mode];
  const resolved:KleenestTheme['resolved']=edition?.resolved||(earlyAccess||mode==='dark'||(mode==='system'&&systemDark)?'dark':'light');
  const accent=accents[context]||accents.consumer;
  if(edition){
    return{
      mode,resolved:edition.resolved,context,
      canvas:edition.canvas,surface:edition.surface,surfaceRaised:edition.surfaceRaised,ink:edition.ink,muted:edition.muted,line:edition.line,
      accent:edition.accents[context]||edition.accents.consumer,accentSoft:edition.soft,accentText:edition.accentText,
      danger:edition.danger,warning:edition.warning,success:edition.success,statusBar:edition.statusBar,
    };
  }
  if(earlyAccess){
    const beta=earlyAccessAccents[context]||earlyAccessAccents.consumer;
    return{
      mode,resolved,context,
      canvas:'#030712',surface:'#111d35',surfaceRaised:'#1d3153',ink:'#ffffff',muted:'#c2cee2',line:'#50698f',
      accent:beta.accent,accentSoft:beta.soft,accentText:'#06100d',danger:'#ff8fa3',warning:'#ffd166',success:'#66e3c4',statusBar:'light',
    };
  }
  if(resolved==='dark'){
    return{
      mode,resolved,context,
      canvas:'#050c08',surface:'#14241a',surfaceRaised:'#22372a',ink:'#ffffff',muted:'#c2cec7',line:'#4c6254',
      accent:accent.dark,accentSoft:accent.softDark,accentText:'#07110c',danger:'#ef8d8d',warning:'#e8bb68',success:'#75c99b',statusBar:'light',
    };
  }
  const branded=mode==='default';
  return{
    mode,resolved,context,
    canvas:branded?'#edf3ef':'#f5f7f6',surface:'#ffffff',surfaceRaised:branded?'#e4ece7':'#eef2ef',ink:'#0b1b12',muted:'#4f5f56',line:'#b8c8bd',
    accent:accent.light,accentSoft:accent.soft,accentText:'#ffffff',danger:'#8a3434',warning:'#9b6518',success:'#2f7a53',statusBar:'dark',
  };
}
