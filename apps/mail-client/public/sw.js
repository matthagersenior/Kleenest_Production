/* Kleenest Mail: cache only application shell; never cache private mail/API responses. */
const VERSION='kleenest-mail-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(self.skipWaiting());});
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>caches.match('./')));
    return;
  }
  const path=new URL(request.url).pathname;
  if(!/\.(js|css|svg|png|webmanifest)$/.test(path))return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&response.type==='basic')caches.open(VERSION).then(c=>c.put(request,response.clone()));
    return response;
  }).catch(()=>caches.match(request)));
});
