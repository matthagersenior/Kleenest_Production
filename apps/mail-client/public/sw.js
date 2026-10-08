/* Kleenest Mail: cache only app shell, never private mail/API responses. */
const VERSION='kleenest-mail-shell-v2';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
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
self.addEventListener('push',event=>{
  let item={};
  try{item=event.data?.json()||{}}catch{return;}
  if(item.type!=='kleenest-mail'&&item.data?.type!=='kleenest-mail')return;
  const target=new URL(String(item.url||'./'),self.registration.scope);
  const scope=new URL(self.registration.scope);
  if(target.origin!==scope.origin||!target.pathname.startsWith(scope.pathname))return;
  event.waitUntil(self.registration.showNotification('Kleenest Mail',{
    body:String(item.body||'New mail received').slice(0,160),
    icon:'./app-icon.png',badge:'./app-icon.png',
    tag:String(item.tag||'kleenest-mail'),data:{url:target.href}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const scope=new URL(self.registration.scope);
    const target=new URL(String(event.notification.data?.url||scope.href),scope);
    if(target.origin!==scope.origin||!target.pathname.startsWith(scope.pathname))return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===scope.origin&&new URL(client.url).pathname.startsWith(scope.pathname));
    if(existing){await existing.navigate(target.href);return existing.focus();}
    return self.clients.openWindow(target.href);
  })());
});
