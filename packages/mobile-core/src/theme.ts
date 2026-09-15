import * as SecureStore from 'expo-secure-store';

export type KleenestThemeMode='default'|'light'|'dark'|'system'|'early-access';
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
];

const STORAGE_KEY='kleenest.theme.mode.v1';
const MODES=new Set<KleenestThemeMode>(['default','light','dark','system','early-access']);
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
  const resolved:KleenestTheme['resolved']=earlyAccess||mode==='dark'||(mode==='system'&&systemDark)?'dark':'light';
  const accent=accents[context]||accents.consumer;
  if(earlyAccess){
    const edition=earlyAccessAccents[context]||earlyAccessAccents.consumer;
    return{
      mode,resolved,context,
      canvas:'#030712',surface:'#111d35',surfaceRaised:'#1d3153',ink:'#ffffff',muted:'#c2cee2',line:'#50698f',
      accent:edition.accent,accentSoft:edition.soft,accentText:'#06100d',danger:'#ff8fa3',warning:'#ffd166',success:'#66e3c4',statusBar:'light',
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
