import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
export default function Layout(){return <><StatusBar style="dark"/><Tabs screenOptions={{headerStyle:{backgroundColor:'#f3f6f4'},headerShadowVisible:false,tabBarActiveTintColor:'#173d2b',tabBarLabelStyle:{fontWeight:'800'}}}>
<Tabs.Screen name="index" options={{title:'Home'}}/>
<Tabs.Screen name="locations" options={{title:'Locations'}}/>
<Tabs.Screen name="growth" options={{title:'Growth'}}/>
<Tabs.Screen name="operations" options={{title:'Operations'}}/>
<Tabs.Screen name="analytics" options={{title:'Analytics'}}/>
<Tabs.Screen name="workspaces" options={{href:null,title:'Workspaces'}}/>
<Tabs.Screen name="profile" options={{href:null,title:'Profile'}}/>
<Tabs.Screen name="members" options={{href:null,title:'People & Roles'}}/>
<Tabs.Screen name="assistant" options={{href:null,title:'Kleenest AI'}}/>
<Tabs.Screen name="reviews" options={{href:null,title:'Reviews'}}/>
<Tabs.Screen name="qr-studio" options={{href:null,title:'QR Studio'}}/>
<Tabs.Screen name="live-network" options={{href:null,title:'Live Network'}}/>
<Tabs.Screen name="progression" options={{href:null,title:'Progression'}}/>
<Tabs.Screen name="intelligence" options={{href:null,title:'Intelligence'}}/>
<Tabs.Screen name="capabilities" options={{href:null,title:'Capabilities'}}/>
<Tabs.Screen name="enterprise-locations" options={{href:null,title:'Enterprise Location'}}/>
<Tabs.Screen name="enterprise" options={{href:null,title:'Enterprise'}}/>
<Tabs.Screen name="partners" options={{href:null,title:'Partners'}}/>
<Tabs.Screen name="notifications" options={{href:null,title:'Notifications'}}/>
<Tabs.Screen name="support" options={{href:null,title:'Support'}}/>
<Tabs.Screen name="terms" options={{href:null,title:'Terms'}}/>
<Tabs.Screen name="privacy" options={{href:null,title:'Privacy'}}/>
<Tabs.Screen name="account" options={{href:null,title:'Account'}}/>
</Tabs></>}
