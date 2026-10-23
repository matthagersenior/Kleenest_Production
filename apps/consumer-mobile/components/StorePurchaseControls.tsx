import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { captureGuestMonetizationEvent } from '../services/guestMonetization';
import { useConsumerTheme } from '../services/theme';

export function StorePurchaseControls({entitled}:{entitled:boolean;onEntitlementChanged:()=>Promise<void>|void}){
  const theme=useConsumerTheme();
  function showInstallOptions(){
    captureGuestMonetizationEvent('upgrade_intent',null,null,'web_membership');
    router.push('/install');
  }
  return <View style={[s.wrap,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[s.title,{color:theme.ink}]}>{entitled?'Remove Ads is active':'Remove Google/network ads · $5 once'}</Text>
    <Text style={[s.body,{color:theme.muted}]}>{entitled?'Google/network ads are removed. Kleenest Sponsored recommendations remain.':'Web browsers and installed PWAs cannot complete this native store purchase. Sign in to a supported Kleenest Android or iPhone app to purchase or restore Remove Ads. Installation by itself does not remove ads.'}</Text>
    {!entitled?<Pressable accessibilityRole="button" accessibilityLabel="See Kleenest installation options" onPress={showInstallOptions} style={[s.button,{backgroundColor:theme.accent}]}>
      <Text style={[s.buttonText,{color:theme.accentText}]}>See installation options →</Text>
    </Pressable>:null}
  </View>;
}
const s=StyleSheet.create({wrap:{marginTop:8,borderWidth:1,borderRadius:14,padding:12,gap:8},title:{fontSize:14,fontWeight:'900'},body:{fontSize:12,lineHeight:18,fontWeight:'700'},button:{minHeight:44,borderRadius:10,padding:12,alignItems:'center',justifyContent:'center'},buttonText:{fontWeight:'900',fontSize:12}});
