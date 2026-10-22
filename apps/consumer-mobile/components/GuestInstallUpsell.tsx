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
  const visible = Platform.OS === 'web' && ready && !signedIn;
  useEffect(() => {
    if (visible) captureGuestMonetizationEvent('install_upsell_view',null,null,'explore_results');
  }, [visible]);
  if (!visible) return null;

  function install() {
    captureGuestMonetizationEvent('install_upsell_click',null,null,'explore_results');
    captureAcquisitionEvent('install_intent',{metadata:{source:'explore_results',method:'install_cta'}});
    router.push('/install');
  }
  function upgrade() {
    captureGuestMonetizationEvent('upgrade_intent',null,null,'explore_results');
    router.push('/membership');
  }
  return <View style={[styles.card,{backgroundColor:theme.surfaceRaised,borderColor:theme.line}]}>
    <Text style={[styles.title,{color:theme.ink}]}>Keep Kleenest one tap away</Text>
    <Text style={[styles.body,{color:theme.muted}]}>Add Kleenest to your Home Screen. You can continue as a guest. Create a free account when you want saved places and routes.</Text>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Install Kleenest" onPress={install} style={[styles.primary,{backgroundColor:theme.accent}]}>
        <Text style={[styles.primaryText,{color:theme.accentText}]}>Install app →</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Learn about five-dollar Remove Ads upgrade" onPress={upgrade} style={[styles.secondary,{borderColor:theme.line}]}>
        <Text style={[styles.secondaryText,{color:theme.accent}]}>Remove network ads · $5</Text>
      </Pressable>
    </View>
    <Text style={[styles.note,{color:theme.muted}]}>One-time Remove Ads is purchased through the supported native app after sign-in. Kleenest Sponsored placements remain.</Text>
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
