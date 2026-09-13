import * as Linking from 'expo-linking';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { palette } from '../components/ConsumerUI';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
type DeviceKind='ios'|'android'|'desktop'|'other';

const APK_PATH='/Kleenest_Production/Kleenest-Consumer.apk';
const CHECKSUM_PATH='/Kleenest_Production/Kleenest-Consumer.apk.sha256';

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
  const deviceKind=useMemo(()=>detectDeviceKind(),[]);
  const isIOS=deviceKind==='ios';
  const isAndroid=deviceKind==='android';
  const isDesktop=deviceKind==='desktop';

  useEffect(()=>{
    if(Platform.OS!=='web'||typeof window==='undefined')return;
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches||Boolean((navigator as any).standalone);
    setInstalled(Boolean(standalone));
    const capture=(event:Event)=>{
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const installedHandler=()=>{setInstalled(true);setPrompt(null);setMessage('Kleenest is installed on this device.');};
    window.addEventListener('beforeinstallprompt',capture);
    window.addEventListener('appinstalled',installedHandler);
    return()=>{window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',installedHandler);};
  },[]);

  const environment=useMemo(()=>{
    if(isIOS)return'IPHONE / IPAD';
    if(isAndroid)return'ANDROID';
    if(isDesktop)return'DESKTOP WEB';
    return Platform.OS==='web'?'WEB APP':Platform.OS.toUpperCase();
  },[isAndroid,isDesktop,isIOS]);

  async function installWeb(){
    if(installed){setMessage('Kleenest is already running as an installed web app on this device.');return}
    if(isIOS){
      setMessage('On iPhone or iPad, install Kleenest from Safari: Share → Add to Home Screen → keep Open as Web App enabled → Add.');
      return;
    }
    if(prompt){
      await prompt.prompt();
      const choice=await prompt.userChoice;
      setMessage(choice.outcome==='accepted'?'Installation accepted. Kleenest can now launch like an app.':'Installation was dismissed. You can install again whenever you are ready.');
      if(choice.outcome==='accepted')setPrompt(null);
      return;
    }
    setMessage('Your browser is not exposing the automatic installer right now. Use the browser menu and choose Install app or Add to Home Screen.');
  }

  async function downloadApk(){await Linking.openURL(browserUrl(APK_PATH))}
  async function openChecksum(){await Linking.openURL(browserUrl(CHECKSUM_PATH))}

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <View style={s.hero}>
      <Text style={s.eyebrow}>KLEENEST · UNIVERSAL INSTALLATION CENTER</Text>
      <Text style={s.title}>{isIOS?'Put Kleenest on your iPhone or iPad.':isAndroid?'Install Kleenest on Android.':'Install Kleenest like an app.'}</Text>
      <Text style={s.body}>{isIOS?'No App Store download is required for the web app. Add Kleenest to your Home Screen and it opens in its own app-style window.':isAndroid?'Choose the installable web app or the verified Android APK. Both use the same Kleenest account and network.':'Install the Kleenest PWA from a supported browser and launch it from your desktop or app launcher.'}</Text>
      <View style={s.status}><Text style={s.statusText}>{environment}{installed?' · INSTALLED':''}</Text></View>
    </View>

    {message?<View style={s.notice}><Text style={s.noticeText}>{message}</Text></View>:null}

    {isIOS?<View style={s.card}>
      <Text style={s.kicker}>IPHONE + IPAD · WEB APP</Text>
      <Text style={s.cardTitle}>Install Kleenest from Safari</Text>
      <Text style={s.cardBody}>This is the iPhone/iPad browser-app version of Kleenest. It gets a Home Screen icon and can open without Safari chrome, much like a normal app.</Text>
      <AppleInstallSteps/>
      <Pressable accessibilityRole="button" style={s.primary} onPress={()=>void installWeb()}><Text style={s.primaryText}>{installed?'WEB APP INSTALLED':'SHOW IPHONE / IPAD INSTALL STEPS'}</Text></Pressable>
      <Text style={s.help}>If you opened this page in another browser, open the same /install address in Safari for the most predictable Apple installation flow.</Text>
    </View>:null}

    {!isIOS?<View style={s.card}>
      <Text style={s.kicker}>{isAndroid?'ANDROID · WEB APP':'BROWSER APP'}</Text>
      <Text style={s.cardTitle}>Install the Kleenest web app</Text>
      <Text style={s.cardBody}>Opens in its own app window, keeps the Kleenest icon on your device, and uses the same installable PWA published with the Consumer site.</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={()=>void installWeb()}><Text style={s.primaryText}>{installed?'WEB APP INSTALLED':'INSTALL WEB APP'}</Text></Pressable>
      {!prompt&&!installed&&Platform.OS==='web'?<Text style={s.help}>{isAndroid?'If your browser does not show the prompt, open its menu and choose Install app or Add to Home Screen.':'If your browser does not show the prompt, look for Install Kleenest or Install app in the address bar or browser menu.'}</Text>:null}
    </View>:null}

    {isAndroid?<View style={s.card}>
      <Text style={s.kicker}>ANDROID · DIRECT INSTALL</Text>
      <Text style={s.cardTitle}>Verified Kleenest Android APK</Text>
      <Text style={s.cardBody}>Prefer a native Android package? Download the release APK produced by the verified Kleenest Android family build. Android may ask you to allow installation from your browser first.</Text>
      <Pressable accessibilityRole="link" style={s.primary} onPress={()=>void downloadApk()}><Text style={s.primaryText}>DOWNLOAD ANDROID APK</Text></Pressable>
      <Pressable accessibilityRole="link" style={s.secondary} onPress={()=>void openChecksum()}><Text style={s.secondaryText}>VIEW SHA-256 CHECKSUM</Text></Pressable>
    </View>:null}

    {isAndroid?<View style={s.card}>
      <Text style={s.kicker}>GOOGLE PLAY PACKAGING</Text>
      <Text style={s.cardTitle}>The AAB is for Google Play, not direct installation.</Text>
      <Text style={s.cardBody}>Kleenest also builds a production Android App Bundle. Consumers should install the PWA, APK, or eventual Google Play listing rather than downloading the AAB itself.</Text>
    </View>:null}

    <View style={s.card}>
      <Text style={s.kicker}>ONE KLEENEST · EVERY DEVICE</Text>
      <Text style={s.cardTitle}>Phone, tablet or computer — the same Kleenest network.</Text>
      <Text style={s.cardBody}>Search, saved places, routes, community evidence, progression and account data stay connected whether you use the iPhone/iPad web app, Android PWA/APK, desktop PWA, or a future store build.</Text>
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
  status:{alignSelf:'flex-start',marginTop:4,paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:'rgba(255,255,255,.12)'},
  statusText:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#fff'},
  notice:{borderRadius:14,padding:12,backgroundColor:'#fff7df',borderWidth:1,borderColor:'#ead8a7'},
  noticeText:{fontSize:12,lineHeight:18,fontWeight:'700',color:'#725a1e'},
  card:{backgroundColor:'#fff',borderWidth:1,borderColor:palette.line,borderRadius:19,padding:16,gap:8},
  kicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:palette.green},
  cardTitle:{fontSize:20,lineHeight:24,fontWeight:'900',color:palette.ink},
  cardBody:{fontSize:12,lineHeight:18,color:palette.muted},
  primary:{alignSelf:'flex-start',backgroundColor:palette.green,borderRadius:12,paddingHorizontal:14,paddingVertical:11,marginTop:3},
  primaryText:{fontSize:10,fontWeight:'900',letterSpacing:.5,color:'#fff'},
  secondary:{alignSelf:'flex-start',borderRadius:12,paddingHorizontal:12,paddingVertical:9,backgroundColor:'#edf3ef'},
  secondaryText:{fontSize:9,fontWeight:'900',color:palette.green},
  help:{fontSize:10,lineHeight:15,color:'#718077'},
  steps:{gap:8,marginTop:3},
  step:{flexDirection:'row',gap:10,alignItems:'flex-start',backgroundColor:'#f4f8f5',borderRadius:13,padding:11},
  stepNumber:{width:24,height:24,borderRadius:12,textAlign:'center',paddingTop:4,overflow:'hidden',backgroundColor:palette.green,color:'#fff',fontSize:10,fontWeight:'900'},
  stepCopy:{flex:1},
  stepTitle:{fontSize:12,fontWeight:'900',color:palette.ink},
  stepBody:{fontSize:10,lineHeight:15,color:palette.muted,marginTop:2},
});
