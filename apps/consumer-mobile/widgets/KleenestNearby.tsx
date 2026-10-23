import { Link, Text, VStack } from '@expo/ui/swift-ui';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type NearbyWidgetPlace={id:string;name:string;distance:string};
export type NearbyWidgetProps={status:string;places:NearbyWidgetPlace[]};

// This function runs inside WidgetKit, not the React Native app. No hooks,
// network calls, permissions or application secrets are permitted here.
const KleenestNearby=(props:NearbyWidgetProps, environment:WidgetEnvironment)=>{
  'widget';
  const small=environment.widgetFamily==='systemSmall';
  const large=environment.widgetFamily==='systemLarge';
  const first=props.places[0];
  const second=props.places[1];
  const third=props.places[2];
  return (
    <VStack spacing={6}>
      <Text>KLEENEST</Text>
      <Text>{props.status}</Text>
      {small?(
        <Link label="Find a restroom" destination="kleenest://explore?source=consumer_widget"/>
      ):(
        <VStack spacing={5}>
          <Link label={first?first.name+' · '+first.distance:'Find nearby restrooms'}
            destination={first?'kleenest://location/'+first.id+'?source=consumer_widget':'kleenest://explore?source=consumer_widget'}/>
          <Link label={second?second.name+' · '+second.distance:'Explore nearby'}
            destination={second?'kleenest://location/'+second.id+'?source=consumer_widget':'kleenest://explore?source=consumer_widget'}/>
          {large&&third?<Link label={third.name+' · '+third.distance}
            destination={'kleenest://location/'+third.id+'?source=consumer_widget'}/>:null}
          {large?(
            <VStack spacing={4}>
              <Link label="Map and filters" destination="kleenest://explore?source=consumer_widget"/>
              <Link label="Scan location QR" destination="kleenest://qr?source=consumer_widget"/>
              <Link label="Along route" destination="kleenest://route?source=consumer_widget"/>
            </VStack>
          ):(
            <Link label="See map" destination="kleenest://explore?source=consumer_widget"/>
          )}
        </VStack>
      )}
    </VStack>
  );
};
export default createWidget('KleenestNearby',KleenestNearby);
