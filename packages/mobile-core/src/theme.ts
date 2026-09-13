import * as SecureStore from 'expo-secure-store';

export type KleenestThemeMode='default'|'light'|'dark'|'system';
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

export const KLEENEST_THEME_OPTIONS:[
  {value:KleenestThemeMode;label:string;description:string},
  {value:KleenestThemeMode;label:string;description:string},
  {value:KleenestThemeMode;label:string;description:string},
  {value:KleenestThemeMode;label:string;description:string},
]=[
  {value:'default',label:'Default',description:'Kleenest branded light environment.'},
  {value:'light',label:'Light',description:'Bright, high-contrast surfaces.'},
  {value:'dark',label:'Dark',description:'Low-light surfaces with preserved context accents.'},
  {value:'system',label:'System',description:'Follow this device or browser appearance.'},
];

const STORAGE_KEY='kleenest.theme.mode.v1';
const MODES=new Set<KleenestThemeMode>(['default','light','dark','system']);
const listeners=new Set<(mode:KleenestThemeMode)=>void>();
let currentMode:KleenestThemeMode='default';

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
  const resolved:KleenestTheme['resolved']=mode==='dark'||(mode==='system'&&systemDark)?'dark':'light';
  const accent=accents[context]||accents.consumer;
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
