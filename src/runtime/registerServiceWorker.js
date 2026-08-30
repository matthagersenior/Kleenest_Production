export function registerServiceWorker(){
  if(!('serviceWorker'in navigator))return;
  window.addEventListener('load',()=>{navigator.serviceWorker.register('/Kleenest_Production/sw.js',{scope:'/Kleenest_Production/'}).catch(error=>console.warn('Kleenest service worker registration failed.',error));},{once:true});
}
