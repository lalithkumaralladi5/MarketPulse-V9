'use strict';
/* Global market prices are third-party public-provider candles, NOT Upstox. No orders. */
(()=>{
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(n,d=2)=>Number.isFinite(+n)?Number(n).toLocaleString('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const state={items:[],key:'',symbol:'',interval:5,bars:[],currency:'',hover:-1,seq:0};
 async function get(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),18000);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'HTTP '+r.status);return d;}finally{clearTimeout(t);}}
 function init(){
  const root=$('view-global'),quality=$('view-quality');if(!root||!quality)return;
  root.innerHTML=[
   '<header class="gm-hero"><div><span>INTERNATIONAL MARKET RESEARCH</span><h1>Global Markets</h1><p>Explore US equities, major forex pairs and commodity futures on real public-provider OHLC candles. This feed is separate from Upstox and may be delayed or unavailable.</p></div><b>READ ONLY · PUBLIC PROVIDER</b></header>',
   '<section class="gm-controls"><select id="gmCategory"><option value="ALL">All markets</option><option value="US STOCKS">US stocks</option><option value="FOREX">Forex</option><option value="COMMODITIES">Commodities</option></select><input id="gmSearch" placeholder="Search AAPL, Gold, EURUSD…" maxlength="60"><button id="gmGo">Search</button></section>',
   '<div class="gm-layout"><section class="gm-panel"><div class="gm-head"><strong>Instruments</strong><small id="gmCount">Loading</small></div><div id="gmList" class="gm-list">Loading catalogue…</div></section>',
   '<section class="gm-panel gm-chart"><div class="gm-head"><div><small id="gmSource">NO DATA</small><h2 id="gmTitle">Choose an instrument</h2></div><div><strong id="gmPrice">—</strong><small id="gmCurrency"></small></div></div><nav id="gmTf" aria-label="Chart interval">',
    ...[1,5,15,30,60].map(n=>'<button data-tf="'+n+'" class="'+(n===5?'active':'')+'">'+n+'m</button>'),
   '</nav><div class="gm-status" id="gmStatus">Choose an instrument to view historical candles.</div><div class="gm-stage"><canvas id="gmCanvas" aria-label="International market candlestick chart"></canvas></div><div id="gmOhlc" class="gm-ohlc">No candle selected</div></section></div>',
   '<p class="gm-note">Curated symbols, not a complete global exchange catalogue. Yahoo Finance public chart access is unofficial and may be subject to licensing, availability and delay. No synthetic fallback, brokerage orders or Upstox token exposure.</p>'
  ].join('');
  quality.innerHTML=[
   '<header class="gm-hero"><div><span>DATA PROVENANCE</span><h1>Market Data Diagnostics</h1><p>Verify server health, ML readiness and whether the selected Indian contract has a usable live quote. A server connection does not prove prediction accuracy.</p></div><b>EVIDENCE FIRST</b></header>',
   '<button id="gmRefresh" class="gm-refresh">Refresh data checks</button><div class="gm-diagnostics">',
   '<section class="gm-panel"><h2>App status</h2><p id="gmHealth">Checking…</p></section>',
   '<section class="gm-panel"><h2>ML evidence</h2><p id="gmModel">Checking…</p></section>',
   '<section class="gm-panel"><h2>Selected market quote</h2><p id="gmQuote">Choose an NSE/BSE stock or option in Markets first.</p></section></div>',
   '<p class="gm-note">Live trading is disabled. Fresh REST snapshots, model test accuracy and forward results are different facts and must not be conflated.</p>'
  ].join('');
  $('gmGo').addEventListener('click',list);
  $('gmSearch').addEventListener('keydown',e=>{if(e.key==='Enter')list();});
  $('gmCategory').addEventListener('change',list);
  $('gmTf').addEventListener('click',e=>{const b=e.target.closest('[data-tf]');if(!b)return;state.interval=+b.dataset.tf;$('gmTf').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));if(state.key)chart();});
  $('gmList').addEventListener('click',e=>{const b=e.target.closest('[data-item]');if(!b)return;const item=state.items[+b.dataset.item];if(!item)return;state.key=item.key;state.symbol=item.symbol;chart();$('gmList').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));});
  $('gmRefresh').addEventListener('click',diagnostics);
  const cv=$('gmCanvas');cv.addEventListener('mousemove',e=>{const a=state.bars;if(!a.length)return;const rect=cv.getBoundingClientRect(),end=rect.width-75;state.hover=Math.max(0,Math.min(a.length-1,Math.floor((e.clientX-rect.left-10)/Math.max(1,(end-10)/a.length))));draw();});
  cv.addEventListener('mouseleave',()=>{state.hover=-1;draw();});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(draw).observe(cv.parentElement);
  window.addEventListener('hashchange',()=>{if(location.hash==='#global')requestAnimationFrame(draw);if(location.hash==='#quality')diagnostics();});
  document.addEventListener('click',e=>{const link=e.target.closest('a[href="#quality"],a[href="#global"]');if(!link)return;if(link.getAttribute('href')==='#quality')queueMicrotask(diagnostics);else requestAnimationFrame(draw);});
  list();if(location.hash==='#quality')diagnostics();
 }
 async function list(){
  $('gmList').textContent='Searching…';
  try{const j=await get('/api/global/search?'+new URLSearchParams({category:$('gmCategory').value,query:$('gmSearch').value.trim()}));
   state.items=j.instruments||[];$('gmCount').textContent=state.items.length+' symbols';
   $('gmList').innerHTML=state.items.map((x,i)=>'<button type="button" data-item="'+i+'"><span><b>'+esc(x.symbol)+'</b><small>'+esc(x.name)+'</small></span><small>'+esc(x.category)+'</small></button>').join('')||'No matching instruments';
  }catch(e){$('gmList').textContent='Catalogue unavailable: '+e.message;}
 }
 async function chart(){
  const seq=++state.seq,key=state.key,interval=state.interval;state.bars=[];state.hover=-1;
  $('gmTitle').textContent=state.symbol;$('gmSource').textContent='REQUESTING PUBLIC DATA';$('gmStatus').textContent='Loading provider candles…';$('gmPrice').textContent='—';draw();
  try{const j=await get('/api/global/chart?'+new URLSearchParams({key,interval}));
   if(seq!==state.seq)return;
   state.currency=j.currency||'';state.bars=(j.candles||[]).map(b=>({t:Date.parse(b.time),o:+b.open,h:+b.high,l:+b.low,c:+b.close,v:+b.volume||0}))
    .filter(b=>Number.isFinite(b.t)&&b.o>0&&b.c>0&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c)).sort((a,b)=>a.t-b.t).slice(-140);
   $('gmPrice').textContent=fmt(j.ltp>0?j.ltp:state.bars.at(-1)?.c);$('gmCurrency').textContent=state.currency;
   $('gmSource').textContent='PUBLIC PROVIDER · '+state.bars.length+' CANDLES';$('gmStatus').textContent='Provider candles (may be delayed) · not Upstox';draw();
  }catch(e){if(seq!==state.seq)return;$('gmStatus').textContent=e.message+' · No fabricated fallback';$('gmSource').textContent='PROVIDER UNAVAILABLE';$('gmOhlc').textContent='No valid OHLC data';draw();}
 }
 function draw(){
  const cv=$('gmCanvas'),root=$('view-global');if(!cv||root?.classList.contains('hidden'))return;
  const w=cv.parentElement.clientWidth;if(w<35)return;const h=Math.max(340,Math.min(540,w*.56)),dpr=Math.min(2,devicePixelRatio||1);
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.width=w+'px';cv.style.height=h+'px';}
  const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  const a=state.bars;if(!a.length)return;
  let hi=Math.max(...a.map(b=>b.h)),lo=Math.min(...a.map(b=>b.l));const pad=Math.max((hi-lo)*.07,hi*.0002);hi+=pad;lo-=pad;
  const L=10,R=Math.max(65,w-82),T=12,B=h-95,base=h-20,step=(R-L)/a.length,barW=Math.max(1,Math.min(14,step*.65)),maxV=Math.max(1,...a.map(b=>b.v));
  const y=p=>T+(hi-p)/(hi-lo)*(B-T),x=i=>L+(i+.5)*step;
  c.font='10px monospace';
  for(let g=0;g<=5;g++){const v=lo+(hi-lo)*g/5,Y=y(v);c.strokeStyle='#274151';c.beginPath();c.moveTo(L,Y);c.lineTo(R,Y);c.stroke();c.fillStyle='#94acbe';c.fillText(fmt(v),R+5,Y+4);}
  for(let i=0;i<a.length;i++){const b=a[i],X=x(i),col=b.c>=b.o?'#35d9a9':'#f08097';c.strokeStyle=col;c.fillStyle=col;c.beginPath();c.moveTo(X,y(b.h));c.lineTo(X,y(b.l));c.stroke();c.fillRect(X-barW/2,Math.min(y(b.o),y(b.c)),barW,Math.max(1,Math.abs(y(b.o)-y(b.c))));c.globalAlpha=.35;c.fillRect(X-barW/2,base-b.v/maxV*60,barW,b.v/maxV*60);c.globalAlpha=1;}
  const stamp=t=>new Date(t).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
  c.font='10px system-ui';c.textAlign='center';const labels=Math.max(1,Math.ceil(a.length/Math.max(2,Math.floor(w/105))));for(let i=0;i<a.length;i+=labels)c.fillText(stamp(a[i].t),x(i),h-5);
  const b=a[state.hover>=0?state.hover:a.length-1];$('gmOhlc').textContent=stamp(b.t)+' IST · O '+fmt(b.o)+' H '+fmt(b.h)+' L '+fmt(b.l)+' C '+fmt(b.c)+' V '+fmt(b.v,0);
 }
 async function diagnostics(){
  if(!$('gmHealth'))return;
  try{const h=await get('/api/health');$('gmHealth').textContent=(h.ok?'HEALTHY':'UNHEALTHY')+' · '+h.mode+' · '+(h.release||'Version unknown')+' · '+(h.liveStream||'Stream unknown');}
  catch(e){$('gmHealth').textContent='Health failed: '+e.message;}
  try{const m=await get('/api/ml/status');const metrics=m.metadata?.metrics||{};
   $('gmModel').textContent=m.ready?'Trained model loaded · source '+(m.metadata?.source||'unknown')+' · held-out classification accuracy '+(Number.isFinite(+metrics.testAccuracy)?fmt(metrics.testAccuracy*100,1)+'%':'unavailable'):'Model unavailable · '+(m.reason||'Training required');}
  catch(e){$('gmModel').textContent='Model status unavailable: '+e.message;}
  const inst=window.MarketPulseTerminal?.getInstrument?.();if(!inst){$('gmQuote').textContent='Choose an Indian contract from Markets or the heatmap first.';return;}
  try{const q=await get('/api/universe/quote?'+new URLSearchParams({key:inst.key}));$('gmQuote').textContent=inst.symbol+' · '+q.mode+' · '+(q.fresh?'RECENT':'STALE / CLOSED')+' · age '+(q.ageSeconds??'unknown')+' seconds · '+fmt(q.ltp)+' INR';}
  catch(e){$('gmQuote').textContent='Quote unavailable: '+e.message;}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();