import { useEffect, useState } from 'react';
import { listFollowers, listFollowing, searchPeople, toggleFollow } from '../services/social.js';

export default function SocialPage(){
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [following,setFollowing]=useState([]);
  const [followers,setFollowers]=useState([]);
  const [status,setStatus]=useState('loading');
  const [message,setMessage]=useState('');

  const refreshNetwork=async()=>{
    const [followingRows,followerRows]=await Promise.all([listFollowing(),listFollowers()]);
    setFollowing(followingRows); setFollowers(followerRows);
  };

  useEffect(()=>{let active=true;refreshNetwork().then(()=>active&&setStatus('ready')).catch((err)=>{if(active){setMessage(err?.message||'Social network could not be loaded.');setStatus('ready');}});return()=>{active=false;};},[]);

  const runSearch=async()=>{
    setMessage('');
    try{setResults(await searchPeople(query));}catch(err){setMessage(err?.message||'People search failed.');}
  };

  const toggle=async(userId)=>{
    setMessage('');
    try{await toggleFollow(userId);await refreshNetwork();setMessage('Follow state updated.');}catch(err){setMessage(err?.message||'Follow state could not be updated.');}
  };

  const followingIds=new Set(following.map((profile)=>profile.id));
  const Person=({profile})=><article className="place-card"><div className="place-main"><h2>{profile.display_name||profile.username||'Kleenest member'}</h2><p>{profile.username?`@${profile.username}`:profile.bio||'Community member'}</p><div className="meta">{[profile.level?`Level ${profile.level}`:null,profile.points!=null?`${profile.points} pts`:null].filter(Boolean).join(' · ')}</div></div><button className={followingIds.has(profile.id)?'secondary':'primary'} onClick={()=>toggle(profile.id)}>{followingIds.has(profile.id)?'Following':'Follow'}</button></article>;

  return <><section className="panel"><div className="eyebrow">SOCIAL</div><h1>Find people</h1><p>Search contributors and build your Kleenest network.</p><div className="inline-form"><input value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&runSearch()} placeholder="Name or username"/><button className="primary" onClick={runSearch} disabled={query.trim().length<2}>Search</button></div>{message&&<div className="notice">{message}</div>}</section>{status==='loading'?<section className="panel"><p>Loading your network…</p></section>:<><section className="panel compact"><h2>Following · {following.length}</h2><p>Followers · {followers.length}</p></section><section className="results">{results.map((profile)=><Person key={profile.id} profile={profile}/>)}</section></>}</>;
}
