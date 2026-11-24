'use strict';
/* MarketPulse live research: no exchange WebSocket and no broker orders.
 * Upstox REST snapshots arrive over SSE; browser never receives a broker token.
 * A statistical forecast is a hypothesis, NOT a trained or calibrated ML probability.
 */
(()=>{
 const $=id=>document.getElementById(id), view=$('view-live');if(!view)return;
 const html=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const money=n=>Number.isFinite(+n)?'₹'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2}):'—';
 const pct=n=>Number.isFinite(+n)?(Number(n)*100).toFixed(1)+'%':'—';
 const clock=t=>Number.isFinite(t)?new Date(t).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
 const presets=['RELIANCE','TCS','HDFCBANK','INFY','SBIN','ICICIBANK'];
 const H=3, MAX=250, FRESH_MS=60000;
 view.innerHTML=`
 <div class="lt-heading"><div><span>MARKETPULSE · MARKET DATA LAB</span><h1>Live Prediction Terminal</h1><p>Authenticated Upstox REST quotes delivered by SSE. The chart uses exchange timestamps; estimates are unvalidated research, not executable trades.</p></div><b id="ltConn" class="lt-pill warn">CONNECTING</b></div>
 <section class="lt-toolbar"><label>INSTRUMENT<input id="ltSearch" placeholder="Find NSE/BSE equity" maxlength="45" autocomplete="off"></label><button id="ltFind">Find</button><div id="ltChips">${presets.map(s=>'<button data-sym="'+s+'">'+s+'</button>').join('')}</div><div id="ltTf">${[1,3,5,15].map(m=>'<button data-i="'+m+'" class="'+(m===1?'active':'')+'">'+m+'m</button>').join('')}</div></section>
 <div id="ltResults" class="lt-results" hidden></div>
 <div id="ltBanner" class="lt-banner warn">Waiting for verified provider data. No active prediction.</div>
 <div class="lt-grid"><section class="lt-card lt-chart"><header><div><small id="ltSource">NO STREAM</small><h2 id="ltTitle">Choose a stock</h2></div><div><strong id="ltLast">—</strong><small id="ltClock">—</small></div></header><div id="ltOhlc">O — H — L — C —</div><div class="lt-stage"><canvas id="ltCanvas" aria-label="Candlestick chart using Upstox historical data and time-validated quotes"></canvas></div><footer><span id="ltRate">0 updates/s</span><span id="ltLat">No exchange time</span><span>EMA 9 · EMA 21 · VWAP · volume</span></footer></section>
 <aside class="lt-aside"><section class="lt-card"><small>RESEARCH FORECAST · NEXT 3 COMPLETED BARS</small><div id="ltSignal" class="lt-signal">NO VERIFIED SIGNAL</div><div id="ltProb">—</div><p id="ltLock">Statistical class estimates, NOT calibrated profit probabilities. One forecast can be locked only after a fresh completed bar.</p></section>
 <section class="lt-card"><small>VERIFIED FORECAST TRACK RECORD</small><div id="ltScore">No resolved forward forecasts yet.</div><p>Local browser journal, separate for DEMO and LIVE. Counts resolved forecasts only; small samples do not establish an edge.</p></section></aside></div>
 <section class="lt-card"><header><h3>Forecast journal</h3><button id="ltReset" type="button">Clear local journal</button></header><div id="ltLog">No locked forecasts.</div></section>
 <p class="lt-disclosure">Read-only paper research. A REST quote is a snapshot, not an exchange tick. Sparse trades can produce gaps in candle time. No synthetic data is ever labeled LIVE and no automatic orders are sent.</p>`;
 const S={key:'',symbol:'',interval:1,mode:'DEMO',synthetic:true,bars:[],forming:null,es:null,gen:0,
  last:null,prevClose:0,fresh:false,marketOpen:false,quoteTime:0,lastRx:0,volumeCumulative:null,
  journal:[],lastBarTime:0,updates:[],dirty:true,reason:'Waiting for live data'};
 const cv=$('ltCanvas'),ctx=cv.getContext('2d');
 const bucket=t=>Math.floor(t/(S.interval*60000))*S.interval*60000;
 const normalize=c=>({t:Date.parse(c.time),o:+c.open,h:+c.high,l:+c.low,c:+c.close,v:Math.max(0,+c.volume||0)});
 function safeBars(items){
  const unique=new Map();
  for(const raw of Array.isArray(items)?items:[]){const b=normalize(raw);
   if(Number.isFinite(b.t)&&b.o>0&&b.c>0&&b.h>=Math.max(b.o,b.c)&&b.l<=Math.min(b.o,b.c))unique.set(b.t,b);
  }
  return [...unique.values()].sort((a,b)=>a.t-b.t).slice(-500);
 }
 function storageKey(){return 'marketpulse_forward_v2_'+S.mode+'_'+S.interval+'_'+S.key;}
 function persist(){
  if(!S.key)return;
  try{localStorage.setItem(storageKey(),JSON.stringify({schema:2,mode:S.mode,key:S.key,interval:S.interval,lastBarTime:S.lastBarTime,
   journal:S.journal.slice(-MAX)}));}catch(_){}
 }
 function restore(){
  S.journal=[];S.lastBarTime=0;
  try{
   const raw=JSON.parse(localStorage.getItem(storageKey())||'null');
   if(!raw||raw.schema!==2||raw.key!==S.key||raw.mode!==S.mode||raw.interval!==S.interval)return;
   S.lastBarTime=Number.isFinite(raw.lastBarTime)?raw.lastBarTime:0;
   S.journal=(Array.isArray(raw.journal)?raw.journal:[]).filter(x=>Number.isFinite(x.t)&&x.price>0&&x.side&&
    Number.isFinite(x.upper)&&Number.isFinite(x.lower)&&typeof x.outcome!=='undefined')
    .slice(-MAX).map(x=>({...x}));
  }catch(_){}
 }
 function gaussian(x){const z=Math.abs(x),t=1/(1+.2316419*z);const k=.3989422804*Math.exp(-z*z/2);
  const v=1-k*(.31938153*t-.356563782*t*t+1.781477937*t**3-1.821255978*t**4+1.330274429*t**5);
  return x>=0?v:1-v;
 }
 function forecast(bars){
  if(bars.length<35)return null;
  const cl=bars.map(x=>x.c),n=cl.length,last=cl[n-1],price=last;
  const ema=(days)=>cl.reduce((a,v,i)=>i===0?v:v*(2/(days+1))+a*(1-2/(days+1)),0);
  const ret=cl.slice(-25).map((v,i,a)=>i?Math.log(v/a[i-1]):0).slice(1);
  const sd=Math.sqrt(ret.reduce((a,x)=>a+(x-ret.reduce((p,z)=>p+z,0)/ret.length)**2,0)/Math.max(1,ret.length-1));
  const atr=bars.slice(-14).reduce((a,b)=>a+(b.h-b.l),0)/14/price;
  const sigma=Math.max(.0002,.5*sd+.5*atr/1.25)*Math.sqrt(H);
  const momentum=Math.tanh((ema(9)-ema(21))/Math.max(.0001,price*sigma));
  const recent=(price-cl[n-6])/price;
  const slope=.58*momentum+.42*Math.tanh(recent/Math.max(.0001,sigma));
  const mu=.45*slope*sigma,band=.25*sigma;
  const up=1-gaussian((band-mu)/sigma),down=gaussian((-band-mu)/sigma),flat=Math.max(0,1-up-down);
  const side=up>=down?'UP':'DOWN',confidence=Math.max(up,down);
  return {side,confidence,up,down,flat,band,upper:Math.exp(band),lower:Math.exp(-band),mu,sigma};
 }
 function resolveClosed(bar){
  if(!bar||bar.t<=S.lastBarTime)return;
  for(const item of S.journal){
   if(item.outcome!==null)continue;
   // Count only observed completed bars, not wall-clock intervals or invented bars.
   if(bar.t>item.t)item.barsSince=(item.barsSince||0)+1;
   if(item.barsSince>=H){
    const change=Math.log(bar.c/item.price);
    item.outcome=change>item.band?'UP':change<-item.band?'DOWN':'FLAT';
    item.realised=change;
   }
  }
  S.lastBarTime=bar.t;
 }
 function lock(bar){
  if(!bar||!S.fresh||!S.marketOpen||S.synthetic)return;
  if(S.journal.some(x=>x.t===bar.t))return;
  const f=forecast(S.bars);if(!f)return;
  S.journal.push({t:bar.t,price:bar.c,side:f.side,confidence:f.confidence,pUp:f.up,pDown:f.down,pFlat:f.flat,
   band:f.band,upper:f.upper,lower:f.lower,barsSince:0,outcome:null,realised:null});
  S.journal=S.journal.slice(-MAX);
 }
 function status(kind,text){
  const el=$('ltConn');el.className='lt-pill '+kind;el.textContent=text;
  $('ltBanner').className='lt-banner '+(S.synthetic?'demo':S.fresh?'good':'warn');
  $('ltBanner').textContent=S.synthetic?'SYNTHETIC DEMO: illustrative prices, no real market prediction.':(S.fresh&&S.marketOpen?'Upstox quote recent. Experimental forecast, no verified trading edge.':'NO ACTIONABLE LIVE SIGNAL · '+S.reason);
 }
 function updatePanels(){
  const b=S.bars,live=S.forming?b.concat([S.forming]):b,f=forecast(b);
  $('ltTitle').textContent=S.symbol?S.symbol+' · '+S.interval+'m':'Select a stock';
  $('ltLast').textContent=S.last!==null?money(S.last):'—';
  $('ltClock').textContent=S.quoteTime?'Exchange trade '+clock(S.quoteTime)+' IST':'No verified trade time';
  $('ltLat').textContent=S.quoteTime?Math.max(0,Math.floor((Date.now()-S.quoteTime)/1000))+'s old':'No exchange timestamp';
  $('ltRate').textContent=S.updates.length+' updates in 10s';
  const gate=!S.synthetic&&(!S.fresh||!S.marketOpen||(S.quoteTime&&Date.now()-S.quoteTime>FRESH_MS));
  const sig=$('ltSignal');
  sig.textContent=!f?'WARMING UP · '+b.length+'/35 completed bars':gate?'GATED · MARKET DATA STALE':(f.side+' BIAS'+(S.synthetic?' · DEMO':' · UNVALIDATED'));
  sig.className='lt-signal '+(gate?'blocked':f?.side==='UP'?'up':'down');
  $('ltProb').innerHTML=f?'<div class="lt-probs"><span>UP '+pct(f.up)+'</span><span>FLAT '+pct(f.flat)+'</span><span>DOWN '+pct(f.down)+'</span></div>':'Model needs 35 completed candles';
  const settled=S.journal.filter(x=>x.outcome!==null),correct=settled.filter(x=>x.side===x.outcome).length;
  const brier=settled.length?settled.reduce((a,x)=>a+(x.pUp-(x.outcome==='UP'?1:0))**2+
   (x.pFlat-(x.outcome==='FLAT'?1:0))**2+(x.pDown-(x.outcome==='DOWN'?1:0))**2,0)/settled.length:null;
  $('ltScore').textContent=settled.length?'Resolved '+settled.length+' · Direction correct '+pct(correct/settled.length)+
    ' · Brier '+brier.toFixed(3)+' · pending '+(S.journal.length-settled.length):'No completed forecast outcomes yet.';
  $('ltLog').innerHTML=S.journal.slice(-10).reverse().map(x=>'<div class="lt-log-row"><span>'+clock(x.t)+'</span><b>'+html(x.side)+'</b><span>'+pct(x.confidence)+'</span><span>'+html(x.outcome||'PENDING')+'</span></div>').join('')||'No locked forecasts.';
  if(live.length)draw();else {ctx.clearRect(0,0,cv.width,cv.height);}
 }
 function draw(){
  const bars=S.forming?S.bars.concat([S.forming]):S.bars;
  const all=bars.slice(-90),w=$('ltCanvas').parentElement.clientWidth,h=440;
  if(w<10)return;const dpr=window.devicePixelRatio||1;
  cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.width=w+'px';cv.style.height=h+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(all.length<2)return;
  const hi=Math.max(...all.map(x=>x.h)),lo=Math.min(...all.map(x=>x.l)),pad=Math.max(.01,(hi-lo)*.08);
  const top=hi+pad,bottom=lo-pad,L=8,R=w-65,T=12,B=h-95,step=(R-L)/all.length,volBase=h-14;
  const y=p=>T+(top-p)/(top-bottom)*(B-T),x=i=>L+step*(i+.5);
  for(let i=0;i<=5;i++){const val=bottom+(top-bottom)*i/5,Y=y(val);ctx.strokeStyle='#223d50';ctx.beginPath();ctx.moveTo(L,Y);ctx.lineTo(R,Y);ctx.stroke();ctx.fillStyle='#95b5c6';ctx.font='11px monospace';ctx.fillText(val.toFixed(2),R+7,Y);}
  const maxVol=Math.max(1,...all.map(b=>b.v));
  for(let i=0;i<all.length;i++){const b=all[i],col=b.c>=b.o?'#27dfae':'#ef708e',X=x(i);
   ctx.strokeStyle=col;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(X,y(b.h));ctx.lineTo(X,y(b.l));ctx.stroke();
   ctx.fillRect(X-step*.3,Math.min(y(b.o),y(b.c)),Math.max(1,step*.6),Math.max(1,Math.abs(y(b.o)-y(b.c))));
   ctx.globalAlpha=.27;ctx.fillRect(X-step*.28,volBase-b.v/maxVol*65,Math.max(1,step*.56),b.v/maxVol*65);ctx.globalAlpha=1;
  }
  const closes=bars.map(b=>b.c);
  const line=(period,color)=>{let v=closes[0],points=closes.map((p,i)=>v=i?p*(2/(period+1))+v*(1-2/(period+1)):p);
   points=points.slice(-all.length);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();
   points.forEach((p,i)=>i?ctx.lineTo(x(i),y(p)):ctx.moveTo(x(i),y(p)));ctx.stroke();};
  line(9,'#e9ca77');line(21,'#82acff');
  ctx.fillStyle='#90adbd';ctx.font='10px sans-serif';for(let i=0;i<all.length;i+=Math.max(1,Math.floor(all.length/7)))ctx.fillText(clock(all[i].t),x(i),h-3);
  const last=all[all.length-1];$('ltOhlc').textContent=clock(last.t)+' IST · O '+money(last.o)+' H '+money(last.h)+' L '+money(last.l)+' C '+money(last.c)+' V '+Math.round(last.v);
 }
 function loadSnapshot(snap){
  let rows=safeBars(snap.candles);
  if(S.synthetic){const now=bucket(Date.now()),step=S.interval*60000;rows=rows.map((b,i)=>({...b,t:now-(rows.length-i)*step}));}
  const nowBucket=bucket(Date.now());
  S.forming=null;
  // Snapshot intervals already contain exchange candles. Never fabricate elapsed
  // intervals or convert an old quote into a candle for the current clock time.
  if(rows.length&&rows.at(-1).t>=nowBucket)S.forming=rows.pop();
  S.bars=rows;S.last=rows.length?rows.at(-1).c:null;
  restore();
  for(const b of S.bars)if(b.t>S.lastBarTime)resolveClosed(b); // resolve prior live forecasts only
  persist();updatePanels();
 }
 function onTick(d){
  const received=Date.now(),price=Number(d.price),synthetic=d.synthetic===true;
  if(!(price>0)||synthetic!==S.synthetic)return;
  S.last=price;S.lastRx=received;
  if(+d.previousClose>0)S.prevClose=+d.previousClose;
  const exchangeTime=synthetic?received:Date.parse(d.exchangeTime);
  const validTime=synthetic||(Number.isFinite(exchangeTime)&&exchangeTime<=received+5000&&exchangeTime>=received-FRESH_MS);
  S.quoteTime=validTime?exchangeTime:0;
  S.marketOpen=synthetic?false:d.marketOpen===true;
  S.fresh=synthetic?false:d.fresh===true&&validTime&&S.marketOpen;
  S.reason=validTime?'Quote not fresh or market closed':'Missing, delayed, or future exchange trade timestamp';
  S.updates.push(received);S.updates=S.updates.filter(t=>received-t<10000);
  // Stale quotes update last price only; they must never create, advance, or
  // resolve a model candle. Exchange timestamps decide all genuine buckets.
  if(!synthetic&&!S.fresh){status('bad','STALE / MARKET CLOSED');updatePanels();return;}
  const time=bucket(exchangeTime);
  if(S.forming&&time<S.forming.t)return; // out-of-order response
  if(time<=S.lastBarTime)return; // duplicate exchange trade in a finalized bar
  let dv=Math.max(0,+d.volume||0);
  if(!synthetic){dv=S.volumeCumulative===null?0:Math.max(0,dv-S.volumeCumulative);S.volumeCumulative=Math.max(0,+d.volume||0);}
  if(S.forming&&time>S.forming.t){
   const finished=S.forming;S.bars.push(finished);S.bars=S.bars.slice(-500);S.forming=null;
   resolveClosed(finished);lock(finished);persist();
  }
  if(!S.forming)S.forming={t:time,o:price,h:price,l:price,c:price,v:0};
  S.forming.c=price;S.forming.h=Math.max(price,S.forming.h);S.forming.l=Math.min(price,S.forming.l);
  S.forming.v+=dv;S.dirty=true;status(synthetic?'demo':'good',synthetic?'SYNTHETIC DEMO':'UPSTOX REST · RECENT');updatePanels();
 }
 function connect(){
  if(S.es){S.es.close();S.es=null;}
  const id=++S.gen;S.fresh=false;S.quoteTime=0;S.marketOpen=false;S.forming=null;S.bars=[];S.volumeCumulative=null;
  S.last=null;S.updates=[];status('warn','CONNECTING');
  if(!S.key)return;
  const es=new EventSource('/api/live/stream?'+new URLSearchParams({key:S.key,interval:String(S.interval)}));S.es=es;
  es.addEventListener('hello',e=>{if(id!==S.gen)return;const j=JSON.parse(e.data);S.mode=j.mode;S.synthetic=j.mode!=='LIVE';S.marketOpen=!!j.marketOpen;S.reason='Waiting for verified quote';$('ltSource').textContent=j.source;status(S.synthetic?'demo':'warn','CONNECTED · WAITING');});
  es.addEventListener('snapshot',e=>{if(id===S.gen)loadSnapshot(JSON.parse(e.data));});
  es.addEventListener('tick',e=>{if(id===S.gen)onTick(JSON.parse(e.data));});
  es.addEventListener('status',e=>{if(id!==S.gen)return;const j=JSON.parse(e.data);
   S.marketOpen=j.marketOpen===true;
   S.fresh=!S.synthetic&&!j.error&&j.fresh===true&&S.marketOpen&&S.quoteTime>0&&Date.now()-S.quoteTime<=FRESH_MS;
   S.reason=j.message||'Provider status unknown';
   status(S.fresh?'good':'bad',S.fresh?'UPSTOX REST · RECENT':'WAIT · NO FRESH QUOTE');updatePanels();});
  es.addEventListener('bye',()=>{S.fresh=false;S.reason='Stream rotating';updatePanels();});
  es.onerror=()=>{if(id!==S.gen)return;S.fresh=false;S.reason='Connection interrupted';status('bad','RECONNECTING');updatePanels();};
 }
 async function pick(query){
  let item=null;try{
   const r=await fetch('/api/universe/search?'+new URLSearchParams({query,segment:'EQ'}),{cache:'no-store'});
   if(!r.ok)throw Error('Search API failed');
   const j=await r.json();item=(j.instruments||[]).find(x=>x.symbol?.toUpperCase()===query.toUpperCase())||(j.instruments||[])[0];
  }catch(err){S.reason=err.message;status('bad','SEARCH UNAVAILABLE');return;}
  if(!item)return status('bad','INSTRUMENT NOT FOUND');
  S.key=item.key;S.symbol=item.symbol;S.gen++;$('ltResults').hidden=true;connect();
 }
 let timer=null;
 $('ltSearch').addEventListener('input',e=>{clearTimeout(timer);const q=e.target.value.trim();if(q.length<2){$('ltResults').hidden=true;return;}
  timer=setTimeout(async()=>{try{
   const r=await fetch('/api/universe/search?'+new URLSearchParams({query:q,segment:'EQ'}));const d=await r.json();
   $('ltResults').innerHTML=(d.instruments||[]).slice(0,8).map(x=>'<button data-key="'+html(x.key)+'" data-name="'+html(x.symbol)+'">'+html(x.symbol)+' · '+html(x.exchange)+'</button>').join('')||'No matches';
   $('ltResults').hidden=false;
  }catch(_){}},300);
 });
 $('ltResults').addEventListener('click',e=>{const b=e.target.closest('[data-key]');if(!b)return;S.key=b.dataset.key;S.symbol=b.dataset.name;connect();$('ltResults').hidden=true;});
 $('ltFind').addEventListener('click',()=>pick($('ltSearch').value.trim()));
 $('ltChips').addEventListener('click',e=>{const b=e.target.closest('[data-sym]');if(b)pick(b.dataset.sym);});
 $('ltTf').addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;S.interval=+b.dataset.i;for(const x of $('ltTf').children)x.classList.toggle('active',x===b);connect();});
 $('ltReset').addEventListener('click',()=>{if(!confirm('Clear local forecast journal for this instrument and interval?'))return;
  S.journal=[];S.lastBarTime=0;try{localStorage.removeItem(storageKey());}catch(_){}updatePanels();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(S.es){S.es.close();S.es=null;}S.fresh=false;}else if(!view.classList.contains('hidden')&&S.key&&!S.es)connect();});
 const start=()=>{if(!S.key)pick(presets[0]);else if(!S.es)connect();};
 const stop=()=>{if(S.es)S.es.close();S.es=null;S.fresh=false;S.gen++;status('warn','PAUSED');};
 window.MarketPulseLive={state:S,start,stop,draw,renderScore:updatePanels};
 setInterval(()=>{if(!S.synthetic&&S.fresh&&S.quoteTime&&Date.now()-S.quoteTime>FRESH_MS){S.fresh=false;S.reason='Exchange trade timestamp expired';status('bad','STALE');updatePanels();}},1000);
 window.addEventListener('resize',draw);
 if(location.hash==='#live')start();
})();