import { StyleSheet,Text,View } from 'react-native';
import { useConsumerTheme } from '../services/theme';

export function StorePurchaseControls({entitled}:{entitled:boolean;onEntitlementChanged:()=>Promise<void>|void}){
  const theme=useConsumerTheme();
  return <View style={[s.wrap,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[s.title,{color:theme.ink}]}>{entitled?'Remove Ads is active':'Remove Ads is purchased in the mobile app'}</Text>
    <Text style={[s.body,{color:theme.muted}]}>{entitled?'Google/network ads are removed. Kleenest Sponsored recommendations remain.':'Open Kleenest on Android or iPhone to buy the $5 one-time Remove Ads upgrade or restore a previous store purchase.'}</Text>
  </View>;
}
const s=StyleSheet.create({wrap:{marginTop:8,borderWidth:1,borderRadius:14,padding:12,gap:5},title:{fontSize:14,fontWeight:'900'},body:{fontSize:11,lineHeight:16,fontWeight:'700'}});
