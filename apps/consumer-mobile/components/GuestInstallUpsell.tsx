import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureAcquisitionEvent } from '../services/acquisitionAttribution';
import { captureGuestMonetizationEvent } from '../services/guestMonetization';
import { useConsumerTheme } from '../services/theme';
import { useConsumerWebExperience } from '../services/webExperience';

// Shown after a guest has received useful discovery results, never over map controls.
export function GuestInstallUpsell() {
  const theme = useConsumerTheme();
  const { ready, signedIn } = useConsumerWebExperience();
  const visible = ready && !signedIn;
  useEffect(() => {
    if (visible && Platform.OS === 'web') captureGuestMonetizationEvent('install_upsell_view',null,null,'explore_results');
  }, [visible]);
  if (!visible) return null;

  function install() {
    captureGuestMonetizationEvent('install_upsell_click',null,null,'explore_results');
    captureAcquisitionEvent('install_intent',{metadata:{source:'explore_results',method:'install_cta'}});
    router.push('/install');
  }
  function createAccount() {
    captureAcquisitionEvent('signup_intent',{metadata:{source:'explore_results',method:'free_account_cta'}});
    router.push('/signup?mode=signup&returnTo=%2Fexplore' as any);
  }
  return <View style={[styles.card,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[styles.title,{color:theme.ink}]}>Found a bathroom worth remembering?</Text>
    <Text style={[styles.body,{color:theme.muted}]}>A free account keeps your saved bathrooms, routes, and community rewards across visits. You can keep exploring without signing up.</Text>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Create a free Kleenest account" onPress={createAccount} style={[styles.primary,{backgroundColor:theme.accent}]}>
        <Text style={[styles.primaryText,{color:theme.accentText}]}>Create free account →</Text>
      </Pressable>
      {Platform.OS === 'web' ? <Pressable accessibilityRole="button" accessibilityLabel="Add Kleenest to Home Screen" onPress={install} style={[styles.secondary,{borderColor:theme.line}]}>
        <Text style={[styles.secondaryText,{color:theme.accent}]}>Add to Home Screen</Text>
      </Pressable> : null}
    </View>
    <Text style={[styles.note,{color:theme.muted}]}>No account required to find a bathroom.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card:{borderRadius:16,borderWidth:1,padding:13,gap:7,marginVertical:8},
  title:{fontSize:15,fontWeight:'900'},
  body:{fontSize:12,lineHeight:17},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  primary:{borderRadius:10,minHeight:42,paddingHorizontal:13,paddingVertical:10,justifyContent:'center'},
  primaryText:{fontSize:12,fontWeight:'900'},
  secondary:{borderWidth:1,borderRadius:10,minHeight:42,paddingHorizontal:12,paddingVertical:10,justifyContent:'center'},
  secondaryText:{fontSize:11,fontWeight:'800'},
  note:{fontSize:10,lineHeight:15}
});
