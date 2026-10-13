import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase.js';
import { identity } from '../services/identity.js';

const OPTIONS=[
 ['family_restroom','Family restroom'],['wheelchair_accessible','Wheelchair accessible'],['baby_changing','Baby-changing station'],
 ['toilet_seat_covers','Toilet seat covers'],['hands_free_doors','Hands-free doors'],['gender_neutral','All-gender restroom'],
 ['showers','Showers'],['soap','Soap'],['paper_towels','Paper towels'],['accessible_parking','Accessible parking']
];
const TEMPLATES=[
 ['places','Explore places'],['amenities','Find amenities'],['feedback','Community feedback'],
 ['photos','Upload photos'],['mixed','Custom challenge']
];
const empty=()=>({id:null,title:'',description:'',type:'places',places:3,feedback:0,photos:0,amenities:[],xp:0,area:''});
const editable=status=>['draft','changes_requested','rejected'].includes(status);
const shareUrl=id=>window.location.origin+'/Kleenest_Production/creator-mission/'+encodeURIComponent(id);
async function rpc(name,args={}){const {data,error}=await getSupabase().rpc(name,args);if(error)throw error;return data;}
function RequirementSummary({requirements:r={}}){
 const selected=OPTIONS.filter(([id])=>(r.amenities||[]).includes(id)).map(([,label])=>label);
 return <div className="creator-summary">
  {Number(r.places)>0&&<span>{r.places} places</span>}
  {Number(r.feedback)>0&&<span>{r.feedback} feedback contributions</span>}
  {Number(r.photos)>0&&<span>{r.photos} photos</span>}
  {selected.length>0&&<span>Amenities: {selected.join(', ')}</span>}
  {r.area&&<span>Area: {r.area}</span>}
  {Number(r.xp)>0&&<span>{r.xp} proposed XP (subject to validation)</span>}
 </div>;
}
export function CreatorMissionPage(){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const id=window.location.pathname.split('/').filter(Boolean).at(-1);
 useEffect(()=>{let live=true;rpc('creator_studio_public_mission',{p_id:id})
  .then(value=>{if(live)setData(value)})
  .catch(err=>{if(live)setError(err.message||'Mission is unavailable')})
  .finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 },[id]);
 if(loading)return <section className="panel"><p>Opening approved mission…</p></section>;
 if(error||!data)return <section className="panel"><h1>Mission unavailable</h1><p>{error||'This mission is not publicly approved.'}</p></section>;
 return <section className="panel">
  <div className="eyebrow">KLEENEST CREATOR MISSION</div>
  <h1>{data.title}</h1>
  <p>Created by {data.creator_name}{data.creator_handle?' · '+data.creator_handle:''}</p>
  <p>{data.description}</p><RequirementSummary requirements={data.requirements}/>
  <div className="notice">Complete genuine community activities in Kleenest. Rewards are not automatically issued for this preview; completion evidence must be verified.</div>
  <a className="primary creator-link" href="/Kleenest_Production/nearby">Explore places</a>
 </section>;
}
export default function CreatorStudioPage(){
 const [session,setSession]=useState(null),[view,setView]=useState(null),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const [login,setLogin]=useState({email:'',password:'',name:''}),[draft,setDraft]=useState(empty);
 const [invite,setInvite]=useState({email:'',name:'',handle:''}),[reviewNote,setReviewNote]=useState('');
 const [authMode,setAuthMode]=useState('sign-in');
 const reload=useCallback(async()=>{
  const current=await identity.getSession();
  setSession(current);
  if(!current){setView(null);return}
  try{await rpc('creator_studio_claim')}catch(e){if(!/verified|confirm/i.test(e.message||''))throw e}
  const data=await rpc('creator_studio_dashboard');
  setView(data);
 },[]);
 useEffect(()=>{
  let live=true;
  reload().catch(e=>{if(live)setError(e.message||'Creator Studio could not load')});
  const {data}=getSupabase().auth.onAuthStateChange(()=>{reload().catch(()=>{})});
  return()=>{live=false;data.subscription.unsubscribe()};
 },[reload]);
 const run=async fn=>{
  setBusy(true);setError('');setMessage('');
  try{await fn();await reload()}catch(e){setError(e.message||'Unable to complete the action')}finally{setBusy(false)}
 };
 const authenticate=e=>{e.preventDefault();void run(async()=>{
  const result=authMode==='sign-up'
   ?await identity.signUp({email:login.email,password:login.password,fullName:login.name})
   :await identity.signIn({email:login.email,password:login.password});
  if(result.error)throw result.error;
  setMessage(authMode==='sign-up'?'Account requested. Verify the emailed confirmation, then sign in.':'Signed in.');
 })};
 const update=(name,value)=>setDraft(prev=>({...prev,[name]:value}));
 const edit=row=>{const r=row.requirements||{};setDraft({
  id:row.id,title:row.title,description:row.description,type:r.type||'mixed',
  places:Number(r.places||0),feedback:Number(r.feedback||0),photos:Number(r.photos||0),
  amenities:Array.isArray(r.amenities)?r.amenities:[],xp:Number(r.xp||0),area:r.area||''
 });window.scrollTo({top:0,behavior:'smooth'})};
 const save=()=>run(async()=>{
  const saved=await rpc('creator_studio_save',{p_id:draft.id,p_title:draft.title,p_description:draft.description,
   p_requirements:{type:draft.type,places:Number(draft.places),feedback:Number(draft.feedback),
    photos:Number(draft.photos),amenities:draft.amenities,xp:Number(draft.xp),area:draft.area.trim().slice(0,120)}});
  setDraft(empty());setMessage(saved?'Mission draft saved.':'Draft saved.');
 });
 const submit=id=>run(async()=>{await rpc('creator_studio_submit',{p_id:id});setMessage('Submitted to the KleenestOS owner for review.')});
 const review=(id,decision)=>run(async()=>{await rpc('creator_studio_owner_review',{p_id:id,p_decision:decision,p_note:reviewNote});setReviewNote('');setMessage('Review decision saved.')});
 const sendInvite=()=>run(async()=>{await rpc('creator_studio_owner_invite',{p_email:invite.email,p_display_name:invite.name,p_handle:invite.handle});setInvite({email:'',name:'',handle:''});setMessage('Invitation authorization saved. Send the creator the sign-up link separately. No invitation email has been sent.')});
 const revoke=id=>run(async()=>{await rpc('creator_studio_owner_revoke',{p_account_id:id});setMessage('Creator access revoked.')});
 if(!session)return <section className="panel"><div className="eyebrow">KLEENEST CREATOR STUDIO</div><h1>Creator sign-in</h1>
  <p>Invited creators can design missions and request approval. Creators never receive KleenestOS owner permissions.</p>
  <div className="card-actions"><button className="secondary" onClick={()=>setAuthMode('sign-in')}>Sign in</button><button className="secondary" onClick={()=>setAuthMode('sign-up')}>Create account</button></div>
  <form className="auth-form" onSubmit={authenticate}>
   {authMode==='sign-up'&&<label>Name<input required value={login.name} onChange={e=>setLogin({...login,name:e.target.value})}/></label>}
   <label>Email<input required type="email" value={login.email} onChange={e=>setLogin({...login,email:e.target.value})}/></label>
   <label>Password<input required type="password" minLength={6} value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/></label>
   <button className="primary" disabled={busy} type="submit">{authMode==='sign-up'?'Create account':'Sign in'}</button>
  </form>{error&&<div className="notice error">{error}</div>}{message&&<div className="notice">{message}</div>}
 </section>;
 if(!view)return <section className="panel"><h1>Creator Studio</h1><p>Loading your workspace…</p>{error&&<div className="notice error">{error}</div>}</section>;
 if(!view.authorized)return <section className="panel"><h1>Creator Studio</h1>
  <p>This account does not yet have creator access. Ask the KleenestOS owner to invite the same verified email address you used to sign in.</p>
  <button className="secondary" onClick={()=>void run(reload)}>Check invitation again</button>
  {error&&<div className="notice error">{error}</div>}</section>;
 const owner=Boolean(view.owner),mine=(view.missions||[]).filter(m=>owner||m.account_id===view.account_id);
 return <div className="creator-studio">
  <section className="panel"><div className="eyebrow">KLEENEST CREATOR STUDIO</div><h1>{owner?'Creator controls':'Your creator workspace'}</h1>
   <p>Design place-discovery missions, amenity hunts, review challenges, and photo activities. Every mission requires owner approval before publication.</p>
   <div className="notice">Creator missions are proposals until approved. Actual user contributions must be verified before XP or rewards can be issued.</div>
  </section>
  {owner&&<section className="panel">
   <h2>Invite a creator</h2><p>Authorize an email to use Creator Studio without granting owner or business access.</p>
   <form className="auth-form" onSubmit={e=>{e.preventDefault();void sendInvite()}}>
    <label>Creator name<input required value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})}/></label>
    <label>Verified login email<input required type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/></label>
    <label>Creator handle (optional)<input value={invite.handle} onChange={e=>setInvite({...invite,handle:e.target.value})} placeholder="@handle"/></label>
    <button className="primary" disabled={busy} type="submit">Authorize creator email</button>
   </form>
   {(view.accounts||[]).map(a=><div className="stop-row" key={a.id}><div><strong>{a.display_name}</strong><small>{a.email} · {a.status} · {a.user_id?'Linked login':'Awaiting sign-in'}</small></div>
    {a.status!=='revoked'&&<button className="secondary" disabled={busy} onClick={()=>void revoke(a.id)}>Revoke</button>}</div>)}
  </section>}
  {!owner&&<section className="panel">
   <h2>{draft.id?'Edit your mission':'Create a mission'}</h2>
   <label>Challenge template<select value={draft.type} onChange={e=>update('type',e.target.value)}>
    {TEMPLATES.map(([v,label])=><option key={v} value={v}>{label}</option>)}
   </select></label>
   <div className="auth-form">
    <label>Mission name<input maxLength={120} value={draft.title} onChange={e=>update('title',e.target.value)} placeholder="Discover three family-friendly stops"/></label>
    <label>Instructions for participants<textarea maxLength={1500} value={draft.description} onChange={e=>update('description',e.target.value)} placeholder="Describe where participants should explore and what genuine evidence they should contribute."/></label>
    <label>Area or neighborhood (optional)<input maxLength={120} value={draft.area} onChange={e=>update('area',e.target.value)} placeholder="St. Louis area"/></label>
    <div className="creator-count-grid">
     {[['places','Places to explore'],['feedback','Feedback contributions'],['photos','Photos to upload'],['xp','Proposed XP (owner-reviewed)']].map(([key,label])=>
      <label key={key}>{label}<input type="number" min="0" max={key==='xp'?'500':'25'} value={draft[key]} onChange={e=>update(key,e.target.value)}/></label>)}
    </div>
    <fieldset className="creator-amenities"><legend>Amenities to discover or verify</legend>
     {OPTIONS.map(([key,label])=><label key={key}><input type="checkbox" checked={draft.amenities.includes(key)}
      onChange={e=>update('amenities',e.target.checked?[...draft.amenities,key]:draft.amenities.filter(v=>v!==key))}/>{label}</label>)}
    </fieldset>
    <div className="card-actions"><button className="primary" disabled={busy} onClick={()=>void save()}>Save private draft</button>
    {draft.id&&<button className="secondary" onClick={()=>setDraft(empty())}>New mission</button>}</div>
   </div>
  </section>}
  <section className="panel"><h2>{owner?'All creator missions':'Your missions'}</h2>
   {!mine.length&&<p>No missions yet. {owner?'Creator submissions will appear here.':'Create your first draft above.'}</p>}
   {mine.map(m=><article className="creator-mission-row" key={m.id}>
    <div className="creator-mission-head"><strong>{m.title}</strong><span className="signal-pill">{m.status.replaceAll('_',' ')}</span></div>
    {owner&&<p className="meta">{m.creator_name} {m.creator_handle||''}</p>}
    <p>{m.description}</p><RequirementSummary requirements={m.requirements}/>
    {m.review_note&&<p className="notice">Owner feedback: {m.review_note}</p>}
    <div className="card-actions">
     {!owner&&editable(m.status)&&<><button className="secondary" disabled={busy} onClick={()=>edit(m)}>Edit</button>
      <button className="primary" disabled={busy} onClick={()=>void submit(m.id)}>Submit for approval</button></>}
     {m.status==='approved'&&<a className="secondary creator-link" href={shareUrl(m.id)} target="_blank" rel="noreferrer">View approved mission</a>}
    </div>
    {owner&&m.status==='submitted'&&<div className="auth-form">
     <label>Review note<input value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Reason if requesting changes"/></label>
     <div className="card-actions">
      <button className="primary" disabled={busy} onClick={()=>void review(m.id,'approve')}>Approve mission</button>
      <button className="secondary" disabled={busy||reviewNote.trim().length<3} onClick={()=>void review(m.id,'request_changes')}>Request changes</button>
      <button className="secondary" disabled={busy||reviewNote.trim().length<3} onClick={()=>void review(m.id,'reject')}>Reject</button>
     </div></div>}
   </article>)}
  </section>
  {error&&<div className="notice error">{error}</div>}
  {message&&<div className="notice">{message}</div>}
 </div>;
}
