import { Redirect } from 'expo-router';
import { Platform, SafeAreaView } from 'react-native';
import { MarketingHome } from '../components/MarketingSite';
import { useConsumerTheme } from '../services/theme';
import { useConsumerWebExperience } from '../services/webExperience';

export default function HomeScreen(){
  const theme=useConsumerTheme();
  const {ready:webGateReady,appActive}=useConsumerWebExperience();

  if(Platform.OS==='web'&&!webGateReady){
    return <SafeAreaView style={{flex:1,backgroundColor:theme.canvas}}/>;
  }
  if(Platform.OS==='web'&&!appActive){
    return <MarketingHome/>;
  }

  return <Redirect href="/explore"/>;
}
