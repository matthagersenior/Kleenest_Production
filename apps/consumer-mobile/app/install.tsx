import * as Linking from 'expo-linking';
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { palette } from '../components/ConsumerUI';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const APK_PATH='/Kleenest_Production/Kleenest-Consumer.apk';
const CHECKSUM_PATH='/Kleenest_Production/Kleenest-Consumer.apk.sha256';

function browserUrl(path:string){
  if(typeof window==='undefined')return path;
  return new URL(path,window.location.origin).toString();
}

export default function InstallKleenest(){
  const[prompt,setPrompt]=useState<InstallPromptEvent|null>(null);
  const[installed,setInstalled]=useState(false);
  const[message,setMessage]=useState('');

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

  const environment=useMemo(()=>Platform.OS==='web'?'WEB APP':Platform.OS.toUpperCase(),[]);

  async function installWeb(){
    if(installed){setMessage('Kleenest is already running as an installed web app on this device.');return}
    if(prompt){
      await prompt.prompt();
      const choice=await prompt.userChoice;
      setMessage(choice.outcome==='accepted'?'Installation accepted. Kleenest can now launch like an app.':'Installation was dismissed. You can install again whenever you are ready.');
      if(choice.outcome==='accepted')setPrompt(null);
      return;
    }
    setMessage('Your browser is not exposing the automatic installer right now. Use the browser menu and choose Install app or Add to Home screen.');
  }

  async function downloadApk(){await Linking.openURL(browserUrl(APK_PATH))}
  async function openChecksum(){await Linking.openURL(browserUrl(CHECKSUM_PATH))}

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page}>
    <View style={s.hero}>
      <Text style={s.eyebrow}>KLEENEST · INSTALLATION CENTER</Text>
      <Text style={s.title}>Install Kleenest your way.</Text>
      <Text style={s.body}>Use the lightweight web app, install the verified Android APK directly, or keep using Kleenest in your browser. Your account and canonical Kleenest data stay the same.</Text>
      <View style={s.status}><Text style={s.statusText}>{environment}{installed?' · INSTALLED':''}</Text></View>
    </View>

    {message?<View style={s.notice}><Text style={s.noticeText}>{message}</Text></View>:null}

    <View style={s.card}>
      <Text style={s.kicker}>RECOMMENDED FOR THE WEB</Text>
      <Text style={s.cardTitle}>Install the Kleenest web app</Text>
      <Text style={s.cardBody}>Opens in its own app window, keeps the Kleenest icon on your device, and uses the same installable PWA already published with the Consumer site.</Text>
      <Pressable accessibilityRole="button" style={s.primary} onPress={()=>void installWeb()}><Text style={s.primaryText}>{installed?'WEB APP INSTALLED':'INSTALL WEB APP'}</Text></Pressable>
      {!prompt&&!installed&&Platform.OS==='web'?<Text style={s.help}>On Android Chrome/Edge, the browser may also offer Install app from its menu. On iPhone/iPad Safari, use Share → Add to Home Screen.</Text>:null}
    </View>

    <View style={s.card}>
      <Text style={s.kicker}>ANDROID · DIRECT INSTALL</Text>
      <Text style={s.cardTitle}>Verified Kleenest Android APK</Text>
      <Text style={s.cardBody}>Download the same release APK published from the verified Kleenest Android family build. Android may ask you to allow installation from your browser before installing it.</Text>
      <Pressable accessibilityRole="link" style={s.primary} onPress={()=>void downloadApk()}><Text style={s.primaryText}>DOWNLOAD ANDROID APK</Text></Pressable>
      <Pressable accessibilityRole="link" style={s.secondary} onPress={()=>void openChecksum()}><Text style={s.secondaryText}>VIEW SHA-256 CHECKSUM</Text></Pressable>
    </View>

    <View style={s.card}>
      <Text style={s.kicker}>WHAT IS AN AAB?</Text>
      <Text style={s.cardTitle}>Google Play uses the AAB; people install the app it produces.</Text>
      <Text style={s.cardBody}>Kleenest also builds a production Android App Bundle for Google Play. The AAB is a store publishing artifact, not the file consumers should download directly.</Text>
    </View>

    <View style={s.card}>
      <Text style={s.kicker}>SAME KLEENEST NETWORK</Text>
      <Text style={s.cardTitle}>Web or native, your experience stays connected.</Text>
      <Text style={s.cardBody}>Search, saved places, routes, community evidence, progression and account data remain backed by the same Kleenest platform authority.</Text>
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
});
