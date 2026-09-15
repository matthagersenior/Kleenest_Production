import * as SecureStore from 'expo-secure-store';

export type KleenestThemeMode='default'|'light'|'dark'|'system'|'early-access'|'fall'|'halloween'|'thanksgiving'|'christmas';
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
  {value:'fall',label:'Autumn Trail',description:'Seasonal reward · parchment, copper, leaves and moss.'},
  {value:'halloween',label:'Night Watch',description:'Seasonal reward · pumpkin fire, moonlight and midnight violet.'},
  {value:'thanksgiving',label:'Harvest Table',description:'Seasonal reward · cranberry, walnut, copper and harvest gold.'},
  {value:'christmas',label:'Winter Guardian',description:'Seasonal reward · evergreen night, snow, winter red and gold.'},
];

export const KLEENEST_SEASONAL_THEME_MODES:ReadonlyArray<KleenestThemeMode>=['fall','halloween','thanksgiving','christmas'];
export function isKleenestSeasonalThemeMode(mode:KleenestThemeMode|string):mode is KleenestThemeMode{return KLEENEST_SEASONAL_THEME_MODES.includes(mode as KleenestThemeMode)}

const STORAGE_KEY='kleenest.theme.mode.v1';
const MODES=new Set<KleenestThemeMode>(['default','light','dark','system','early-access','fall','halloween','thanksgiving','christmas']);
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

const seasonalEditions:Record<'fall'|'halloween'|'thanksgiving'|'christmas',{
  resolved:'light'|'dark';canvas:string;surface:string;surfaceRaised:string;ink:string;muted:string;line:string;
  accents:Record<KleenestThemeContext,string>;soft:string;accentText:string;danger:string;warning:string;success:string;statusBar:'light'|'dark';
}>={
  fall:{
    resolved:'light',canvas:'#f4ecdf',surface:'#fffaf1',surfaceRaised:'#efe1cc',ink:'#2b1d14',muted:'#725b49',line:'#ddc7a6',
    accents:{consumer:'#b85d24',progress:'#c17b18',game:'#7e5b43',community:'#65743b',business:'#8b5b32',fleet:'#55734c',platform:'#8a4c2d'},
    soft:'#f0d9bd',accentText:'#ffffff',danger:'#9d3f34',warning:'#9b6518',success:'#55734c',statusBar:'dark',
  },
  halloween:{
    resolved:'dark',canvas:'#0b0710',surface:'#17101e',surfaceRaised:'#22162c',ink:'#fff7ed',muted:'#c9b8cf',line:'#493454',
    accents:{consumer:'#ff8a2b',progress:'#f4c95d',game:'#b58cff',community:'#6fe7d8',business:'#83d483',fleet:'#73a9ff',platform:'#d787ff'},
    soft:'#33203f',accentText:'#140a04',danger:'#ff718b',warning:'#ffb347',success:'#6fe7d8',statusBar:'light',
  },
  thanksgiving:{
    resolved:'light',canvas:'#f5eadb',surface:'#fffaf2',surfaceRaised:'#eedbc3',ink:'#321d17',muted:'#77594d',line:'#dec4a5',
    accents:{consumer:'#9b3f36',progress:'#b77821',game:'#7c4a63',community:'#a05a3d',business:'#6c6a3a',fleet:'#765946',platform:'#8b4d3b'},
    soft:'#efd4c2',accentText:'#ffffff',danger:'#943a36',warning:'#a46518',success:'#5d6e3c',statusBar:'dark',
  },
  christmas:{
    resolved:'dark',canvas:'#07130f',surface:'#0e211a',surfaceRaised:'#163126',ink:'#f7fbf9',muted:'#b6c9c0',line:'#315044',
    accents:{consumer:'#f0c75e',progress:'#f0c75e',game:'#8fd9c7',community:'#7fcdf2',business:'#91d186',fleet:'#9ac4f4',platform:'#f0c75e'},
    soft:'#193d30',accentText:'#102018',danger:'#ef6a6a',warning:'#f0c75e',success:'#83d6a6',statusBar:'light',
  },
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
  const seasonal=isKleenestSeasonalThemeMode(mode)?seasonalEditions[mode as keyof typeof seasonalEditions]:null;
  const resolved:KleenestTheme['resolved']=seasonal?.resolved||(earlyAccess||mode==='dark'||(mode==='system'&&systemDark)?'dark':'light');
  const accent=accents[context]||accents.consumer;
  if(seasonal){
    return{
      mode,resolved:seasonal.resolved,context,
      canvas:seasonal.canvas,surface:seasonal.surface,surfaceRaised:seasonal.surfaceRaised,ink:seasonal.ink,muted:seasonal.muted,line:seasonal.line,
      accent:seasonal.accents[context]||seasonal.accents.consumer,accentSoft:seasonal.soft,accentText:seasonal.accentText,
      danger:seasonal.danger,warning:seasonal.warning,success:seasonal.success,statusBar:seasonal.statusBar,
    };
  }
  if(earlyAccess){
    const edition=earlyAccessAccents[context]||earlyAccessAccents.consumer;
    return{
      mode,resolved,context,
      canvas:'#070b17',surface:'#0f172a',surfaceRaised:'#162238',ink:'#f7faff',muted:'#aab8d1',line:'#2b3b59',
      accent:edition.accent,accentSoft:edition.soft,accentText:'#06100d',danger:'#ff8fa3',warning:'#ffd166',success:'#66e3c4',statusBar:'light',
    };
  }
  if(resolved==='dark'){
    return{
      mode,resolved,context,
      canvas:'#0b1410',surface:'#132019',surfaceRaised:'#192920',ink:'#f2f7f4',muted:'#a6b6ad',line:'#2a3b31',
      accent:accent.dark,accentSoft:accent.softDark,accentText:'#07110c',danger:'#ef8d8d',warning:'#e8bb68',success:'#75c99b',statusBar:'light',
    };
  }
  const branded=mode==='default';
  return{
    mode,resolved,context,
    canvas:branded?'#f3f6f4':'#ffffff',surface:'#ffffff',surfaceRaised:branded?'#f9fbfa':'#f7f9f8',ink:'#102218',muted:'#617068',line:'#d7e2da',
    accent:accent.light,accentSoft:accent.soft,accentText:'#ffffff',danger:'#8a3434',warning:'#9b6518',success:'#2f7a53',statusBar:'dark',
  };
}
