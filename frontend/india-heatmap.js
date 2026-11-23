'use strict';
/* MarketPulse full NSE/BSE equity catalogue. No fabricated live quotes. */
(()=>{
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=x=>Number(x||0).toLocaleString('en-IN');
 const price=x=>x==null?'—':'₹'+Number(x).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
 const change=x=>x==null?'NO QUOTE':(x>=0?'+':'')+Number(x).toFixed(2)+'%';
 const state={exchange:'NSE',page:1,size:100,sort:'mosaic',query:'',series:'ALL',preview:false,seq:0,data:null};
 let debounce;
 const buckets=['A–D','E–H','I–M','N–R','S–Z','Other'];
 function group(symbol,sector){
  if(sector&&sector!=='UNCLASSIFIED')return sector;
  const c=(symbol||'').toUpperCase().charAt(0);
  return c>='A'&&c<='D'?buckets[0]:c>='E'&&c<='H'?buckets[1]:
   c>='I'&&c<='M'?buckets[2]:c>='N'&&c<='R'?buckets[3]:
   c>='S'&&c<='Z'?buckets[4]:buckets[5];
 }
 function illustrative(symbol){
  let h=2166136261;for(const c of symbol)h=Math.imul(h^c.charCodeAt(0),16777619);
  return (((h>>>0)%1601)-800)/100;
 }
 function layout(list,x,y,w,h,out){
  if(!list.length)return;
  if(list.length===1){out.push({...list[0],x,y,w,h});return;}
  const total=list.reduce((a,b)=>a+b.weight,0);let seen=0,cut=1,best=Infinity;
  for(let i=1;i<list.length;i++){seen+=list[i-1].weight;const diff=Math.abs(seen-total/2);if(diff<best){best=diff;cut=i;}}
  const first=list.slice(0,cut),second=list.slice(cut),ratio=first.reduce((a,b)=>a+b.weight,0)/total;
  if(w>=h){layout(first,x,y,w*ratio,h,out);layout(second,x+w*ratio,y,w*(1-ratio),h,out);}
  else{layout(first,x,y,w,h*ratio,out);layout(second,x,y+h*ratio,w,h*(1-ratio),out);}
 }
 function tile(x){
  const demo=x.changePct==null&&state.preview;
  const pct=x.changePct!=null?x.changePct:demo?illustrative(x.symbol):null;
  const a=Math.min(8,Math.abs(pct||0))/8;
  const bg=pct==null?'#354457':pct>0?'hsl(153 54% '+Math.round(27+a*14)+'%)':pct<0?
   'hsl(356 60% '+Math.round(29+a*13)+'%)':'#455669';
  const b=document.createElement('button');b.type='button';b.className='ih-tile';
  b.dataset.key=x.key;b.title=x.name+' · '+x.exchange+' · '+(demo?'Illustrative palette, NOT real prices':change(pct));
  b.style.left=(x.x*100)+'%';b.style.top=(x.y*100)+'%';b.style.width=(x.w*100)+'%';
  b.style.height=(x.h*100)+'%';b.style.backgroundColor=bg;
  if(!x.fresh)b.classList.add('ih-stale');
  if(demo)b.classList.add('ih-preview-tile');
  const large=x.w>.16&&x.h>.19,medium=x.w>.11&&x.h>.10;
  b.innerHTML=(large?'<span class="ih-logo">'+esc(x.symbol.slice(0,2))+'</span>':'')+
   '<strong>'+esc(x.symbol)+'</strong>'+
   (medium?'<span>'+esc(demo?'PREVIEW '+change(pct):change(pct))+'</span>':'')+
   (large?'<small>'+esc(demo?'ILLUSTRATIVE':price(x.ltp))+'</small>':'');
  return b;
 }
 function render(){
  const data=state.data,container=$('ihMosaic');if(!container||!data)return;
  container.innerHTML='';
  $('ihPreviewNote').hidden=!state.preview;
  if(!data.items.length){container.innerHTML='<div class="ih-message">No stock matched the current filter.</div>';return;}
  const sections=new Map();
  for(const item of data.items){const k=group(item.symbol,item.sector);if(!sections.has(k))sections.set(k,[]);sections.get(k).push(item);}
  for(const [name,items] of sections){
   const section=document.createElement('section');section.className='ih-group';
   section.innerHTML='<header><b>'+esc(name)+'</b><small>'+items.length+' stocks</small></header><div class="ih-group-map"></div>';
   const weighted=items.map(x=>({...x,weight:x.turnoverProxy?Math.min(8,Math.max(1,Math.sqrt(x.turnoverProxy/2e8))):1}));
   const positions=[];layout(weighted,0,0,1,1,positions);
   for(const row of positions)section.lastElementChild.append(tile(row));
   container.append(section);
  }
 }
 function tabs(){
  document.querySelectorAll('[data-market-exchange]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.marketExchange===state.exchange)));
 }
 async function enrichQuotes(seq,filters){
  if(state.data?.mode!=='LIVE'||!state.data.items?.length)return;
  const request=new URLSearchParams(filters);request.set('quotes','true');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),37000);
  try{
   const response=await fetch('/api/india-heatmap/page?'+request,{cache:'no-store',signal:controller.signal});
   const j=await response.json();
   if(!response.ok)throw Error(j.error||'Upstox quote batch error');
   if(seq!==state.seq)return;
   state.data=j;
   $('ihQuoted').textContent=j.quoteCount+' / '+j.items.length;
   $('ihFresh').textContent=j.freshQuoteCount+' / '+j.quoteCount;
   $('ihProvenance').textContent=(j.quoteError||j.quoteScope)+' · '+j.areaMeaning;
   $('ihMode').textContent=j.quoteCount?'UPSTOX · '+j.quoteCount+' VERIFIED QUOTES':'UPSTOX · CATALOGUE / NO QUOTES';
   render();
  }catch(e){
   if(seq!==state.seq)return;
   $('ihProvenance').textContent='Catalogue loaded; quote update unavailable ('+String(e.name==='AbortError'?'Upstox request timed out':e.message)+'). Use Refresh to retry.';
   $('ihMode').textContent='UPSTOX · CATALOGUE READY';
  }finally{clearTimeout(timer);}
 }
 async function load(){
  if(!$('ihMosaic'))return;const seq=++state.seq;tabs();
  $('ihMosaic').innerHTML='<div class="ih-message">Loading '+esc(state.exchange)+' full instrument catalogue…</div>';
  $('ihRefresh').disabled=true;
  const q=new URLSearchParams({exchange:state.exchange,page:state.page,limit:state.size,sort:state.sort,query:state.query,type:state.series,quotes:'false'});
  try{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
   let response;
   try{response=await fetch('/api/india-heatmap/page?'+q,{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer);}
   const result=await response.json();if(!response.ok)throw Error(result.error||'Provider request failed');
   if(seq!==state.seq)return;state.data=result;
   $('ihMode').textContent=result.mode==='LIVE'?'UPSTOX · LOADING QUOTES':'BOD CATALOGUE · NO LIVE QUOTES';
   $('ihCount'+result.exchange).textContent=number(result.catalogueCount);
   $('ihTotal').textContent=number(result.catalogueCount);
   $('ihFiltered').textContent=number(result.matchedCount);
   $('ihQuoted').textContent=result.quoteCount+' / '+result.items.length;
   $('ihFresh').textContent=result.freshQuoteCount+' / '+result.quoteCount;
   $('ihProvenance').textContent=(result.quoteError||result.quoteScope)+' · '+result.areaMeaning;
   $('ihPage').textContent='Page '+result.page+' / '+Math.max(1,result.totalPages);
   $('ihJump').value=result.page;$('ihJump').max=Math.max(1,result.totalPages);
   $('ihFirst').disabled=$('ihPrev').disabled=result.page<=1;
   $('ihNext').disabled=$('ihLast').disabled=result.page>=result.totalPages;
   render();
   $('ihAccessNote').textContent=result.mode==='LIVE'?'PRIVATE UPSTOX MODE: real REST quote snapshots are fetched for the visible page only. Stale or missing quotes remain labeled; live streaming is not yet enabled.':'PUBLIC DEMO: the full instrument catalogue is available but prices are not live. Optional colors are illustrative.';
   if(result.mode==='LIVE')void enrichQuotes(seq,q);
  }catch(e){if(seq!==state.seq)return;state.data=null;
   $('ihMosaic').innerHTML='<div class="ih-message ih-failure"><b>'+esc(e.message)+
    '</b><p>Full instrument master unavailable. The system did not substitute the 12-stock sample.</p><button id="ihRetry">Retry</button></div>';
   $('ihRetry')?.addEventListener('click',load);
  }finally{if(seq===state.seq)$('ihRefresh').disabled=false;}
 }
 function jump(n){const max=state.data?.totalPages||1;if(!Number.isInteger(n)||n<1||n>max||n===state.page)return;state.page=n;load();}
 function init(){
  const root=$('view-indiaheatmap');if(!root)return;
  const old=localStorage.getItem('marketpulse_india_exchange');if(old==='BSE')state.exchange='BSE';
  root.innerHTML=[
   '<header class="ih-head"><div><span class="ih-overline">MARKETPULSE · NSE & BSE · FULL EQUITY CATALOGUE</span>',
   '<h1>Indian Stock Heatmap</h1><p>A professional treemap-style view of every provider-listed equity-segment instrument, with a separate NSE and BSE workspace.</p></div>',
   '<span id="ihMode" class="ih-mode">CATALOGUE LOADING</span></header>',
   '<div class="ih-layout"><main class="ih-panel"><div class="ih-controls">',
   '<div class="ih-tabs" role="tablist"><button role="tab" data-market-exchange="NSE">NSE <b id="ihCountNSE">—</b></button>',
   '<button role="tab" data-market-exchange="BSE">BSE <b id="ihCountBSE">—</b></button></div>',
   '<input id="ihSearch" maxlength="80" placeholder="Search any company, symbol or ISIN" aria-label="Search entire stock catalogue">',
   '<select id="ihSort" aria-label="Layout order"><option value="mosaic">Market mosaic</option><option value="alpha">A–Z</option></select>',
   '<select id="ihSize" aria-label="Tiles per page"><option value="60">60 tiles</option><option value="100" selected>100 tiles</option><option value="140">140 tiles</option></select>',
   '<button id="ihRefresh">↻ Refresh</button></div>',
   '<div class="ih-stats"><div><small>CATALOGUE</small><b id="ihTotal">—</b></div><div><small>FILTERED</small><b id="ihFiltered">—</b></div>',
   '<div><small>QUOTED / SHOWN</small><b id="ihQuoted">—</b></div><div><small>FRESH / QUOTED</small><b id="ihFresh">—</b></div>',
   '<div class="ih-legend"><i class="ih-green"></i> Rise <i class="ih-red"></i> Fall <i class="ih-gray"></i> No quote</div></div>',
   '<div class="ih-note"><span id="ihProvenance">Loading source information…</span><label><input id="ihPreview" type="checkbox"> Illustrative color preview</label></div>',
   '<div id="ihPreviewNote" class="ih-preview-note" hidden>ILLUSTRATIVE COLORS · NOT REAL RETURNS OR PRICES</div>',
   '<div id="ihMosaic" class="ih-mosaic" aria-label="Indian NSE BSE stock heatmap"><div class="ih-message">Loading listings…</div></div>',
   '<footer class="ih-pagination"><div><button id="ihFirst">« First</button><button id="ihPrev">‹ Prev</button><span id="ihPage">Page —</span>',
   '<button id="ihNext">Next ›</button><button id="ihLast">Last »</button></div>',
   '<div><label for="ihJump">Page</label><input id="ihJump" type="number" min="1" step="1" value="1"><button id="ihGo">Go</button></div></footer>',
   '<p class="ih-disclosure">BOD catalogue lists all equity-segment instruments made available by Upstox, including some ETFs and special series; it does not establish a verified count of every Indian exchange-listed company. Only visible-page symbols receive live REST quotes when a private Upstox token is configured. Missing quotes remain gray. Tile area uses turnover proxy where available, otherwise equal area — NOT market capitalization. Alphabetical groups are used unless authenticated sector metadata exists.</p>',
   '</main><aside class="ih-aside"><span>UNIFIED STOCK RESEARCH</span><h2>Every listed stock is searchable.</h2>',
   '<p>Choose NSE or BSE, browse every catalogue page, then click any stock tile to open its chart, momentum signals, market depth and news.</p>',
   '<div class="ih-aside-tip" id="ihAccessNote">Catalogue data is public; quote access depends on this server&#39;s private Upstox configuration.</div>',
   '<div id="ihSelection">Select a stock to open its chart.</div></aside></div>'
  ].join('');
  root.querySelectorAll('[data-market-exchange]').forEach(b=>b.addEventListener('click',()=>{
   if(b.dataset.marketExchange===state.exchange)return;state.exchange=b.dataset.marketExchange;localStorage.setItem('marketpulse_india_exchange',state.exchange);
   state.page=1;state.query='';$('ihSearch').value='';load();
  }));
  $('ihSearch').addEventListener('input',e=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.query=e.target.value.trim();state.page=1;load();},350);});
  $('ihSort').addEventListener('change',e=>{state.sort=e.target.value;state.page=1;load();});
  $('ihSize').addEventListener('change',e=>{state.size=Number(e.target.value);state.page=1;load();});
  $('ihRefresh').addEventListener('click',load);
  $('ihPreview').addEventListener('change',e=>{state.preview=e.target.checked;render();});
  $('ihFirst').addEventListener('click',()=>jump(1));$('ihPrev').addEventListener('click',()=>jump(state.page-1));
  $('ihNext').addEventListener('click',()=>jump(state.page+1));$('ihLast').addEventListener('click',()=>jump(state.data?.totalPages||1));
  $('ihGo').addEventListener('click',()=>jump(Number($('ihJump').value)));
  $('ihJump').addEventListener('keydown',e=>{if(e.key==='Enter')jump(Number(e.target.value));});
  $('ihMosaic').addEventListener('click',e=>{
   const b=e.target.closest('[data-key]');if(!b)return;
   const item=state.data?.items?.find(x=>x.key===b.dataset.key);if(!item)return;
   $('ihSelection').innerHTML='<b>'+esc(item.symbol)+'</b><p>'+esc(item.name)+'</p><small>'+esc(item.exchange)+' · '+esc(item.key)+'</small>';
   window.MarketPulseTerminal?.setInstrument?.({key:item.key,symbol:item.symbol,name:item.name,exchange:item.exchange,segment:item.segment,type:item.type});
  });
  window.addEventListener('hashchange',()=>{if(location.hash==='#indiaheatmap')load();});
  setInterval(()=>{if(location.hash==='#indiaheatmap'&&state.data?.mode==='LIVE'){
   const q=new URLSearchParams({exchange:state.exchange,page:state.page,limit:state.size,sort:state.sort,query:state.query,type:state.series});
   void enrichQuotes(state.seq,q);
  }},45000);
  if(location.hash==='#indiaheatmap')load();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();