import { router } from 'expo-router';
import { SafeAreaView,ScrollView,StyleSheet,Text,Pressable,View } from 'react-native';

export default function HomeScreen(){
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.brand}>KLEENEST</Text>
    <Text style={styles.title}>Find a bathroom. Fast.</Text>
    <Text style={styles.body}>See nearby restrooms, compare the basics, open details, and get directions without digging through the rest of the app.</Text>

    <Pressable style={styles.find} onPress={()=>router.push('/explore')}>
      <Text style={styles.findLabel}>FIND A BATHROOM</Text>
      <Text style={styles.findTitle}>Show nearby restrooms</Text>
      <Text style={styles.findBody}>Use my location · map + list · directions</Text>
    </Pressable>

    <View style={styles.quickRow}>
      <Pressable style={styles.quick} onPress={()=>router.push('/saved')}><Text style={styles.quickTitle}>Saved</Text><Text style={styles.quickBody}>Bathrooms you want to remember</Text></Pressable>
      <Pressable style={styles.quick} onPress={()=>router.push('/qr')}><Text style={styles.quickTitle}>Scan QR</Text><Text style={styles.quickBody}>Open a restroom or check-in flow</Text></Pressable>
    </View>

    <View style={styles.section}>
      <Text style={styles.eyebrow}>AFTER YOU FIND ONE</Text>
      <Text style={styles.sectionTitle}>Kleenest gets smarter from real visits.</Text>
      <Text style={styles.sectionBody}>Open a restroom to see available evidence, amenities, reviews, check in when you are there, and help keep the network current.</Text>
      <View style={styles.linkRow}>
        <Pressable style={styles.secondary} onPress={()=>router.push('/activity')}><Text style={styles.secondaryText}>Activity</Text></Pressable>
        <Pressable style={styles.secondary} onPress={()=>router.push('/play')}><Text style={styles.secondaryText}>Rewards</Text></Pressable>
        <Pressable style={styles.secondary} onPress={()=>router.push('/profile')}><Text style={styles.secondaryText}>Profile</Text></Pressable>
      </View>
    </View>
  </ScrollView></SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f3f6f4'},container:{padding:22,paddingBottom:42},brand:{fontSize:12,fontWeight:'900',letterSpacing:2.4,color:'#42614f'},title:{fontSize:42,lineHeight:45,fontWeight:'900',color:'#12251a',marginTop:10},body:{fontSize:17,lineHeight:25,color:'#5b6d62',marginTop:12,marginBottom:22},
  find:{backgroundColor:'#173d2b',borderRadius:24,padding:22,minHeight:176,justifyContent:'center'},findLabel:{fontSize:11,fontWeight:'900',letterSpacing:1.5,color:'#bcd4c5'},findTitle:{fontSize:28,lineHeight:32,fontWeight:'900',color:'#fff',marginTop:8},findBody:{fontSize:14,fontWeight:'700',color:'#dce9e1',marginTop:10},
  quickRow:{flexDirection:'row',gap:10,marginTop:12},quick:{flex:1,backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe6df',borderRadius:18,padding:16,minHeight:104},quickTitle:{fontSize:17,fontWeight:'900',color:'#173d2b'},quickBody:{fontSize:12,lineHeight:17,color:'#6c7d72',fontWeight:'700',marginTop:5},
  section:{marginTop:28,paddingTop:24,borderTopWidth:1,borderTopColor:'#d8e3dc'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.5,color:'#567060'},sectionTitle:{fontSize:24,lineHeight:28,fontWeight:'900',color:'#15281d',marginTop:8},sectionBody:{fontSize:14,lineHeight:21,color:'#67786e',marginTop:8},linkRow:{flexDirection:'row',gap:8,marginTop:16},secondary:{flex:1,backgroundColor:'#e5eee8',paddingVertical:12,borderRadius:12,alignItems:'center'},secondaryText:{fontSize:12,fontWeight:'900',color:'#173d2b'}
});
