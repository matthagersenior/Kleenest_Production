import * as SecureStore from 'expo-secure-store';

export type KleenestSurface='consumer'|'business'|'fleet'|'enterprise'|'owner'|'developer'|'public';
export type KleenestThemeMode='default'|'light'|'dark'|'system';
export type KleenestColorScheme='light'|'dark';

export type KleenestTheme={
  surface:KleenestSurface;
  mode:KleenestThemeMode;
  scheme:KleenestColorScheme;
  density:'comfortable'|'compact';
  radius:{sm:number;md:number;lg:number;xl:number};
  colors:{
    canvas:string;surface:string;surfaceRaised:string;surfaceMuted:string;
    text:string;textMuted:string;border:string;brand:string;brandStrong:string;
    accent:string;accentSoft:string;success:string;warning:string;danger:string;info:string;
    inverseText:string;shadow:string;mapPanel:string;chartGrid:string;focus:string;
  };
  charts:string[];
};

const PREF_KEY='kleenest.visual_theme_mode.v1';
let cachedPreference:KleenestThemeMode|null=null;
const preferenceListeners=new Set<(mode:KleenestThemeMode)=>void>();

const lightBase={
  canvas:'#f3f6f4',surface:'#ffffff',surfaceRaised:'#ffffff',surfaceMuted:'#edf3ef',
  text:'#102218',textMuted:'#65756b',border:'#dbe5de',brand:'#173d2b',brandStrong:'#0d2b1d',
  accent:'#2f7a50',accentSoft:'#e8f3ec',success:'#2e7d4f',warning:'#a46a21',danger:'#8b3434',
  info:'#2d6688',inverseText:'#ffffff',shadow:'rgba(16,34,24,.16)',mapPanel:'#f8fbf9',chartGrid:'#e3ebe6',focus:'#d4ae51',
};
const darkBase={
  canvas:'#0b1510',surface:'#121f18',surfaceRaised:'#182920',surfaceMuted:'#1d3026',
  text:'#eef6f1',textMuted:'#adbbb2',border:'#2b4134',brand:'#7fc69a',brandStrong:'#b8e4c8',
  accent:'#74b98d',accentSoft:'#183426',success:'#72cf93',warning:'#e0ad63',danger:'#e58686',
  info:'#79b7d8',inverseText:'#07110b',shadow:'rgba(0,0,0,.48)',mapPanel:'#101d17',chartGrid:'#294036',focus:'#f0d17d',
};

function environment(surface:KleenestSurface,scheme:KleenestColorScheme){
 const dark=scheme==='dark';
 if(surface==='consumer')return{
  density:'comfortable' as const,
  colors:{brand:dark?'#7fc69a':'#173d2b',brandStrong:dark?'#b8e4c8':'#0d2b1d',accent:dark?'#f0d17d':'#b88928',accentSoft:dark?'#302a17':'#fff7dd',mapPanel:dark?'#101d17':'#f8fbf9'},
  charts:dark?['#7fc69a','#f0d17d','#79b7d8','#d58bb3','#b0d67d']:['#2f7a50','#b88928','#2d6688','#9a4f78','#6c8a38']
 };
 if(surface==='business')return{
  density:'comfortable' as const,
  colors:{brand:dark?'#8fc8a4':'#204b36',brandStrong:dark?'#cce8d6':'#123524',accent:dark?'#74b6d8':'#2a718f',accentSoft:dark?'#17303b':'#e8f4f8',mapPanel:dark?'#0f1d18':'#f6faf7'},
  charts:dark?['#8fc8a4','#74b6d8','#e0ad63','#d58bb3','#90a4d6']:['#2f7a50','#2a718f','#b47b25','#95506f','#566da2']
 };
 if(surface==='fleet')return{
  density:'compact' as const,
  colors:{brand:dark?'#78c8b0':'#18584c',brandStrong:dark?'#c6f1e3':'#0a4037',accent:dark?'#6fc5ff':'#176d9a',accentSoft:dark?'#102d3b':'#e6f3f9',mapPanel:dark?'#081510':'#eef6f3'},
  charts:dark?['#78c8b0','#6fc5ff','#f0c16d','#f18484','#b59ae6']:['#18584c','#176d9a','#b37a24','#a23d3d','#6d58a1']
 };
 if(surface==='enterprise'||surface==='owner')return{
  density:'compact' as const,
  colors:{brand:dark?'#9fb6ff':'#243b66',brandStrong:dark?'#d2dcff':'#17294b',accent:dark?'#7fd1c4':'#2f7c70',accentSoft:dark?'#17322f':'#e7f4f1',mapPanel:dark?'#10151f':'#f4f6fa'},
  charts:dark?['#9fb6ff','#7fd1c4','#efc47b','#e28ca9','#9bd17a']:['#405b96','#2f7c70','#ae7726','#9c4a68','#5e873d']
 };
 if(surface==='developer')return{
  density:'compact' as const,
  colors:{brand:dark?'#7ec8ff':'#174f75',brandStrong:dark?'#caeaff':'#0d3958',accent:dark?'#b99cff':'#6e54a3',accentSoft:dark?'#241d37':'#f0ebfb',mapPanel:dark?'#0a1117':'#f4f8fb'},
  charts:dark?['#7ec8ff','#8fd4b5','#e6b56d','#b99cff','#f08e8e']:['#2e78aa','#3a8a66','#b07724','#6e54a3','#a74444']
 };
 return{
  density:'comfortable' as const,
  colors:{brand:dark?'#7fc69a':'#173d2b',brandStrong:dark?'#b8e4c8':'#0d2b1d',accent:dark?'#f0d17d':'#b88928',accentSoft:dark?'#302a17':'#fff7dd',mapPanel:dark?'#101d17':'#f8fbf9'},
  charts:dark?['#7fc69a','#f0d17d','#79b7d8','#d58bb3']:['#2f7a50','#b88928','#2d6688','#9a4f78']
 };
}

export function defaultSchemeForSurface(surface:KleenestSurface):KleenestColorScheme{
  return surface==='fleet'||surface==='owner'||surface==='developer'?'dark':'light';
}
export function resolveKleenestTheme(surface:KleenestSurface,mode:KleenestThemeMode='default',systemScheme:KleenestColorScheme='light'):KleenestTheme{
  const scheme=mode==='system'?systemScheme:mode==='dark'?'dark':mode==='light'?'light':defaultSchemeForSurface(surface);
  const base=scheme==='dark'?darkBase:lightBase;
  const env=environment(surface,scheme);
  return{
    surface,mode,scheme,density:env.density,
    radius:{sm:10,md:14,lg:20,xl:26},
    colors:{...base,...env.colors},
    charts:env.charts,
  };
}
export async function getKleenestThemePreference():Promise<KleenestThemeMode>{
  if(cachedPreference)return cachedPreference;
  try{const value=await SecureStore.getItemAsync(PREF_KEY);cachedPreference=value==='light'||value==='dark'||value==='system'||value==='default'?value:'default';return cachedPreference;}catch{cachedPreference='default';return cachedPreference}
}
export async function setKleenestThemePreference(mode:KleenestThemeMode){
  cachedPreference=mode;
  await SecureStore.setItemAsync(PREF_KEY,mode);
  preferenceListeners.forEach(listener=>listener(mode));
  return mode;
}
export function subscribeKleenestThemePreference(listener:(mode:KleenestThemeMode)=>void){
  preferenceListeners.add(listener);
  return()=>preferenceListeners.delete(listener);
}
