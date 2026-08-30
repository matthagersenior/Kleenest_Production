import { router } from 'expo-router';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return <SafeAreaView style={styles.safe}><View style={styles.container}><Text style={styles.eyebrow}>KLEENEST</Text><Text style={styles.title}>Find a bathroom without the detour.</Text><Text style={styles.body}>Start with nearby restroom options, choose one, and navigate directly. Use Route only when you need multiple ordered stops.</Text><Pressable style={styles.primary} onPress={()=>router.push('/explore')}><Text style={styles.primaryText}>Find nearby restrooms</Text></Pressable></View></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#f4f7f5'},container:{flex:1,padding:24,justifyContent:'center'},eyebrow:{fontSize:12,fontWeight:'800',letterSpacing:2,color:'#4d6658'},title:{fontSize:42,lineHeight:44,fontWeight:'800',color:'#14231b',marginTop:10,marginBottom:18},body:{fontSize:17,lineHeight:25,color:'#53645a',marginBottom:24},primary:{backgroundColor:'#173d2b',padding:16,borderRadius:16,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'800',fontSize:16}});
