import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import {
  submitBetaDiagnosticReport,
  type BetaReportCategory,
  type BetaReportInput,
  type BetaReportReceipt,
} from '@kleenest/mobile-core';

const QUEUE_KEY='kleenest.beta.report.queue.v1';
const CORRELATION_KEY='kleenest.beta.report.correlation.v1';
const MAX_QUEUE=24;
const MAX_BREADCRUMBS=40;

type Scalar=string|number|boolean|null;
type Breadcrumb={at:string;event:string;route?:string;detail?:string;meta?:Record<string,Scalar>};
type QueuedReport={payload:BetaReportInput;queuedAt:string;attempts:number};
export type BetaSendResult={status:'sent';receipt:BetaReportReceipt}|{status:'queued'};

const breadcrumbs:Breadcrumb[]=[];
let correlationPromise:Promise<string>|null=null;

function text(value:unknown,max=1200){
  return String(value??'')
    .replace(/([?&](?:apikey|access_token|refresh_token|token|authorization)=)[^&#\s]+/gi,'$1<redacted>')
    .replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi,'$1<redacted>')
    .trim()
    .slice(0,max);
}
function errorText(error:unknown){
  if(typeof error==='string')return text(error);
  const row=(error&&typeof error==='object'?error:{}) as Record<string,unknown>;
  return text(row.message||row.error_description||row.details||row.hint||error);
}
function safeMeta(input?:Record<string,unknown>){
  const out:Record<string,Scalar>={};
  for(const [key,value] of Object.entries(input||{})){
    if(['string','number','boolean'].includes(typeof value)||value===null)out[key]=typeof value==='string'?text(value,300):value as Scalar;
  }
  return out;
}
function routeShape(route:string){
  return text(route||'unknown',500)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,':id')
    .replace(/\b\d{4,}\b/g,':n');
}
function errorShape(value:string){
  return text(value,300)
    .replace(/https?:\/\/[^\s/]+/gi,'<host>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,'<id>')
    .replace(/\b\d+\b/g,'#')
    .toLowerCase();
}
function fnv1a(value:string){
  let hash=0x811c9dc5;
  for(let index=0;index<value.length;index++)hash=Math.imul(hash^value.charCodeAt(index),0x01000193);
  return (hash>>>0).toString(16).padStart(8,'0');
}
async function correlationId(){
  if(correlationPromise)return correlationPromise;
  correlationPromise=(async()=>{
    const existing=await AsyncStorage.getItem(CORRELATION_KEY).catch(()=>null);
    if(existing)return existing;
    const installedAt=Date.now().toString(36);
    const runtime=runtimeInfo();
    const next=`r_${installedAt}_${fnv1a([runtime.platform,runtime.appVersion,runtime.updateId,installedAt].join('|'))}`;
    await AsyncStorage.setItem(CORRELATION_KEY,next).catch(()=>{});
    return next;
  })();
  return correlationPromise;
}
function runtimeInfo(){
  return{
    appVersion:String(Constants.expoConfig?.version||'unknown'),
    runtimeVersion:String(Updates.runtimeVersion||Constants.expoConfig?.runtimeVersion||'unknown'),
    updateId:String(Updates.updateId||'embedded'),
    channel:String(Updates.channel||Constants.expoConfig?.extra?.otaChannel||'unknown'),
    platform:Platform.OS,
    platformVersion:String(Platform.Version),
  };
}
async function readQueue():Promise<QueuedReport[]>{
  try{
    const parsed=JSON.parse((await AsyncStorage.getItem(QUEUE_KEY))||'[]');
    return Array.isArray(parsed)?parsed.slice(-MAX_QUEUE):[];
  }catch{return[]}
}
async function writeQueue(queue:QueuedReport[]){
  await AsyncStorage.setItem(QUEUE_KEY,JSON.stringify(queue.slice(-MAX_QUEUE))).catch(()=>{});
}
async function enqueue(payload:BetaReportInput){
  const queue=await readQueue();
  const duplicate=queue.find(item=>item.payload.fingerprint===payload.fingerprint&&Date.now()-new Date(item.queuedAt).getTime()<60_000);
  if(duplicate){
    duplicate.payload={...duplicate.payload,message:payload.message,metadata:payload.metadata,breadcrumbs:payload.breadcrumbs};
    duplicate.attempts+=1;
  }else queue.push({payload,queuedAt:new Date().toISOString(),attempts:0});
  await writeQueue(queue);
}

export function recordBetaBreadcrumb(event:string,route?:string,detail?:string,meta?:Record<string,unknown>){
  breadcrumbs.push({at:new Date().toISOString(),event:text(event,80),route:text(route,300)||undefined,detail:text(detail,240)||undefined,meta:safeMeta(meta)});
  if(breadcrumbs.length>MAX_BREADCRUMBS)breadcrumbs.splice(0,breadcrumbs.length-MAX_BREADCRUMBS);
}

export function isNetworkFailure(error:unknown){
  const value=errorText(error);
  return /fetch failed|network request failed|connectexception|java\.net|failed to connect|unknownhostexception|unable to resolve host|dns|timed? out|timeout|connection refused|socket|network is unreachable|internet connection|192\.168\.\d+\.\d+:443/i.test(value);
}

export function friendlyConsumerError(error:unknown,fallback:string){
  if(isNetworkFailure(error))return 'Kleenest can’t reach the live service right now. Check your connection and tap Retry. If it keeps happening, Beta Report will preserve the technical details.';
  return fallback;
}

async function buildPayload(input:{
  category:BetaReportCategory;
  reportKind:'manual'|'automatic';
  message:string;
  route?:string;
  error?:unknown;
  metadata?:Record<string,unknown>;
}):Promise<BetaReportInput>{
  const info=runtimeInfo();
  const rawError=errorText(input.error);
  const fingerprintSeed=[
    'consumer',
    input.category,
    routeShape(input.route||'unknown'),
    input.reportKind==='automatic'?errorShape(rawError):errorShape(rawError)||'manual',
  ].join('|');
  return{
    fingerprint:`consumer:${input.category}:${fnv1a(fingerprintSeed)}`,
    appSurface:'consumer',
    reportKind:input.reportKind,
    category:input.category,
    message:text(input.message,4000)||'Beta report',
    sessionId:await correlationId(),
    route:text(input.route||'',500)||null,
    appVersion:info.appVersion,
    runtimeVersion:info.runtimeVersion,
    updateId:info.updateId,
    platform:info.platform,
    platformVersion:info.platformVersion,
    metadata:{
      ...safeMeta(input.metadata),
      channel:info.channel,
      ...(rawError?{error:rawError}:{}),
    },
    breadcrumbs:breadcrumbs.slice(-MAX_BREADCRUMBS),
  };
}

async function sendOrQueue(payload:BetaReportInput):Promise<BetaSendResult>{
  try{
    const receipt=await submitBetaDiagnosticReport(payload);
    return{status:'sent',receipt};
  }catch{
    await enqueue(payload);
    return{status:'queued'};
  }
}

export async function sendManualBetaReport(input:{category:BetaReportCategory;message:string;route?:string;metadata?:Record<string,unknown>}){
  recordBetaBreadcrumb('beta_report_submit',input.route,input.category);
  return sendOrQueue(await buildPayload({...input,reportKind:'manual'}));
}

export function captureBetaError(error:unknown,input:{route?:string;category?:BetaReportCategory;operation?:string;metadata?:Record<string,unknown>}={}){
  const category=input.category||(isNetworkFailure(error)?'network':'bug');
  const raw=errorText(error)||'Unknown application error';
  recordBetaBreadcrumb('error',input.route,input.operation||category,{category});
  void buildPayload({
    category,
    reportKind:'automatic',
    message:input.operation?`${input.operation}: ${raw}`:raw,
    route:input.route,
    error,
    metadata:{operation:input.operation||'',...input.metadata},
  }).then(sendOrQueue).catch(()=>{});
}

export async function flushQueuedBetaReports(){
  const queue=await readQueue();
  if(!queue.length)return{sent:0,remaining:0};
  let sent=0;
  const remaining:QueuedReport[]=[];
  for(let index=0;index<queue.length;index++){
    const item=queue[index];
    try{
      await submitBetaDiagnosticReport(item.payload);
      sent+=1;
    }catch{
      remaining.push({...item,attempts:item.attempts+1},...queue.slice(index+1));
      break;
    }
  }
  await writeQueue(remaining);
  return{sent,remaining:remaining.length};
}

export async function betaReportDiagnostics(route?:string){
  const info=runtimeInfo();
  return{
    route:route||'unknown',
    appVersion:info.appVersion,
    runtimeVersion:info.runtimeVersion,
    updateId:info.updateId,
    channel:info.channel,
    platform:`${info.platform} ${info.platformVersion}`,
    queued:(await readQueue()).length,
    breadcrumbs:breadcrumbs.length,
  };
}
