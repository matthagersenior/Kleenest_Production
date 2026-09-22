import { useEffect,useState } from 'react';
import { Pressable,StyleSheet,Text,View } from 'react-native';
import { useIAP,type Purchase } from 'expo-iap';
import { useConsumerTheme } from '../services/theme';
import { buildRemoveAdsPurchaseRequest,REMOVE_ADS_PRODUCT_ID,restoreRemoveAdsPurchases,verifyAndFinishRemoveAdsPurchase } from '../services/storePurchases';

export function StorePurchaseControls({entitled,onEntitlementChanged}:{entitled:boolean;onEntitlementChanged:()=>Promise<void>|void}){
  const theme=useConsumerTheme();
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState('');

  async function finalize(purchase:Purchase){
    if(String(purchase.productId||'')!==REMOVE_ADS_PRODUCT_ID)return;
    setBusy(true);setMessage('Verifying purchase…');
    try{
      await verifyAndFinishRemoveAdsPurchase(purchase);
      await onEntitlementChanged();
      setMessage('Purchase verified. Google/network ads are removed for this account. Kleenest Sponsored recommendations remain.');
    }catch(error:any){
      setMessage(error?.message||'The purchase completed but could not be verified yet. Use Restore purchase to retry.');
    }finally{setBusy(false)}
  }

  const{connected,fetchProducts,requestPurchase}=useIAP({
    onPurchaseSuccess:(purchase)=>{void finalize(purchase)},
    onPurchaseError:(error:any)=>{
      const code=String(error?.code||'').toLowerCase();
      if(code.includes('cancel'))setMessage('Purchase cancelled.');
      else setMessage(error?.message||'The store could not complete the purchase.');
      setBusy(false);
    },
    onError:(error)=>{if(!busy)setMessage(error?.message||'Store connection unavailable.')},
  });

  useEffect(()=>{if(connected)void fetchProducts({skus:[REMOVE_ADS_PRODUCT_ID],type:'in-app'}).catch(()=>{})},[connected]);

  async function buy(){
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      const request=await buildRemoveAdsPurchaseRequest();
      await requestPurchase({request,type:'in-app'});
    }catch(error:any){
      setBusy(false);
      setMessage(error?.message||'The store could not start the purchase.');
    }
  }

  async function restore(){
    if(busy)return;
    setBusy(true);setMessage('Checking your store account…');
    try{
      const count=await restoreRemoveAdsPurchases();
      if(count){
        await onEntitlementChanged();
        setMessage('Purchase restored. Google/network ads are removed for this account.');
      }else setMessage('No previous Remove Ads purchase was found for this store account.');
    }catch(error:any){
      setMessage(error?.message||'Your purchase could not be restored.');
    }finally{setBusy(false)}
  }

  return <View style={[s.wrap,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[s.title,{color:theme.ink}]}>{entitled?'Remove Ads is active':'Remove Google/network ads forever'}</Text>
    <Text style={[s.body,{color:theme.muted}]}>{entitled?'Google/AdMob network ads are suppressed for this account. Kleenest Sponsored recommendations still appear where relevant.':'$5 one-time. Google Play or Apple handles the purchase and Kleenest verifies it before activation. Kleenest Sponsored recommendations are separate and remain.'}</Text>
    {!entitled?<View style={s.actions}><Pressable accessibilityRole="button" accessibilityLabel="Buy Remove Ads for five dollars" disabled={busy||!connected} onPress={()=>void buy()} style={[s.primary,{backgroundColor:theme.accent},(busy||!connected)&&s.disabled]}><Text style={[s.primaryText,{color:theme.accentText}]}>{busy?'Working…':'Buy for $5'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Restore Remove Ads purchase" disabled={busy||!connected} onPress={()=>void restore()} style={[s.secondary,{backgroundColor:theme.surface,borderColor:theme.line},(busy||!connected)&&s.disabled]}><Text style={[s.secondaryText,{color:theme.accent}]}>Restore purchase</Text></Pressable></View>:<Pressable accessibilityRole="button" accessibilityLabel="Restore Remove Ads purchase" disabled={busy||!connected} onPress={()=>void restore()} style={[s.secondary,{backgroundColor:theme.surface,borderColor:theme.line},(busy||!connected)&&s.disabled]}><Text style={[s.secondaryText,{color:theme.accent}]}>Restore purchase</Text></Pressable>}
    {!connected&&!entitled?<Text style={[s.status,{color:theme.muted}]}>Connecting to the app store…</Text>:null}
    {message?<Text accessibilityRole="alert" style={[s.status,{color:theme.muted}]}>{message}</Text>:null}
  </View>;
}

const s=StyleSheet.create({
  wrap:{marginTop:8,borderWidth:1,borderRadius:14,padding:12,gap:7},
  title:{fontSize:14,fontWeight:'900'},
  body:{fontSize:11,lineHeight:16,fontWeight:'700'},
  actions:{flexDirection:'row',gap:8,flexWrap:'wrap'},
  primary:{minHeight:44,paddingHorizontal:14,paddingVertical:11,borderRadius:12,alignItems:'center',justifyContent:'center'},
  primaryText:{fontSize:12,fontWeight:'900'},
  secondary:{minHeight:44,paddingHorizontal:14,paddingVertical:11,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
  secondaryText:{fontSize:12,fontWeight:'900'},
  status:{fontSize:10,lineHeight:14,fontWeight:'700'},
  disabled:{opacity:.5},
});
