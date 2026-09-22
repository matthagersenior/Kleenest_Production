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
Deno.serve(async(req)=>{try{
 if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"POST required"}),{status:405,headers:H});
 const supplied=req.headers.get("x-kleenest-geo-archive")||"",s=await db.rpc("get_internal_geo_archive_secret");
 if(s.error||!s.data||supplied!==s.data)return new Response(JSON.stringify({ok:false,error:"unauthorized"}),{status:401,headers:H});
 await ensureBucket();
 const body=await req.json().catch(()=>({})),kind=String(body?.kind||""),batches=Math.max(1,Math.min(25,Number(body?.batches||5))),limit=Math.max(1,Math.min(2000,Number(body?.limit||1000)));
 let afterId=body?.after_id?String(body.after_id):null,archived=0,done=false;const objects:any[]=[];
 for(let i=0;i<batches;i++){
  const b=await db.rpc("archive_object_backfill_batch",{p_kind:kind,p_after_id:afterId,p_limit:limit});if(b.error)throw {stage:"batch_rpc",error:b.error};
  const rows=Array.isArray(b.data?.rows)?b.data.rows:[];if(!rows.length){done=true;break;}
  const firstId=String(rows[0].id),lastId=String(rows[rows.length-1].id),compressed=await gzip(rows.map((r:any)=>JSON.stringify(r)).join("\n")+"\n"),digest=await sha256(compressed),path=`${kind}/backfill/${firstId}_${lastId}.jsonl.gz`;
  const u=await db.storage.from(BUCKET).upload(path,compressed,{contentType:"application/gzip",cacheControl:"31536000",upsert:true});if(u.error)throw {stage:"upload",error:u.error};
  const d=await db.storage.from(BUCKET).download(path);if(d.error||!d.data)throw {stage:"download",error:d.error};
  const bytes=await d.data.arrayBuffer();if(await sha256(new Uint8Array(bytes))!==digest)throw new Error("checksum mismatch");
  const lines=(await gunzip(bytes)).trimEnd().split("\n");if(lines.length!==rows.length)throw new Error("restore row-count mismatch");
  if(String(JSON.parse(lines[0]).id)!==firstId||String(JSON.parse(lines.at(-1)!).id)!==lastId)throw new Error("restore boundary mismatch");
  const m=await db.rpc("register_archive_object_manifest",{p_kind:kind,p_object_path:path,p_content_sha256:digest,p_byte_count:compressed.byteLength,p_row_count:rows.length,p_first_row_id:firstId,p_last_row_id:lastId,p_verified_at:new Date().toISOString(),p_metadata:{source:"relational_backfill",codec:"gzip-jsonl-v1",verified_download:true,verified_decompression:true}});if(m.error)throw {stage:"manifest",error:m.error};
  archived+=rows.length;afterId=lastId;objects.push({path,rows:rows.length,bytes:compressed.byteLength,sha256:digest,manifest_id:m.data});
 }
 return new Response(JSON.stringify({ok:true,kind,archived,next_id:afterId,done,objects}),{headers:H});
}catch(e){return new Response(JSON.stringify({ok:false,error:msg(e)}),{status:500,headers:H});}});