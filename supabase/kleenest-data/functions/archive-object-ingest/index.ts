import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const URL=Deno.env.get("SUPABASE_URL")!,KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(URL,KEY,{auth:{persistSession:false}}),H={"content-type":"application/json"},BUCKET="kleenest-cold-archive";
const msg=(e:unknown)=>{try{return e instanceof Error?e.message:JSON.stringify(e);}catch{return String(e);}};
const hex=(b:ArrayBuffer)=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha256(b:Uint8Array){return hex(await crypto.subtle.digest("SHA-256",b));}
async function gzip(t:string){return new Uint8Array(await new Response(new Blob([t]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());}
async function gunzip(b:ArrayBuffer){return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text();}
async function ensureBucket(){const g=await db.storage.getBucket(BUCKET);if(g.data&&!g.error)return;const c=await db.storage.createBucket(BUCKET,{public:false,fileSizeLimit:50*1024*1024});if(c.error&&!String(c.error.message||"").toLowerCase().includes("already"))throw c.error;}
function kind(v:string){if(v==="external_locations")return"external_location_records";if(v==="ingestion_runs")return"national_ingestion_runs";return v;}
Deno.serve(async(req)=>{try{
 if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"POST required"}),{status:405,headers:H});
 const supplied=req.headers.get("x-kleenest-geo-archive")||"",bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,""),s=await db.rpc("get_internal_geo_archive_secret");
 if(!(!s.error&&s.data&&supplied===s.data)&&!(bearer&&bearer===KEY))return new Response(JSON.stringify({ok:false,error:"unauthorized"}),{status:401,headers:H});
 const body=await req.json().catch(()=>({})),k=kind(String(body?.kind||"")),allowed=new Set(["geo_locations","external_location_records","external_observations","national_ingestion_runs","external_data_sources"]),rows=Array.isArray(body?.rows)?body.rows:[];
 if(!allowed.has(k))return new Response(JSON.stringify({ok:false,error:"unsupported kind"}),{status:400,headers:H});
 if(rows.length>2000)return new Response(JSON.stringify({ok:false,error:"batch too large"}),{status:400,headers:H});
 if(!rows.length)return new Response(JSON.stringify({ok:true,kind:k,rows:0,skipped:true}),{headers:H});
 await ensureBucket();
 const first=String(rows[0]?.id||crypto.randomUUID()),last=String(rows.at(-1)?.id||first),compressed=await gzip(rows.map((r:any)=>JSON.stringify(r)).join("\n")+"\n"),digest=await sha256(compressed),now=new Date(),y=now.getUTCFullYear(),mo=String(now.getUTCMonth()+1).padStart(2,"0"),d=String(now.getUTCDate()).padStart(2,"0"),path=`${k}/live/${y}/${mo}/${d}/${first}_${last}_${digest.slice(0,16)}.jsonl.gz`;
 const u=await db.storage.from(BUCKET).upload(path,compressed,{contentType:"application/gzip",cacheControl:"31536000",upsert:true});if(u.error)throw u.error;
 const dl=await db.storage.from(BUCKET).download(path);if(dl.error||!dl.data)throw dl.error;
 const bytes=await dl.data.arrayBuffer();if(await sha256(new Uint8Array(bytes))!==digest)throw new Error("checksum mismatch");
 const lines=(await gunzip(bytes)).trimEnd().split("\n");if(lines.length!==rows.length)throw new Error("restore row-count mismatch");
 if(rows[0]?.id&&String(JSON.parse(lines[0]).id)!==String(rows[0].id))throw new Error("first-row mismatch");
 if(rows.at(-1)?.id&&String(JSON.parse(lines.at(-1)!).id)!==String(rows.at(-1).id))throw new Error("last-row mismatch");
 const m=await db.rpc("register_archive_object_manifest",{p_kind:k,p_object_path:path,p_content_sha256:digest,p_byte_count:compressed.byteLength,p_row_count:rows.length,p_first_row_id:rows[0]?.id||null,p_last_row_id:rows.at(-1)?.id||null,p_verified_at:new Date().toISOString(),p_metadata:{source:String(body?.source||"live_ingest"),codec:"gzip-jsonl-v1",verified_download:true,verified_decompression:true}});if(m.error)throw m.error;
 return new Response(JSON.stringify({ok:true,kind:k,rows:rows.length,path,bytes:compressed.byteLength,sha256:digest,manifest_id:m.data}),{headers:H});
}catch(e){return new Response(JSON.stringify({ok:false,error:msg(e)}),{status:500,headers:H});}});