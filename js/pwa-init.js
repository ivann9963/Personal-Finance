// === PWA SETUP ===
function setupPWA() {
  const iconSvg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#0D1117"/><polyline points="24,148 64,104 96,116 136,68 168,44" stroke="#F0B429" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="168" cy="44" r="10" fill="#F0B429"/></svg>`;
  const iconB64=btoa(iconSvg);
  const manifest={name:'Finance',short_name:'Finance',display:'standalone',orientation:'portrait',
    theme_color:'#0D1117',background_color:'#0D1117',start_url:'.',
    icons:[{src:`data:image/svg+xml;base64,${iconB64}`,sizes:'192x192',type:'image/svg+xml'},
           {src:`data:image/svg+xml;base64,${iconB64}`,sizes:'512x512',type:'image/svg+xml'}]};
  const mb=new Blob([JSON.stringify(manifest)],{type:'application/json'});
  const ml=document.createElement('link'); ml.rel='manifest'; ml.href=URL.createObjectURL(mb);
  document.head.appendChild(ml);
  const tl=document.createElement('link'); tl.rel='apple-touch-icon'; tl.href=`data:image/svg+xml;base64,${iconB64}`;
  document.head.appendChild(tl);
  if ('serviceWorker' in navigator) {
    // Network-first: always fetch the latest when online (so updates ship immediately), fall
    // back to cache offline. skipWaiting + clients.claim make a new version take over at once.
    const sw=`const C='finance-v2';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.map(k=>k!==C&&caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith((async()=>{
    try{const fresh=await fetch(e.request);const cache=await caches.open(C);cache.put(e.request,fresh.clone());return fresh;}
    catch(err){const cached=await caches.match(e.request);return cached||Response.error();}
  })());
});`;
    const swBlob=new Blob([sw],{type:'application/javascript'});
    navigator.serviceWorker.register(URL.createObjectURL(swBlob)).catch(()=>{});
  }
}

// === INIT ===
function init() {
  setupPWA();
  S = loadState();
  applyTheme();
  window.matchMedia('(prefers-color-scheme:light)').addEventListener('change',()=>{ if(S.settings.theme==='system') applyTheme(); });
  if (!S.onboardingComplete || !S.accounts.length) {
    showOnboarding();
  } else {
    generateRecurring();
    saveState();
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('main').classList.remove('hidden');
    document.getElementById('fab').classList.remove('hidden');
    renderDashboard(); _tabsInit['dashboard']=true;
  }
  if (typeof initHaptics === 'function') initHaptics(); // overlay haptic switches on nav tabs + buttons (+ watch for new ones)
  if (typeof initCloudBackup === 'function') initCloudBackup(); // adopt magic-link session tokens if present in the URL hash
}
init();
