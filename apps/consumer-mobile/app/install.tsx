import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { palette } from '../components/ConsumerUI';
import { markConsumerAppPresence } from '../services/webExperience';
import { useConsumerTheme } from '../services/theme';

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
const APP_PATH='/Kleenest_Production/?app=1';
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

function InstallStep({number,title,body}:{number:string;title:string;body:string}){
  const theme=useConsumerTheme();
  return <View style={[s.step,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[s.stepNumber,{backgroundColor:theme.accent,color:theme.accentText}]}>{number}</Text>
    <View style={s.stepCopy}>
      <Text style={[s.stepTitle,{color:theme.ink}]}>{title}</Text>
      <Text style={[s.stepBody,{color:theme.muted}]}>{body}</Text>
    </View>
  </View>
}

function AppleInstallSteps(){
  const theme=useConsumerTheme();
  return <View style={s.guidance}>
    <Text style={[s.guidanceIntro,{color:theme.ink}]}>If you have never installed a web app before, follow these steps exactly. Nothing here changes your Apple ID or installs an APK.</Text>
    <View style={s.steps}>
      <InstallStep number="1" title="Open this Installation Center in Safari" body="On iPhone or iPad, Safari is the reliable install path. If you are reading this in another browser, copy this page address, open Safari, paste it into the address bar, and return to this page."/>
      <InstallStep number="2" title="Tap Safari’s Share button" body="Look for the square with an upward arrow. It is usually at the bottom of the screen on iPhone and near the top on iPad."/>
      <InstallStep number="3" title="Choose Add to Home Screen" body="Scroll down in the Share sheet until you see Add to Home Screen. If it is hidden, scroll farther down rather than choosing Add Bookmark."/>
      <InstallStep number="4" title="Confirm the web-app option" body="On newer iOS versions, keep Open as Web App enabled if that switch is shown. Leave the name as Kleenest unless you specifically want to rename the icon."/>
      <InstallStep number="5" title="Tap Add" body="Tap Add in the upper-right corner. Safari will close the install sheet and place a Kleenest icon on your Home Screen."/>
      <InstallStep number="6" title="Find Kleenest after installation" body="Return to your Home Screen, look for the Kleenest icon, and tap it. It should open in its own app-style window instead of a normal Safari tab."/>
    </View>
  </View>
}

function WebInstallSteps({deviceKind,browserKind}:{deviceKind:DeviceKind;browserKind:BrowserKind}){
  const theme=useConsumerTheme();
  const desktop=deviceKind==='desktop';
  const menuInstruction=browserKind==='opera'
    ? 'Open Opera’s menu and choose Install app or Add to Home screen. The exact wording can vary slightly by Opera version.'
    : browserKind==='samsung'
      ? 'Open Samsung Internet’s menu, choose Add page to, then choose Home screen.'
      : browserKind==='edge'
        ? (desktop?'Open the three-dot menu, choose Apps, then Install this site as an app.':'Open Edge’s menu and choose Add to phone, Add to Home screen, or Install app when offered.')
        : browserKind==='firefox'
          ? (desktop?'Firefox desktop may not offer full PWA installation. Open this same Installation Center link in Chrome or Edge, then use their Install app option.':'Open Firefox’s menu and choose Add to Home screen when that option is available.')
          : browserKind==='chrome'
            ? (desktop?'Open Chrome’s three-dot menu and choose Install page as app, Install Kleenest, or the install icon in the address bar.':'Open Chrome’s three-dot menu and choose Add to Home screen or Install app.')
            : 'Open your browser menu and look for Install app, Add to Home Screen, Add to phone, or Install this site as an app.';
  const installedLocation=desktop
    ? 'Open your computer’s Start menu, Applications folder, browser app launcher, taskbar, or dock and look for Kleenest.'
    : 'Return to your Android Home Screen or open the app drawer and look for the Kleenest icon.';
  return <View style={s.guidance}>
    <Text style={[s.guidanceIntro,{color:theme.ink}]}>If you have never installed a web app before, use this checklist from top to bottom. A web app is the Kleenest website saved as an app icon; it does not require an APK.</Text>
    <View style={s.steps}>
      <InstallStep number="1" title="Stay on this Installation Center page" body="Do not download anything for the web-app method. Keep this page open in your browser while you follow the next steps."/>
      <InstallStep number="2" title="Try the green INSTALL WEB APP button" body="Tap or click INSTALL WEB APP above. If your browser shows an Install confirmation, choose Install. If nothing appears, continue to step 3."/>
      <InstallStep number="3" title="If you do not see an Install option" body={menuInstruction}/>
      <InstallStep number="4" title="Confirm the installation" body="When the browser asks for confirmation, choose Install, Add, or Add to Home Screen. You do not need to create a new Kleenest account to install it."/>
      <InstallStep number="5" title="Find Kleenest after installation" body={installedLocation}/>
      <InstallStep number="6" title="If it still will not install" body="Refresh this page once and check Install Health above. Secure Web and PWA Shell should show READY. On desktop Firefox, use Chrome or Edge for the install. You can always use Kleenest in the browser without installing it."/>
    </View>
  </View>
}

function AndroidApkInstallSteps(){
  const theme=useConsumerTheme();
  return <View style={s.guidance}>
    <Text style={[s.guidanceIntro,{color:theme.ink}]}>The APK is the native Android installer. These steps are for an Android phone or tablet. iPhone, iPad, Windows, and Mac cannot install an Android APK directly.</Text>
    <View style={s.steps}>
      <InstallStep number="1" title="Tap DOWNLOAD ANDROID APK" body="Your browser downloads the file named Kleenest-Consumer.apk directly from this Installation Center."/>
      <InstallStep number="2" title="Accept the browser download warning if Android shows one" body="Android may warn that APK files can be harmful because this installer is outside Google Play. Continue only when the address is matthagersenior.github.io/Kleenest_Production and the file name is Kleenest-Consumer.apk."/>
      <InstallStep number="3" title="Open the downloaded APK" body="When the download finishes, tap the download notification. If you dismissed it, open your browser’s Downloads list or the Files app, open Downloads, and tap Kleenest-Consumer.apk."/>
      <InstallStep number="4" title="Allow this source if Android asks" body="If Android says your browser or Files app is not allowed to install unknown apps, tap Settings, turn on Allow from this source for the app you used to open the APK, then go back to the installer."/>
      <InstallStep number="5" title="Tap Install, then Open" body="Android will show the Kleenest install screen. Tap Install. When it finishes, tap Open or find Kleenest in your app drawer."/>
      <InstallStep number="6" title="Optional: turn the temporary permission back off" body="After Kleenest is installed, you can return to Android Settings and turn Allow from this source back off for the browser or Files app."/>
    </View>
  </View>
}

export default function InstallKleenest(){
  const theme=useConsumerTheme();
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
    const installedHandler=()=>{markConsumerAppPresence();setInstalled(true);setPrompt(null);setMessage('Kleenest is installed on this device.');};
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
      if(choice.outcome==='accepted'){markConsumerAppPresence();setPrompt(null);}
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

  async function copyApkLink(){
    const url=browserUrl(APK_PATH);
    if(Platform.OS==='web'&&typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
      try{await navigator.clipboard.writeText(url);setMessage('Direct APK link copied.');return}catch{}
    }
    setMessage(`Direct APK link: ${url}`);
  }

  async function downloadApk(){await Linking.openURL(browserUrl(APK_PATH))}
  async function openChecksum(){await Linking.openURL(browserUrl(CHECKSUM_PATH))}
  async function openKleenest(){await Linking.openURL(browserUrl(APP_PATH))}
  function continueAsGuest(){router.push('/?app=1' as any)}
  function joinKleenest(){router.push('/signup' as any)}
  function signIn(){router.push('/profile' as any)}

  const releaseStatus=releaseLoading?'CHECKING':releaseState?.status||'STATUS UNAVAILABLE';
  const releaseGood=releaseState?.otaCompatible===true&&!releaseState?.nativeDrift;
  const hostedApkUrl=browserUrl(APK_PATH);

  return <SafeAreaView style={[s.safe,{backgroundColor:theme.canvas}]}><ScrollView contentContainerStyle={s.page}>
    <View style={[s.hero,{backgroundColor:theme.accent}]}>
      <Text style={[s.eyebrow,{color:theme.accentText,opacity:.78}]}>KLEENEST · UNIVERSAL INSTALLATION CENTER</Text>
      <Text style={[s.title,{color:theme.accentText}]}>{isIOS?'Put Kleenest on your iPhone or iPad.':isAndroid?'Install Kleenest on Android.':'Install Kleenest like an app.'}</Text>
      <Text style={[s.body,{color:theme.accentText,opacity:.88}]}>{isIOS?'No App Store download is required for the web app. Add Kleenest to your Home Screen and it opens in its own app-style window.':isAndroid?'Choose the installable web app or the verified Android APK. Both use the same Kleenest account and network.':'Install the Kleenest PWA from a supported browser and launch it from your desktop or app launcher.'}</Text>
      <View style={s.statusRow}>
        <View style={[s.status,{backgroundColor:theme.accentSoft}]}><Text style={[s.statusText,{color:theme.accentText}]}>{environment}{installed?' · INSTALLED':''}</Text></View>
        <View style={[s.status,{backgroundColor:theme.accentSoft}]}><Text style={[s.statusText,{color:theme.accentText}]}>{browserLabel(browserKind).toUpperCase()}</Text></View>
      </View>
      <Pressable accessibilityRole="link" style={s.heroLink} onPress={()=>void Linking.openURL(browserUrl(ROOT_PATH))}><Text style={[s.heroLinkText,{color:theme.accentText}]}>← BACK TO KLEENEST SITE</Text></Pressable>
    </View>

    {message?<View style={[s.notice,{backgroundColor:theme.surfaceRaised,borderColor:theme.warning}]}><Text style={[s.noticeText,{color:theme.warning}]}>{message}</Text></View>:null}

    <View style={[s.continueCard,{backgroundColor:theme.surface,borderColor:theme.accent}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>NO INSTALL REQUIRED</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Use Kleenest right now.</Text>
      <Text style={[s.cardBody,{color:theme.muted}]}>If this browser cannot install the web app, installation is optional. Continue into the full consumer experience as a guest, create an account, or sign in with an existing Kleenest account.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Continue to Kleenest as a guest" style={[s.primary,{backgroundColor:theme.accent}]} onPress={continueAsGuest}><Text style={[s.primaryText,{color:theme.accentText}]}>CONTINUE AS GUEST</Text></Pressable>
      <View style={s.buttonRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Join Kleenest" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={joinKleenest}><Text style={[s.secondaryText,{color:theme.accent}]}>JOIN KLEENEST</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign in to Kleenest" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={signIn}><Text style={[s.secondaryText,{color:theme.accent}]}>SIGN IN</Text></Pressable>
      </View>
      <Text style={[s.help,{color:theme.muted}]}>Guest mode does not require an account. Join or sign in whenever you want synced saved places, routes, community identity, progression and other account-backed features.</Text>
    </View>

    <View style={[s.healthCard,{backgroundColor:theme.accentSoft,borderColor:theme.line}]}>
      <View style={s.healthHeader}><View style={{flex:1}}><Text style={[s.kicker,{color:theme.accent}]}>INSTALL HEALTH</Text><Text style={[s.cardTitle,{color:theme.ink}]}>Is this device ready?</Text></View><Text style={[s.releaseBadge,releaseGood?[s.releaseGood,{backgroundColor:theme.accentSoft,color:theme.success}]:[s.releaseNeutral,{backgroundColor:theme.surfaceRaised,color:theme.warning}]]}>{releaseStatus}</Text></View>
      <View style={s.healthGrid}>
        <View style={[s.healthItem,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.healthLabel,{color:theme.accent}]}>SECURE WEB</Text><Text style={[s.healthValue,{color:theme.ink}]}>{secureContext?'READY':'CHECK BROWSER'}</Text></View>
        <View style={[s.healthItem,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.healthLabel,{color:theme.accent}]}>PWA SHELL</Text><Text style={[s.healthValue,{color:theme.ink}]}>{serviceWorkerReady?'READY':'LOADING'}</Text></View>
        <View style={[s.healthItem,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.healthLabel,{color:theme.accent}]}>INSTALL MODE</Text><Text style={[s.healthValue,{color:theme.ink}]}>{installed?'INSTALLED':prompt?'ONE TAP':'MANUAL READY'}</Text></View>
        <View style={[s.healthItem,{backgroundColor:theme.surface,borderColor:theme.line}]}><Text style={[s.healthLabel,{color:theme.accent}]}>APK BASELINE</Text><Text style={[s.healthValue,{color:theme.ink}]}>{releaseState?.baselineSha?.slice(0,8)||'CHECKING'}</Text></View>
      </View>
      <Text style={[s.help,{color:theme.muted}]}>{releaseGood?'Web, OTA and the verified APK baseline are compatible.':'Kleenest checks release alignment here so a web/OTA update cannot silently outrun required native changes.'}</Text>
      <View style={s.buttonRow}>
        <Pressable accessibilityRole="button" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void refreshDiagnostics()}><Text style={[s.secondaryText,{color:theme.accent}]}>CHECK INSTALLATION</Text></Pressable>
        <Pressable accessibilityRole="button" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void shareInstall()}><Text style={[s.secondaryText,{color:theme.accent}]}>SHARE INSTALL LINK</Text></Pressable>
        <Pressable accessibilityRole="link" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void openKleenest()}><Text style={[s.secondaryText,{color:theme.accent}]}>OPEN KLEENEST</Text></Pressable>
      </View>
    </View>

    {isIOS?<View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>IPHONE + IPAD · WEB APP</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Install Kleenest from Safari</Text>
      <Text style={[s.cardBody,{color:theme.muted}]}>This is the iPhone/iPad browser-app version of Kleenest. It gets a Home Screen icon and can open without Safari chrome, much like a normal app.</Text>
      <AppleInstallSteps/>
      <Pressable accessibilityRole="button" style={[s.primary,{backgroundColor:theme.accent}]} onPress={()=>void installWeb()}><Text style={[s.primaryText,{color:theme.accentText}]}>{installed?'WEB APP INSTALLED':'SHOW IPHONE / IPAD INSTALL STEPS'}</Text></Pressable>
      <Text style={[s.help,{color:theme.muted}]}>{browserHelp}</Text>
    </View>:null}

    {!isIOS?<View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>{isAndroid?'ANDROID · WEB APP':'BROWSER APP'}</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Install the Kleenest web app</Text>
      <Text style={[s.cardBody,{color:theme.muted}]}>Recommended for most people. A web app is the Kleenest website saved to your device like an app: it gets its own icon, opens in an app-style window, updates quickly, and uses the same Kleenest account and network.</Text>
      <Pressable accessibilityRole="button" style={[s.primary,{backgroundColor:theme.accent}]} onPress={()=>void installWeb()}><Text style={[s.primaryText,{color:theme.accentText}]}>{installed?'WEB APP INSTALLED':'INSTALL WEB APP'}</Text></Pressable>
      {!installed?<Text style={[s.help,{color:theme.muted}]}>{prompt?'Your browser is ready for a one-tap install.':browserHelp}</Text>:null}
      <WebInstallSteps deviceKind={deviceKind} browserKind={browserKind}/>
    </View>:null}

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>ANDROID APK · DIRECT DOWNLOAD</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Download the native Android APK directly from this Installation Center.</Text>
      <Text style={[s.cardBody,{color:theme.muted}]}>{isAndroid?'This is the verified native Android package. Use it when you want the installed Android app instead of the web app.':'The APK is always available here even when you open the Installation Center on a computer or iPhone. Download or copy the link, then open it on the Android phone or tablet where you want Kleenest installed.'}</Text>
      <View style={[s.directLinkBox,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
        <Text style={[s.directLinkLabel,{color:theme.accent}]}>DIRECT APK FILE</Text>
        <Text selectable style={[s.directLink,{color:theme.ink}]}>{hostedApkUrl}</Text>
      </View>
      <View style={s.buttonRow}>
        <Pressable accessibilityRole="link" accessibilityLabel="Download Android APK" style={[s.primary,{backgroundColor:theme.accent}]} onPress={()=>void downloadApk()}><Text style={[s.primaryText,{color:theme.accentText}]}>DOWNLOAD ANDROID APK</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Copy APK link" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void copyApkLink()}><Text style={[s.secondaryText,{color:theme.accent}]}>COPY APK LINK</Text></Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="View SHA-256 checksum" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void openChecksum()}><Text style={[s.secondaryText,{color:theme.accent}]}>VIEW SHA-256 CHECKSUM</Text></Pressable>
      </View>
      <Text style={[s.help,{color:theme.muted}]}>The published file is Kleenest-Consumer.apk. The checksum link lets advanced users verify the exact downloaded file; beginners can simply follow the numbered Android steps below.</Text>
      <AndroidApkInstallSteps/>
    </View>

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>IF INSTALLATION DOESN'T WORK</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Use the easy recovery path.</Text>
      <Text style={[s.cardBody,{color:theme.muted}]}>Most install problems are browser-menu or stale-shortcut issues. These steps are safe and do not require changing your Kleenest account.</Text>
      <View style={s.steps}>
        <View style={[s.step,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.stepNumber,{backgroundColor:theme.accent,color:theme.accentText}]}>1</Text><View style={s.stepCopy}><Text style={[s.stepTitle,{color:theme.ink}]}>Check the browser instructions above</Text><Text style={[s.stepBody,{color:theme.muted}]}>{browserHelp}</Text></View></View>
        <View style={[s.step,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.stepNumber,{backgroundColor:theme.accent,color:theme.accentText}]}>2</Text><View style={s.stepCopy}><Text style={[s.stepTitle,{color:theme.ink}]}>Run Install Health again</Text><Text style={[s.stepBody,{color:theme.muted}]}>Secure Web and PWA Shell should show READY. If the shell still says LOADING, refresh this page once and check again.</Text></View></View>
        <View style={[s.step,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.stepNumber,{backgroundColor:theme.accent,color:theme.accentText}]}>3</Text><View style={s.stepCopy}><Text style={[s.stepTitle,{color:theme.ink}]}>Remove an old shortcut if it behaves strangely</Text><Text style={[s.stepBody,{color:theme.muted}]}>If an older Kleenest shortcut only opens a browser tab or looks stale, remove that shortcut and install again from this page.</Text></View></View>
        <View style={[s.step,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}><Text style={[s.stepNumber,{backgroundColor:theme.accent,color:theme.accentText}]}>4</Text><View style={s.stepCopy}><Text style={[s.stepTitle,{color:theme.ink}]}>Android has a second path</Text><Text style={[s.stepBody,{color:theme.muted}]}>The web app is recommended for most people. The direct Android APK is also always available above, even if you opened this page on another device.</Text></View></View>
      </View>
      <View style={s.buttonRow}>
        <Pressable accessibilityRole="button" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void refreshDiagnostics()}><Text style={[s.secondaryText,{color:theme.accent}]}>CHECK INSTALLATION AGAIN</Text></Pressable>
        <Pressable accessibilityRole="link" style={[s.secondary,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]} onPress={()=>void Linking.openURL(browserUrl('/Kleenest_Production/support'))}><Text style={[s.secondaryText,{color:theme.accent}]}>OPEN SUPPORT</Text></Pressable>
      </View>
    </View>

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>WHY INSTALL?</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Kleenest stays one tap away.</Text>
      <View style={s.benefits}>
        <Text style={[s.benefit,{color:theme.muted}]}>• Launch from your Home Screen, app launcher or desktop.</Text>
        <Text style={[s.benefit,{color:theme.muted}]}>• Keep the full Explore, route, saved-place and community experience.</Text>
        <Text style={[s.benefit,{color:theme.muted}]}>• Web-compatible updates can arrive without waiting for a new native download.</Text>
        <Text style={[s.benefit,{color:theme.muted}]}>• Native drift is checked automatically before OTA is allowed to publish.</Text>
      </View>
    </View>

    {isAndroid?<View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>GOOGLE PLAY PACKAGING</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>The AAB is for Google Play, not direct installation.</Text>
      <Text style={[s.cardBody,{color:theme.muted}]}>Consumers should install the PWA, verified APK, or eventual Google Play listing rather than downloading the AAB itself.</Text>
    </View>:null}

    <View style={[s.card,{backgroundColor:theme.surface,borderColor:theme.line}]}>
      <Text style={[s.kicker,{color:theme.accent}]}>ONE KLEENEST · EVERY DEVICE</Text>
      <Text style={[s.cardTitle,{color:theme.ink}]}>Phone, tablet or computer — the same Kleenest network.</Text>
      <Text style={[s.cardBody,{color:theme.muted}]}>Search, saved places, routes, community evidence, progression and account data stay connected whether you use the iPhone/iPad web app, Android PWA/APK, desktop PWA, or a store build.</Text>
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
  continueCard:{backgroundColor:'#f4faf6',borderWidth:2,borderColor:'#bfd8c7',borderRadius:19,padding:16,gap:10},
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
  guidance:{gap:8,marginTop:4},
  guidanceIntro:{fontSize:11,lineHeight:17,fontWeight:'800',color:palette.ink},
  directLinkBox:{borderWidth:1,borderRadius:12,padding:10,gap:4},
  directLinkLabel:{fontSize:8,fontWeight:'900',letterSpacing:.7,color:palette.green},
  directLink:{fontSize:10,lineHeight:15,fontWeight:'700',color:palette.ink},
  steps:{gap:8,marginTop:3},
  step:{flexDirection:'row',gap:10,alignItems:'flex-start',backgroundColor:'#f4f8f5',borderRadius:13,padding:11},
  stepNumber:{width:24,height:24,borderRadius:12,textAlign:'center',paddingTop:4,overflow:'hidden',backgroundColor:palette.green,color:'#fff',fontSize:10,fontWeight:'900'},
  stepCopy:{flex:1},
  stepTitle:{fontSize:12,fontWeight:'900',color:palette.ink},
  stepBody:{fontSize:10,lineHeight:15,color:palette.muted,marginTop:2},
  benefits:{gap:6},
  benefit:{fontSize:11,lineHeight:17,color:palette.muted,fontWeight:'700'},
});
