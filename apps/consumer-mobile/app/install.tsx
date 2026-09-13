import * as Linking from 'expo-linking';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { palette } from '../components/ConsumerUI';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
type DeviceKind='ios'|'android'|'desktop'|'other';
type BrowserKind='opera'|'chrome'|'edge'|'samsung'|'firefox'|'safari'|'other';
type ReleaseState={
  baselineSha?:string;
  currentSha?:string;
  nativeDrift?:boolean;
  otaCompatible?:boolean;
  status?:string;
  checkedAt?:string;
};

const ROOT_PATH='/Kleenest_Production/';
const INSTALL_PATH='/Kleenest_Production/install';
const APP_PATH='/Kleenest_Production/explore';
const APK_PATH='/Kleenest_Production/Kleenest-Consumer.apk';
const CHECKSUM_PATH='/Kleenest_Production/Kleenest-Consumer.apk.sha256';
const RELEASE_STATE_PATH='/Kleenest_Production/Kleenest-release-state.json';

function browserUrl(path:string){
  if(typeof window==='undefined')return `https://matthagersenior.github.io${path}`;
  return new URL(path,window.location.origin).toString();
}

function detectDeviceKind():DeviceKind{
  if(Platform.OS==='ios')return'ios';
  if(Platform.OS==='android')return'android';
  if(Platform.OS!=='web'||typeof navigator==='undefined')return'other';
  const ua=navigator.userAgent||'';
  const isIOS=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&Number((navigator as any).maxTouchPoints||0)>1);
  const isAndroid=/Android/i.test(ua);
  if(isIOS)return'ios';
  if(isAndroid)return'android';
  return'desktop';
}

function detectBrowserKind():BrowserKind{
  if(typeof navigator==='undefined')return'other';
  const ua=navigator.userAgent||'';
  if(/OPR\//i.test(ua)||/Opera/i.test(ua))return'opera';
  if(/SamsungBrowser/i.test(ua))return'samsung';
  if(/EdgA?\//i.test(ua))return'edge';
  if(/Firefox|FxiOS/i.test(ua))return'firefox';
  if(/CriOS|Chrome/i.test(ua))return'chrome';
  if(/Safari/i.test(ua))return'safari';
  return'other';
}

function browserLabel(kind:BrowserKind){
  return kind==='opera'?'Opera':kind==='samsung'?'Samsung Internet':kind==='edge'?'Edge':kind==='firefox'?'Firefox':kind==='chrome'?'Chrome':kind==='safari'?'Safari':'Browser';
}

function AppleInstallSteps(){
  return <View style={s.steps}>
    <View style={s.step}><Text style={s.stepNumber}>1</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Open Kleenest in Safari</Text><Text style={s.stepBody}>Safari gives iPhone and iPad the clearest web-app installation path.</Text></View></View>
    <View style={s.step}><Text style={s.stepNumber}>2</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Tap Share</Text><Text style={s.stepBody}>Use the Share button in Safari.</Text></View></View>
    <View style={s.step}><Text style={s.stepNumber}>3</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Choose Add to Home Screen</Text><Text style={s.stepBody}>Scroll the share sheet if needed, then choose Add to Home Screen.</Text></View></View>
    <View style={s.step}><Text style={s.stepNumber}>4</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Keep Open as Web App enabled</Text><Text style={s.stepBody}>Tap Add. Kleenest gets its own Home Screen icon and opens in an app-style window.</Text></View></View>
  </View>
}

export default function InstallKleenest(){
  const[prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const[installed,setInstalled]=useState(false);
  const[message,setMessage]=useState('');
  const[releaseState,setReleaseState]=useState<ReleaseState|null>(null);
  const[releaseLoading,setReleaseLoading]=useState(false);
  const[serviceWorkerReady,setServiceWorkerReady]=useState(false);
  const[secureContext,setSecureContext]=useState(true);
  const deviceKind=useMemo(()=>detectDeviceKind(),[]);
  const browserKind=useMemo(()=>detectBrowserKind(),[]);
  const isIOS=deviceKind==='ios';
  const isAndroid=deviceKind==='android';
  const isDesktop=deviceKind==='desktop';

  const refreshDiagnostics=useCallback(async()=>{
    if(Platform.OS!=='web'||typeof window==='undefined')return;
    setReleaseLoading(true);
    setSecureContext(Boolean(window.isSecureContext));
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches||Boolean((navigator as any).standalone);
    setInstalled(Boolean(standalone));
    if('serviceWorker'in navigator){
      const registration=await navigator.serviceWorker.getRegistration(ROOT_PATH).catch(()=>undefined);
      setServiceWorkerReady(Boolean(registration));
    }else setServiceWorkerReady(false);
    try{
      const response=await fetch(browserUrl(RELEASE_STATE_PATH),{cache:'no-store'});
      if(!response.ok)throw new Error(String(response.status));
      setReleaseState(await response.json());
    }catch{
      setReleaseState(null);
    }finally{
      setReleaseLoading(false);
    }
  },[]);

  useEffect(()=>{
    if(Platform.OS!=='web'||typeof window==='undefined')return;
    void refreshDiagnostics();
    const capture=(event:Event)=>{
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const installedHandler=()=>{setInstalled(true);setPrompt(null);setMessage('Kleenest is installed on this device.');};
    window.addEventListener('beforeinstallprompt',capture);
    window.addEventListener('appinstalled',installedHandler);
    const timer=window.setTimeout(()=>void refreshDiagnostics(),1200);
    return()=>{
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt',capture);
      window.removeEventListener('appinstalled',installedHandler);
    };
  },[refreshDiagnostics]);

  const environment=useMemo(()=>{
    if(isIOS)return'IPHONE / IPAD';
    if(isAndroid)return'ANDROID';
    if(isDesktop)return'DESKTOP WEB';
    return Platform.OS==='web'?'WEB APP':Platform.OS.toUpperCase();
  },[isAndroid,isDesktop,isIOS]);

  const browserHelp=useMemo(()=>{
    if(isIOS)return'In Safari: Share → Add to Home Screen → keep Open as Web App enabled → Add.';
    if(browserKind==='opera')return'In Opera, use the browser menu and look for Install app or Add to Home screen if the automatic prompt is unavailable.';
    if(browserKind==='chrome')return'In Chrome, use Install app from the browser menu if the automatic prompt is unavailable.';
    if(browserKind==='edge')return'In Edge, use Apps or Install this site as an app if the automatic prompt is unavailable.';
    if(browserKind==='samsung')return'In Samsung Internet, use Add page to → Home screen if the automatic prompt is unavailable.';
    if(browserKind==='firefox')return'Use the browser menu and choose Add to Home screen when offered.';
    return'Use your browser menu and choose Install app or Add to Home Screen if the automatic prompt is unavailable.';
  },[browserKind,isIOS]);

  async function installWeb(){
    if(installed){setMessage('Kleenest is already running as an installed web app on this device.');return}
    if(isIOS){
      setMessage('On iPhone or iPad: Share → Add to Home Screen → keep Open as Web App enabled → Add.');
      return;
    }
    if(prompt){
      await prompt.prompt();
      const choice=await prompt.userChoice;
      setMessage(choice.outcome==='accepted'?'Installation accepted. Kleenest can now launch like an app.':'Installation was dismissed. You can install again whenever you are ready.');
      if(choice.outcome==='accepted')setPrompt(null);
      await refreshDiagnostics();
      return;
    }
    setMessage(browserHelp);
  }

  async function shareInstall(){
    const url=browserUrl(INSTALL_PATH);
    if(Platform.OS==='web'&&typeof navigator!=='undefined'){
      if(typeof navigator.share==='function'){
        try{await navigator.share({title:'Install Kleenest',text:'Install the Kleenest restroom discovery app.',url});setMessage('Install link shared.');return}catch{}
      }
      if(navigator.clipboard?.writeText){
        try{await navigator.clipboard.writeText(url);setMessage('Install link copied.');return}catch{}
      }
    }
    setMessage(`Share this install link: ${url}`);
  }

  async function downloadApk(){await Linking.openURL(browserUrl(APK_PATH))}
  async function openChecksum(){await Linking.openURL(browserUrl(CHECKSUM_PATH))}
  async function openKleenest(){await Linking.openURL(browserUrl(APP_PATH))}

  const releaseStatus=releaseLoading?'CHECKING':releaseState?.status||'STATUS UNAVAILABLE';
  const releaseGood=releaseState?.otaCompatible===true&&!releaseState?.nativeDrift;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <View style={s.hero}>
      <Text style={s.eyebrow}>KLEENEST · UNIVERSAL INSTALLATION CENTER</Text>
      <Text style={s.title}>{isIOS?'Put Kleenest on your iPhone or iPad.':isAndroid?'Install Kleenest on Android.':'Install Kleenest like an app.'}</Text>
      <Text style={s.body}>{isIOS?'No App Store download is required for the web app. Add Kleenest to your Home Screen and it opens in its own app-style window.':isAndroid?'Choose the installable web app or the verified Android APK. Both use the same Kleenest account and network.':'Install the Kleenest PWA from a supported browser and launch it from your desktop or app launcher.'}</Text>
      <View style={s.statusRow}>
        <View style={s.status}><Text style={s.statusText}>{environment}{installed?' · INSTALLED':''}</Text></View>
        <View style={s.status}><Text style={s.statusText}>{browserLabel(browserKind).toUpperCase()}</Text></View>
      </View>
      <Pressable accessibilityRole="link" style={s.heroLink} onPress={()=>void Linking.openURL(browserUrl(ROOT_PATH))}><Text style={s.heroLinkText}>← BACK TO KLEENEST SITE</Text></Pressable>
    </View>

    {message?<View style={s.notice}><Text style={s.noticeText}>{message}</Text></View>:null}

    <View style={s.healthCard}>
      <View style={s.healthHeader}><View style={{flex:1}}><Text style={s.kicker}>INSTALL HEALTH</Text><Text style={s.cardTitle}>Is this device ready?</Text></View><Text style={[s.releaseBadge,releaseGood?s.releaseGood:s.releaseNeutral]}>{releaseStatus}</Text></View>
      <View style={s.healthGrid}>
        <View style={s.healthItem}><Text style={s.healthLabel}>SECURE WEB</Text><Text style={s.healthValue}>{secureContext?'READY':'CHECK BROWSER'}</Text></View>
        <View style={s.healthItem}><Text style={s.healthLabel}>PWA SHELL</Text><Text style={s.healthValue}>{serviceWorkerReady?'READY':'LOADING'}</Text></View>
        <View style={s.healthItem}><Text style={s.healthLabel}>INSTALL MODE</Text><Text style={s.healthValue}>{installed?'INSTALLED':prompt?'ONE TAP':'MANUAL READY'}</Text></View>
        <View style={s.healthItem}><Text style={s.healthLabel}>APK BASELINE</Text><Text style={s.healthValue}>{releaseState?.baselineSha?.slice(0,8)||'CHECKING'}</Text></View>
      </View>
      <Text style={s.help}>{releaseGood?'Web, OTA and the verified APK baseline are compatible.':'Kleenest checks release alignment here so a web/OTA update cannot silently outrun required native changes.'}</Text>
      <View style={s.buttonRow}>
        <Pressable accessibilityRole="button" style={s.secondary} onPress={()=>void refreshDiagnostics()}><Text style={s.secondaryText}>CHECK INSTALLATION</Text></Pressable>
        <Pressable accessibilityRole="button" style={s.secondary} onPress={()=>void shareInstall()}><Text style={s.secondaryText}>SHARE INSTALL LINK</Text></Pressable>
        <Pressable accessibilityRole="link" style={s.secondary} onPress={()=>void openKleenest()}><Text style={s.secondaryText}>OPEN KLEENEST</Text></Pressable>
      </View>
    </View>

    {isIOS?<View style={s.card}>
      <Text style={s.kicker}>IPHONE + IPAD · WEB APP</Text>
      <Text style={s.cardTitle}>Install Kleenest from Safari</Text>
      <Text style={s.cardBody}>This is the iPhone/iPad browser-app version of Kleenest. It gets a Home Screen icon and can open without Safari chrome, much like a normal app.</Text>
      <AppleInstallSteps/>
      <Pressable accessibilityRole="button" style={s.primary} onPress={()=>void installWeb()}><Text style={s.primaryText}>{installed?'WEB APP INSTALLED':'SHOW IPHONE / IPAD INSTALL STEPS'}</Text></Pressable>
      <Text style={s.help}>{browserHelp}</Text>
    </View>:null}

    {!isIOS?<View style={s.card}>
      <Text style={s.kicker}>{isAndroid?'ANDROID · WEB APP':'BROWSER APP'}</Text>
      <Text style={s.cardTitle}>Install the Kleenest web app</Text>
      <Text style={s.cardBody}>Recommended for most people. It opens in its own app window, keeps the Kleenest icon on your device, updates quickly, and uses the same Kleenest account and network.</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={()=>void installWeb()}><Text style={s.primaryText}>{installed?'WEB APP INSTALLED':'INSTALL WEB APP'}</Text></Pressable>
      {!installed?<Text style={s.help}>{prompt?'Your browser is ready for a one-tap install.':browserHelp}</Text>:null}
    </View>:null}

    {isAndroid?<View style={s.card}>
      <Text style={s.kicker}>ANDROID · DIRECT INSTALL</Text>
      <Text style={s.cardTitle}>Verified Kleenest Android APK</Text>
      <Text style={s.cardBody}>Prefer a native Android package? Download the verified release APK. The Installation Center keeps showing whether the current web/OTA code is compatible with that APK baseline.</Text>
      <Pressable accessibilityRole="link" style={s.primary} onPress={()=>void downloadApk()}><Text style={s.primaryText}>DOWNLOAD ANDROID APK</Text></Pressable>
      <Pressable accessibilityRole="link" style={s.secondary} onPress={()=>void openChecksum()}><Text style={s.secondaryText}>VIEW SHA-256 CHECKSUM</Text></Pressable>
    </View>:null}

    <View style={s.card}>
      <Text style={s.kicker}>IF INSTALLATION DOESN'T WORK</Text>
      <Text style={s.cardTitle}>Use the easy recovery path.</Text>
      <Text style={s.cardBody}>Most install problems are browser-menu or stale-shortcut issues. These steps are safe and do not require changing your Kleenest account.</Text>
      <View style={s.steps}>
        <View style={s.step}><Text style={s.stepNumber}>1</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Check the browser instructions above</Text><Text style={s.stepBody}>{browserHelp}</Text></View></View>
        <View style={s.step}><Text style={s.stepNumber}>2</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Run Install Health again</Text><Text style={s.stepBody}>Secure Web and PWA Shell should show READY. If the shell still says LOADING, refresh this page once and check again.</Text></View></View>
        <View style={s.step}><Text style={s.stepNumber}>3</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Remove an old shortcut if it behaves strangely</Text><Text style={s.stepBody}>If an older Kleenest shortcut only opens a browser tab or looks stale, remove that shortcut and install again from this page.</Text></View></View>
        <View style={s.step}><Text style={s.stepNumber}>4</Text><View style={s.stepCopy}><Text style={s.stepTitle}>Android has a second path</Text><Text style={s.stepBody}>The web app is recommended for most people. If you specifically want the native Android package, use the verified APK option above.</Text></View></View>
      </View>
      <View style={s.buttonRow}>
        <Pressable accessibilityRole="button" style={s.secondary} onPress={()=>void refreshDiagnostics()}><Text style={s.secondaryText}>CHECK INSTALLATION AGAIN</Text></Pressable>
        <Pressable accessibilityRole="link" style={s.secondary} onPress={()=>void Linking.openURL(browserUrl('/Kleenest_Production/support'))}><Text style={s.secondaryText}>OPEN SUPPORT</Text></Pressable>
      </View>
    </View>

    <View style={s.card}>
      <Text style={s.kicker}>WHY INSTALL?</Text>
      <Text style={s.cardTitle}>Kleenest stays one tap away.</Text>
      <View style={s.benefits}>
        <Text style={s.benefit}>• Launch from your Home Screen, app launcher or desktop.</Text>
        <Text style={s.benefit}>• Keep the full Explore, route, saved-place and community experience.</Text>
        <Text style={s.benefit}>• Web-compatible updates can arrive without waiting for a new native download.</Text>
        <Text style={s.benefit}>• Native drift is checked automatically before OTA is allowed to publish.</Text>
      </View>
    </View>

    {isAndroid?<View style={s.card}>
      <Text style={s.kicker}>GOOGLE PLAY PACKAGING</Text>
      <Text style={s.cardTitle}>The AAB is for Google Play, not direct installation.</Text>
      <Text style={s.cardBody}>Consumers should install the PWA, verified APK, or eventual Google Play listing rather than downloading the AAB itself.</Text>
    </View>:null}

    <View style={s.card}>
      <Text style={s.kicker}>ONE KLEENEST · EVERY DEVICE</Text>
      <Text style={s.cardTitle}>Phone, tablet or computer — the same Kleenest network.</Text>
      <Text style={s.cardBody}>Search, saved places, routes, community evidence, progression and account data stay connected whether you use the iPhone/iPad web app, Android PWA/APK, desktop PWA, or a store build.</Text>
    </View>
  </ScrollView></SafeAreaView>
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:palette.canvas},
  page:{padding:18,gap:13,paddingBottom:50},
  hero:{backgroundColor:palette.green,borderRadius:24,padding:19,gap:7},
  eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.2,color:'#bed4c6'},
  title:{fontSize:28,lineHeight:32,fontWeight:'900',color:'#fff'},
  body:{fontSize:13,lineHeight:20,color:'#e4efe8'},
  statusRow:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:4},
  status:{alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:'rgba(255,255,255,.12)'},
  statusText:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#fff'},
  heroLink:{alignSelf:'flex-start',marginTop:5,paddingVertical:5},
  heroLinkText:{fontSize:9,fontWeight:'900',letterSpacing:.6,color:'#d9e8df'},
  notice:{borderRadius:14,padding:12,backgroundColor:'#fff7df',borderWidth:1,borderColor:'#ead8a7'},
  noticeText:{fontSize:12,lineHeight:18,fontWeight:'700',color:'#725a1e'},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:19,padding:16,gap:8},
  healthCard:{backgroundColor:'#eef5f0',borderWidth:1,borderColor:'#cbded1',borderRadius:19,padding:16,gap:11},
  healthHeader:{flexDirection:'row',alignItems:'flex-start',gap:10},
  healthGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  healthItem:{minWidth:'47%',flexGrow:1,backgroundColor:'#fff',borderWidth:1,borderColor:'#d8e5dc',borderRadius:12,padding:10},
  healthLabel:{fontSize:8,fontWeight:'900',letterSpacing:.7,color:palette.green},
  healthValue:{fontSize:12,fontWeight:'900',color:palette.ink,marginTop:3},
  releaseBadge:{fontSize:9,fontWeight:'900',letterSpacing:.5,paddingHorizontal:9,paddingVertical:6,borderRadius:999,overflow:'hidden'},
  releaseGood:{backgroundColor:'#dcecdf',color:'#245438'},
  releaseNeutral:{backgroundColor:'#fff7df',color:'#725a1e'},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  cardTitle:{fontSize:20,lineHeight:24,fontWeight:'900',color:palette.ink},
  cardBody:{fontSize:12,lineHeight:18,color:palette.muted},
  primary:{alignSelf:'flex-start',backgroundColor:palette.green,borderRadius:12,paddingHorizontal:14,paddingVertical:11,marginTop:3},
  primaryText:{fontSize:10,fontWeight:'900',letterSpacing:.5,color:'#fff'},
  secondary:{alignSelf:'flex-start',borderRadius:12,paddingHorizontal:12,paddingVertical:9,backgroundColor:'#dfece4'},
  secondaryText:{fontSize:9,fontWeight:'900',color:palette.green},
  buttonRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  help:{fontSize:10,lineHeight:15,color:'#718077'},
  steps:{gap:8,marginTop:3},
  step:{flexDirection:'row',gap:10,alignItems:'flex-start',backgroundColor:'#f4f8f5',borderRadius:13,padding:11},
  stepNumber:{width:24,height:24,borderRadius:12,textAlign:'center',paddingTop:4,overflow:'hidden',backgroundColor:palette.green,color:'#fff',fontSize:10,fontWeight:'900'},
  stepCopy:{flex:1},
  stepTitle:{fontSize:12,fontWeight:'900',color:palette.ink},
  stepBody:{fontSize:10,lineHeight:15,color:palette.muted,marginTop:2},
  benefits:{gap:6},
  benefit:{fontSize:11,lineHeight:17,color:palette.muted,fontWeight:'700'},
});
