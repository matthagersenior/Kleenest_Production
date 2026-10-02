import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL=Deno.env.get('SUPABASE_URL')!, SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
const OSM=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];
const H={'content-type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-kleenest-scheduler'};
const QUERY_VERSION='corridor_osm_v2_coverage';
const GRID_VERSION='corridor_0.24_frontier_v2_coverage';
const COVERAGE_CLASSES=['amenity','toilets','building_toilets','leisure','railway_station','shop_high_yield','tourism_lodging','highway_services'];
const PROVIDER_POOL_VERSION='overpass_pool_v4_failure_rate_breaker';
const now=()=>new Date().toISOString();
const msg=(e:any)=>e instanceof Error?e.message:String(e?.message||e);
const out=(v:any,s=200)=>new Response(JSON.stringify(v),{status:s,headers:H});
const corridor=/^focus_corridor_/;
const sp=(m:any)=>m?.source_progress?.osm&&typeof m.source_progress.osm==='object'?m.source_progress.osm:{};

async function guard(req:Request){
  const supplied=req.headers.get('x-kleenest-scheduler')||'';
  const r=await db.rpc('get_internal_scheduler_secret',{p_name:'kleenest_maps_scheduler'});
  if(!supplied||r.error||!r.data||supplied!==r.data) throw Error('Invalid scheduler authentication');
}
async function policy(){const r=await db.from('national_ingestion_source_policies').select('*').eq('source_key','osm').single();if(r.error)throw r.error;return r.data;}
async function usage(hours:number){const since=hours===24?(()=>{const d=new Date();d.setUTCHours(0,0,0,0);return d.toISOString()})():new Date(Date.now()-hours*3600000).toISOString();const r=await db.from('national_ingestion_runs').select('requests_used').eq('source_key','osm').gte('started_at',since);if(r.error)throw r.error;return(r.data||[]).reduce((n:number,x:any)=>n+Number(x.requests_used||0),0);}
function backedOff(m:any){const s=sp(m),f=Number(s.consecutive_failures||0),t=Date.parse(String(s.last_attempt_at||0));if(f<2||!Number.isFinite(t))return false;const mins=Math.min(45,5*Math.pow(2,Math.max(0,f-2)));return Date.now()-t<mins*60000;}
function completion(m:any){const s=sp(m),a=Number(s.tile_cursor||0),b=Number(s.tile_count||0);return b>0?Math.min(1,a/b):0;}
function priority(k:string){const p:Record<string,number>={focus_corridor_kansas_city:50,focus_corridor_kc_columbia_i70:48,focus_corridor_columbia_mo:46,focus_corridor_columbia_stl_i70:44,focus_corridor_st_louis_mo:42,focus_corridor_stl_springfield_il_i55:40,focus_corridor_springfield_il:38,focus_corridor_springfield_bloomington_i55:36,focus_corridor_bloomington_il:34,focus_corridor_bloomington_chicago_i55:32,focus_corridor_chicago:30,focus_corridor_springfield_mo_branch:28,focus_corridor_kc_springfield_mo:26,focus_corridor_springfield_mo_rolla_i44:24,focus_corridor_rolla_stl_i44:22};return p[k]??10;}
async function recent(m:any){const since=new Date(Date.now()-6*3600000).toISOString();const r=await db.from('national_ingestion_runs').select('status,requests_used,records_imported,records_updated').eq('market_id',m.id).eq('source_key','osm').gte('started_at',since).order('started_at',{ascending:false}).limit(12);if(r.error)return{score:0};const rows=r.data||[],req=rows.reduce((n:number,x:any)=>n+Number(x.requests_used||0),0),yielded=rows.reduce((n:number,x:any)=>n+Number(x.records_imported||0)+0.15*Number(x.records_updated||0),0),fail=rows.filter((x:any)=>x.status==='failed').length;return{score:(req?yielded/req:8)-fail*1.25+priority(m.market_key)};}
async function candidates(){const q=await db.from('national_ingestion_markets').select('*').in('status',['running','pending']).like('market_key','focus_corridor_%');if(q.error)throw q.error;const rows=(q.data||[]).filter((m:any)=>corridor.test(m.market_key)&&!backedOff(m));return Promise.all(rows.map(async(m:any)=>({...m,_r:await recent(m),_completion:completion(m)})));}
async function choose(limit:number){const a=await candidates();return a.sort((x:any,y:any)=>y._r.score-x._r.score||priority(y.market_key)-priority(x.market_key)||x._completion-y._completion).slice(0,limit);}

async function endpointHealth(){
  const since=new Date(Date.now()-2*3600000).toISOString();
  const r=await db.from('national_ingestion_runs').select('status,error,detail,started_at,records_imported,records_updated,requests_used').eq('source_key','osm').gte('started_at',since).order('started_at',{ascending:false}).limit(300);
  if(r.error)throw r.error;
  const result:any={};
  for(const ep of OSM){
    const rows=(r.data||[]).filter((x:any)=>x.detail?.endpoint===ep).slice(0,30);
    let consecutiveBad=0;
    for(const x of rows){const bad=x.status==='failed'&&/(406|429|502|503|504|timed out|timeout|AbortError)/i.test(String(x.error||''));if(bad)consecutiveBad++;else break;}
    const badRows=rows.filter((x:any)=>x.status==='failed'&&/(406|429|502|503|504|timed out|timeout|AbortError)/i.test(String(x.error||'')));
    const lastBad=badRows[0]?.started_at?Date.parse(badRows[0].started_at):0;
    const lastErr=String(badRows[0]?.error||'');
    const failureRate=rows.length?badRows.length/rows.length:0;
    let cooldown=0;
    if(/406/.test(lastErr)) cooldown=120;
    else if(/429/.test(lastErr)) cooldown=60;
    else if(/502|503/.test(lastErr)) cooldown=30;
    else if(/504|timed out|timeout|AbortError/.test(lastErr)) cooldown=30;
    if(rows.length>=3&&failureRate>=0.80) cooldown=Math.max(cooldown,60);
    else if(consecutiveBad>=2) cooldown=Math.max(cooldown,30);
    const suppressed=cooldown>0&&Number.isFinite(lastBad)&&Date.now()-lastBad<cooldown*60000;
    const req=rows.reduce((n:number,x:any)=>n+Number(x.requests_used||0),0);
    const yielded=rows.reduce((n:number,x:any)=>n+Number(x.records_imported||0)+0.15*Number(x.records_updated||0),0);
    result[ep]={samples:rows.length,bad:badRows.length,failure_rate:failureRate,consecutive_bad:consecutiveBad,suppressed,cooldown_minutes:cooldown,yield_per_request:req?yielded/req:0,breaker:'failure_rate_cooldown'};
  }
  return result;
}
function center(m:any){const b=m.bbox.map(Number);return{lat:(b[0]+b[2])/2,lng:(b[1]+b[3])/2};}
function tiles(m:any,step=.24){const b=m.bbox.map(Number),[s,w,n,e]=b,a:number[][]=[],c=center(m);for(let y=s;y<n;y+=step)for(let x=w;x<e;x+=step)a.push([y,x,Math.min(y+step,n),Math.min(x+step,e)]);a.sort((A,B)=>{const ay=(A[0]+A[2])/2,ax=(A[1]+A[3])/2,by=(B[0]+B[2])/2,bx=(B[1]+B[3])/2;return Math.hypot(ay-c.lat,(ax-c.lng)*Math.cos(c.lat*Math.PI/180))-Math.hypot(by-c.lat,(bx-c.lng)*Math.cos(c.lat*Math.PI/180));});return a;}
function split4(b:number[]){const[s,w,n,e]=b,my=(s+n)/2,mx=(w+e)/2;return[[s,w,my,mx],[s,mx,my,e],[my,w,n,mx],[my,mx,n,e]];}
function query(b:number[]){const[s,w,n,e]=b;return `[out:json][timeout:18];(nwr[amenity~"restaurant|fast_food|cafe|fuel|toilets|hospital|clinic|doctors|dentist|pharmacy|library|bus_station|townhall|courthouse|police|fire_station|drinking_water|shower|charging_station|atm|marketplace"](${s},${w},${n},${e});nwr[building="toilets"](${s},${w},${n},${e});nwr["toilets"~"^(yes|public|customers|permissive)$"](${s},${w},${n},${e});nwr[leisure~"park|nature_reserve|playground|sports_centre"](${s},${w},${n},${e});nwr[railway="station"](${s},${w},${n},${e});nwr[shop~"supermarket|convenience|department_store|mall|variety_store|wholesale"](${s},${w},${n},${e});nwr[tourism~"hotel|motel|hostel|camp_site|caravan_site"](${s},${w},${n},${e});nwr[highway~"rest_area|services"](${s},${w},${n},${e}););out center tags qt;`;}
function rows(es:any[],m:any){const at=now(),dedup=new Map<string,any>();for(const e of es){const t=e.tags||{},lat=Number(e.lat??e.center?.lat),lng=Number(e.lon??e.center?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;const pt=t.amenity==='toilets'||t.building==='toilets'?'restroom':t.amenity==='fuel'?'gas_station':['restaurant','fast_food'].includes(t.amenity)?'restaurant':t.amenity==='cafe'?'cafe':t.shop?'retail':t.tourism?'lodging':t.highway==='rest_area'||t.highway==='services'?'road_service':t.leisure?'park':'service';const source_id=`osm:${e.type}:${e.id}`;dedup.set(source_id,{source_id,latitude:lat,longitude:lng,name:t.name||t.brand||t.operator||(pt==='restroom'?'Public Restroom':`Unnamed ${pt}`),place_type:pt,address:[t['addr:housenumber'],t['addr:street']].filter(Boolean).join(' ')||t['addr:full']||null,city:t['addr:city']||null,state:t['addr:state']||null,postal_code:t['addr:postcode']||null,brand:t.brand||null,operator_name:t.operator||null,source_metadata:{tags:t,provider:'overpass',captured_at:at,market_key:m.market_key,query_version:QUERY_VERSION,coverage_classes:COVERAGE_CLASSES,corridor:'kc_to_chicago'}});}
  return [...dedup.values()];
}
const BACKGROUND_CANONICAL_BATCH=100;
async function persist(all:any[]){let imported=0,updated=0;for(let i=0;i<all.length;i+=BACKGROUND_CANONICAL_BATCH){const r=await db.rpc('ingest_external_locations_background',{p_source_key:'osm',p_rows:all.slice(i,i+BACKGROUND_CANONICAL_BATCH)});if(r.error)throw r.error;if(r.data?.deferred)return{imported,updated,deferred:true,reason:String(r.data?.reason||'background_ingestion_busy')};imported+=Number(r.data?.imported_locations||0);updated+=Number(r.data?.updated_locations||0);}return{imported,updated,deferred:false,reason:null};}

async function lane(m:any,laneNo:number,h:any,endpoint:string){
  const p={...(m.source_progress||{})},s=sp(m),list=tiles(m),cursor=Math.max(0,Number(s.tile_cursor||0));
  let sub=s.grid_version===GRID_VERSION&&s.subdivision?.parent_cursor===cursor?s.subdivision:null;
  if(cursor>=list.length){p.osm={...s,completed:true,tile_cursor:list.length,tile_count:list.length,grid_version:GRID_VERSION,query_version:QUERY_VERSION,subdivision:null};await db.from('national_ingestion_markets').update({source_progress:p,status:'completed',current_source:null,completed_at:now(),updated_at:now()}).eq('id',m.id);return{market:m.market_key,ok:true,status:'market_completed',imported:0,updated:0};}
  const target=sub?sub.cells[sub.index]:list[cursor];
  const ins=await db.from('national_ingestion_runs').insert({market_id:m.id,source_key:'osm',status:'running',detail:{lane:laneNo,corridor:'kc_to_chicago',endpoint,bbox:target,query_version:QUERY_VERSION,grid_version:GRID_VERSION,endpoint_health:h[endpoint]}}).select('id').single();if(ins.error)throw ins.error;const rid=ins.data.id;
  let bytes=0;
  try{
    const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'text/plain','user-agent':'KleenestApp/1.0 corridor-ingestion contact=admin@kleenest.com'},body:query(target),signal:AbortSignal.timeout(28000)});
    const text=await r.text();bytes=new TextEncoder().encode(text).length;
    if(!r.ok)throw Error(`HTTP ${r.status}`);
    let parsed:any;try{parsed=JSON.parse(text);}catch{throw Error('invalid_json_response');}
    if(!Array.isArray(parsed?.elements))throw Error('invalid_overpass_payload');
    const all=rows(parsed.elements,m),saved=await persist(all);
    if(saved.deferred){
      await db.from('national_ingestion_runs').update({
        status:'completed',
        requests_used:1,
        bytes_downloaded:bytes,
        records_seen:all.length,
        records_imported:saved.imported,
        records_updated:saved.updated,
        finished_at:now(),
        detail:{lane:laneNo,corridor:'kc_to_chicago',endpoint,bbox:target,query_version:QUERY_VERSION,grid_version:GRID_VERSION,coverage_classes:COVERAGE_CLASSES,endpoint_health:h[endpoint],deferred:true,reason:saved.reason}
      }).eq('id',rid);
      return{market:m.market_key,ok:true,status:'background_ingestion_busy',seen:all.length,imported:saved.imported,updated:saved.updated,endpoint,cursor,tile_count:list.length};
    }
    let nc=cursor,ns:any=sub;
    if(sub){const ni=Number(sub.index)+1;if(ni>=sub.cells.length){nc++;ns=null}else ns={...sub,index:ni};} else nc++;
    p.osm={...s,completed:nc>=list.length,tile_cursor:nc,tile_count:list.length,grid_version:GRID_VERSION,query_version:QUERY_VERSION,coverage_classes:COVERAGE_CLASSES,subdivision:ns,consecutive_failures:0,last_error:null,last_success_at:now(),last_attempt_at:now(),records_seen:Number(s.records_seen||0)+all.length,records_imported:Number(s.records_imported||0)+saved.imported,records_updated:Number(s.records_updated||0)+saved.updated};
    await db.from('national_ingestion_runs').update({status:'completed',requests_used:1,bytes_downloaded:bytes,records_seen:all.length,records_imported:saved.imported,records_updated:saved.updated,finished_at:now(),detail:{lane:laneNo,corridor:'kc_to_chicago',endpoint,bbox:target,query_version:QUERY_VERSION,grid_version:GRID_VERSION,coverage_classes:COVERAGE_CLASSES,endpoint_health:h[endpoint]}}).eq('id',rid);
    const done=p.osm.completed;
    await db.from('national_ingestion_markets').update({source_progress:p,status:done?'completed':'running',current_source:done?null:'osm',completed_at:done?now():null,last_error:null,last_run_at:now(),updated_at:now()}).eq('id',m.id);
    return{market:m.market_key,ok:true,status:done?'market_completed':'progressed',seen:all.length,imported:saved.imported,updated:saved.updated,endpoint,cursor:nc,tile_count:list.length};
  }catch(e){
    const er=`${endpoint} ${msg(e)}`;
    const endpointReject=/(HTTP 406|HTTP 429|HTTP 502|HTTP 503)/i.test(er);
    const tilePressure=/(HTTP 504|timed out|timeout|AbortError)/i.test(er);
    const nextFailures=endpointReject?Number(s.consecutive_failures||0):Number(s.consecutive_failures||0)+1;
    let ns:any=sub;
    if(tilePressure){if(!sub)ns={parent_cursor:cursor,index:0,cells:split4(list[cursor]),level:1};else if(Number(sub.level||1)<6)ns={parent_cursor:cursor,index:sub.index,cells:[...sub.cells.slice(0,sub.index),...split4(sub.cells[sub.index]),...sub.cells.slice(sub.index+1)],level:Number(sub.level||1)+1};}
    await db.from('national_ingestion_runs').update({status:'failed',requests_used:1,bytes_downloaded:bytes,error:er,finished_at:now(),detail:{lane:laneNo,corridor:'kc_to_chicago',endpoint,bbox:target,query_version:QUERY_VERSION,grid_version:GRID_VERSION,failure_class:endpointReject?'endpoint_pressure':tilePressure?'tile_pressure':'other',subdivide_next:tilePressure,subdivision_level:Number(ns?.level||0),endpoint_health:h[endpoint]}}).eq('id',rid);
    p.osm={...s,completed:false,tile_cursor:cursor,tile_count:list.length,grid_version:GRID_VERSION,query_version:QUERY_VERSION,coverage_classes:COVERAGE_CLASSES,subdivision:ns,consecutive_failures:nextFailures,last_error:er,last_attempt_at:now()};
    await db.from('national_ingestion_markets').update({source_progress:p,status:'running',current_source:'osm',last_error:er,last_run_at:now(),updated_at:now()}).eq('id',m.id);
    return{market:m.market_key,ok:false,error:er,endpoint,failure_class:endpointReject?'endpoint_pressure':tilePressure?'tile_pressure':'other',subdivision_level:Number(ns?.level||0),cursor,tile_count:list.length};
  }
}

async function cycle(){
  const owner=crypto.randomUUID();
  const lease=await db.rpc('try_acquire_focus_ingestion_lease',{p_owner:owner,p_ttl_seconds:55});
  if(lease.error)throw lease.error;
  if(!lease.data)return{ok:true,status:'overlap_suppressed'};
  const storage=await db.rpc('national_ingestion_storage_status');if(storage.error)throw storage.error;if(storage.data?.may_ingest===false)return{ok:true,status:'storage_paused',storage:storage.data};
  const p=await policy();if(!p.enabled)return{ok:true,status:'osm_disabled'};
  const[d,hour]=await Promise.all([usage(24),usage(1)]),dailyLeft=p.daily_request_limit?Math.max(0,Number(p.daily_request_limit)-d):2,hourlyLeft=p.hourly_request_limit?Math.max(0,Number(p.hourly_request_limit)-hour):2,slots=Math.min(Math.max(1,Math.min(2,Number(p.max_requests_per_cycle||2))),dailyLeft,hourlyLeft);
  if(slots<=0)return{ok:true,status:'quota_wait'};
  const health=await endpointHealth();
  const endpointScore=(ep:string)=>{const h=health[ep]||{},samples=Number(h.samples||0);if(!samples)return 100;return(1-Number(h.failure_rate||0))*50+Math.min(10,Number(h.yield_per_request||0))-Number(h.consecutive_bad||0)*5;};
  const available=OSM.filter(ep=>!health[ep]?.suppressed).sort((a,b)=>endpointScore(b)-endpointScore(a));
  if(!available.length)return{ok:true,status:'endpoint_backoff',endpoint_health:health};
  const lanes=Math.min(slots,available.length,2),ms=await choose(lanes);
  if(!ms.length)return{ok:true,status:'corridor_complete_or_backoff',endpoint_health:health};
  const results=await Promise.all(ms.map((m:any,i:number)=>lane(m,i,health,available[i%available.length])));
  return{ok:results.some((x:any)=>x.ok),status:'kc_to_chicago_coverage_v25',query_version:QUERY_VERSION,grid_version:GRID_VERSION,provider_pool_version:PROVIDER_POOL_VERSION,logical_lanes:results.length,endpoint_health:health,results,quota_before:{daily_used:d,hourly_used:hour}};
}

Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response(null,{status:204,headers:H});if(req.method!=='POST')return out({ok:false,error:'POST required'},405);try{await guard(req);return out(await cycle());}catch(e){return out({ok:false,error:msg(e)},500);}});
