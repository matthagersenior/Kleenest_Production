import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AdaptiveExploreScreen from '../features/AdaptiveExploreScreen';

export default function ExploreScreen(){
  return <View style={s.root}>
    <View style={s.screen}><AdaptiveExploreScreen/></View>
    <View style={s.contributionBar}>
      <Text style={s.copy}>Can't find a bathroom that's missing from Kleenest?</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add a missing bathroom" onPress={()=>router.push('/discover')} style={s.button}>
        <Text style={s.buttonText}>ADD MISSING PLACE</Text>
      </Pressable>
    </View>
  </View>;
}

const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#f5f7f5'},
  screen:{flex:1},
  contributionBar:{paddingHorizontal:14,paddingVertical:10,borderTopWidth:1,borderTopColor:'#d5e1d9',backgroundColor:'#ffffff',gap:7},
  copy:{fontSize:11,lineHeight:16,color:'#52675b',fontWeight:'700'},
  button:{minHeight:44,borderRadius:12,backgroundColor:'#173f2b',alignItems:'center',justifyContent:'center',paddingHorizontal:14},
  buttonText:{fontSize:11,fontWeight:'900',letterSpacing:.5,color:'#ffffff'},
});
