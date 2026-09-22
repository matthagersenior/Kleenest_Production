import { getKleenestSupabaseClient } from '@kleenest/mobile-core';
import { Platform } from 'react-native';

export type AdMobTelemetryEvent=
  |'initialized'
  |'request'
  |'fill'
  |'impression'
  |'click'
  |'paid'
  |'no_fill'
  |'load_error'
  |'consent_blocked'
  |'initialization_error';

type AdMobTelemetryDetails={
  adUnitId?:string|null;
  responseId?:string|null;
  errorCode?:string|null;
  errorMessage?:string|null;
};

const client=()=>getKleenestSupabaseClient();
const platform=()=>Platform.OS==='ios'?'ios':'android';

function text(value:unknown){return typeof value==='string'?value:String(value??'');}

export function classifyAdMobLoadFailure(error:unknown):{eventType:'no_fill'|'load_error';errorCode:string|null;errorMessage:string|null}{
  const value=error as {code?:unknown;message?:unknown};
  const errorCode=text(value?.code).trim()||null;
  const errorMessage=text(value?.message).trim()||null;
  const haystack=`${errorCode||''} ${errorMessage||''}`.toLowerCase();
  return{
    eventType:/no[-_ ]?fill|error-code-no-fill|no ad to show|lack of ad inventory/.test(haystack)?'no_fill':'load_error',
    errorCode,
    errorMessage,
  };
}

export async function recordAdMobTelemetry(eventType:AdMobTelemetryEvent,placementCode:string,details:AdMobTelemetryDetails={}){
  try{
    const{data,error}=await client().rpc('record_admob_telemetry_event',{
      p_event_type:eventType,
      p_placement_code:String(placementCode||'unknown').slice(0,80),
      p_platform:platform(),
      p_ad_unit_id:details.adUnitId||null,
      p_response_id:details.responseId||null,
      p_error_code:details.errorCode||null,
      p_error_message:details.errorMessage||null,
    });
    if(error)return null;
    return data??null;
  }catch{
    return null;
  }
}
