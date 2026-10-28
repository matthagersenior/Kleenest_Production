/* Kleenest web advertising preference. Default: no advertising scripts. */
(() => {
  'use strict';
  const KEY='kleenest-web-ads-consent-v1';
  const client=document.currentScript?.dataset.adsenseClient;
  const valid=/^ca-pub-\d+$/.test(client||'');
  let choice=null;
  try { choice=localStorage.getItem(KEY); } catch { /* private mode */ }
  function loadAds() {
    if(!valid||document.querySelector('script[data-kleenest-ads-loaded]'))return;
    const script=document.createElement('script');
    script.async=true;
    script.crossOrigin='anonymous';
    script.dataset.kleenestAdsLoaded='true';
    script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+client;
    document.head.appendChild(script);
  }
  function store(value) {
    choice=value;
    try { localStorage.setItem(KEY,value); } catch { /* nonpersistent choice */ }
    document.getElementById('kleenest-ad-preferences')?.remove();
    if(value==='accepted')loadAds();
  }
  function showPreferences() {
    if(document.getElementById('kleenest-ad-preferences'))return;
    const panel=document.createElement('section');
    panel.id='kleenest-ad-preferences';
    panel.setAttribute('aria-label','Advertising preferences');
    panel.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483646;background:#fff;color:#173d2b;border:2px solid #173d2b;border-radius:12px;padding:16px;box-shadow:0 4px 22px #0004;font:16px system-ui,sans-serif;max-width:520px;margin:auto';
    const message=document.createElement('p');
    message.textContent='Kleenest uses optional advertising scripts. Choose whether to allow advertising on this device. Restroom discovery works without them.';
    panel.appendChild(message);
    for(const [label,value] of [['Decline optional ads','declined'],['Allow ads','accepted']]){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label;
      button.style.cssText='padding:10px;margin:4px;border:1px solid #173d2b;border-radius:8px;background:'+(value==='accepted'?'#173d2b':'#fff')+';color:'+(value==='accepted'?'#fff':'#173d2b')+';cursor:pointer';
      button.addEventListener('click',()=>store(value));
      panel.appendChild(button);
    }
    document.body.appendChild(panel);
  }
  function init() {
    if(choice==='accepted')loadAds();
    else if(choice!=='declined')showPreferences();
    const manage=document.createElement('button');
    manage.type='button';
    manage.textContent='Advertising preferences';
    manage.setAttribute('aria-label','Change advertising preferences');
    manage.style.cssText='position:fixed;bottom:0;right:0;z-index:2147483645;padding:4px 8px;font:12px system-ui;background:#fff;color:#173d2b;border:1px solid #173d2b;border-radius:5px';
    manage.addEventListener('click',showPreferences);
    document.body.appendChild(manage);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
