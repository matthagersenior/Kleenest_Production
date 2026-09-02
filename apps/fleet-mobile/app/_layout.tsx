import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
export default function Layout(){return <><StatusBar style="dark"/><Stack screenOptions={{headerStyle:{backgroundColor:'#f3f6f4'},headerTitleStyle:{fontWeight:'900'},headerShadowVisible:false}}><Stack.Screen name="index" options={{title:'Kleenest Fleet'}}/></Stack></>}
