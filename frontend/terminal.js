'use strict';
/* MarketPulse V10 – read-only multi-asset terminal.
 * No broker token is sent to the browser. No orders. No price fabricated into provider bars.
 */
(()=>{
const $=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(+n)?Number(n).toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2}):'—';
const rupee=n=>'₹'+fmt(n);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={instrument:null,option:null,chart:null,quote:null,history:[],interval:5,chartType:'candle',view:90,offset:0,hover:null,drag:false,dragX:0,tool:'cross',pending:null,drawings:[],layout:null,market:[],list:[],optionsUnderlying:null,optionRows:[],optionExpiry:'',optionExpiries:[],news:[],newsKey:'',lastNewsAt:0,searchId:0,chartRequest:0,quoteRequest:0,mode:'DEMO',showGrid:true,showVolume:true,showSignals:true,showRsi:true,showEma:true,showVwap:true,showBoll:false,watch:new Map(),alert:null,active:false};
const palettes={bg:'#07111d',grid:'#1b2c3b',light:'#c5d5e7',dim:'#7e98ae',up:'#1fe1aa',down:'#ff6887',gold:'#f4c36b',blue:'#77a4ff',purple:'#c299ff'};
async function json(url){const c=new AbortController();const t=setTimeout(()=>c.abort(),18000);try{const r=await fetch(url,{cache:'no-store',signal:c.signal});const b=await r.json();if(!r.ok)throw Error(b.error||'HTTP '+r.status);return b;}finally{clearTimeout(t);}}
function ep(path,qs){return path+'?'+new URLSearchParams(qs).toString();}
function banner(text,kind='info'){const e=$('v8Toast');e.textContent=text;e.dataset.kind=kind;e.classList.add('show');clearTimeout(banner.timer);banner.timer=setTimeout(()=>e.classList.remove('show'),7000);}
function status(text,kind='neutral'){const e=$('v8Feed');e.textContent=text;e.dataset.kind=kind;}
function storeWatch(){try{localStorage.setItem('marketpulse_v8_watch',JSON.stringify([...state.watch.values()].slice(0,70)));}catch{}}
function readWatch(){try{for(const x of JSON.parse(localStorage.getItem('marketpulse_v8_watch')||'[]'))if(x.key&&x.symbol)state.watch.set(x.key,x);}catch{}}
function persistDraw(){if(!state.instrument)return;try{localStorage.setItem('marketpulse_v8_draw_'+state.instrument.key,JSON.stringify(state.drawings.slice(-80)));}catch{}}
function readDraw(){state.drawings=[];try{state.drawings=JSON.parse(localStorage.getItem('marketpulse_v8_draw_'+state.instrument.key)||'[]').filter(x=>x&&['hline','trend'].includes(x.kind)).slice(-80);}catch{}}
function readAlert(){state.alert=null;try{const a=JSON.parse(localStorage.getItem('marketpulse_v8_alert_'+state.instrument.key)||'null');if(a&&a.price>0)state.alert=a;}catch{}}
function storeAlert(){try{const k='marketpulse_v8_alert_'+state.instrument.key;if(state.alert)localStorage.setItem(k,JSON.stringify(state.alert));else localStorage.removeItem(k);}catch{}}
function setInstrument(item,viaOption=false){
  const x={key:item.key,symbol:item.symbol||item.key.split('|')[1],exchange:item.exchange||item.key.split('_')[0],segment:item.segment||item.key.split('|')[0],type:item.type||'',name:item.name||''};
  if(!x.key)return;state.instrument=x;window.dispatchEvent(new CustomEvent('marketpulse:instrument',{detail:{key:x.key,symbol:x.symbol}}));state.option=viaOption?item.option:null;if(window.MarketPulseTerminal)window.MarketPulseTerminal.currentOptionKey=viaOption?x.key:null;state.chart=null;state.quote=null;state.history=[];state.view=90;state.offset=0;state.hover=null;state.chartRequest++;state.quoteRequest++;readDraw();readAlert();
  $('v8Symbol').textContent=x.symbol;$('v8SubSymbol').textContent=`${x.exchange} · ${x.segment} · ${x.name||x.key}`;
  $('v8Source').textContent='CONNECTING';$('v8OHLC').textContent='O —  H —  L —  C —';$('v8Spread').textContent='—';$('v8Depth').innerHTML='<div class="v8-empty">Waiting for market depth</div>';
  $('v8WatchToggle').textContent=state.watch.has(x.key)?'★ In watchlist':'☆ Watchlist';$('v8AlertPrice').value=state.alert?.price||'';
  banner('Loading '+x.symbol+' · '+(viaOption?'option contract':'exchange instrument'));updateSignal();
  window.MarketPulsePages?.show('chart');loadChart();loadQuote();renderWatch();
}
function selectOption(s,chain){
  const leg=chain?.rows?.find(r=>Math.abs(+r.strike-s.strike)<.01)?.[s.type]||{};
  const k=leg.instrumentKey||leg.symbol||'';
  const demo=!k.includes('|');
  if(!demo&&k){setInstrument({key:k,symbol:`${s.underlying} ${fmt(s.strike)} ${s.type}`,exchange:s.exchange,segment:s.exchange+'_FO',type:s.type,name:s.expiry,option:{...s}},true);}
  else {
    // Keep the existing /api/chart demo path for demo CE/PE, never mislabel it as live.
    const ik='DEMO_FO|'+s.underlying+'_'+s.strike+'_'+s.type;
    setInstrument({key:ik,symbol:`${s.underlying} ${fmt(s.strike)} ${s.type}`,exchange:s.exchange,segment:'DEMO_FO',type:s.type,name:s.expiry,option:{...s}},true);
  }
}
async function loadChart(){if(!state.instrument)return;const id=++state.chartRequest,inst=state.instrument;
 $('v8ChartStatus').textContent='Loading candles…';$('v8ChartStatus').dataset.kind='neutral';
 try{
  const route=state.option?ep('/api/chart',{exchange:state.option.exchange,underlying:state.option.underlying,expiry:state.option.expiry,strike:state.option.strike,type:state.option.type,interval:state.interval}):ep('/api/universe/chart',{key:inst.key,interval:state.interval});
  const j=await json(route);if(id!==state.chartRequest)return;
  state.chart=j;state.mode=j.mode;state.history=(j.candles||[]).filter(b=>Number.isFinite(+b.open)&&+b.close>0&&+b.high>=+b.low).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  $('v8ChartStatus').textContent=(j.mode==='DEMO'?'SYNTHETIC':'UPSTOX HISTORICAL')+' · '+state.history.length+' BARS';$('v8ChartStatus').dataset.kind=j.mode==='DEMO'?'warn':'ok';
  $('v8Source').textContent=j.mode==='DEMO'?'DEMO · SYNTHETIC':'UPSTOX · CANDLES';$('v8TimeLabel').textContent=state.interval+'m';
  if(!state.history.length)banner('The provider returned no candles for this timeframe.','warn');
  draw();updateSignal();window.dispatchEvent(new CustomEvent('marketpulse:candles',{detail:{key:inst.key,bars:state.history.length,mode:j.mode}}));
 }catch(e){if(id!==state.chartRequest)return;state.history=[];state.chart=null;draw();$('v8ChartStatus').textContent='CANDLE ERROR';$('v8ChartStatus').dataset.kind='bad';banner('Chart: '+e.message,'error');updateSignal();}
}
async function loadQuote(){if(!state.instrument||state.option)return;const id=++state.quoteRequest,k=state.instrument.key;
 try{
  const j=await json(ep('/api/universe/quote',{key:k}));if(id!==state.quoteRequest)return;state.quote=j;
  displayQuote(j);
 }catch(e){if(id!==state.quoteRequest)return;state.quote=null;$('v8Ltp').textContent='—';$('v8Feed').textContent='QUOTE ERROR';$('v8Feed').dataset.kind='bad';$('v8Depth').innerHTML='<div class="v8-empty">Unavailable</div>';banner('Quote: '+e.message,'error');draw();updateSignal();}
}
function displayQuote(q){
  $('v8Ltp').textContent=rupee(q.ltp);const change=q.changePct;$('v8Delta').textContent=change==null?'Change unavailable':(change>=0?'+':'')+fmt(change)+'%';$('v8Delta').className=change>=0?'v8-green':'v8-red';
  $('v8Feed').textContent=q.mode==='DEMO'?'SYNTHETIC DATA':q.fresh?'UPSTOX · FRESH REST QUOTE':q.marketOpenApprox===false?'UPSTOX · MARKET CLOSED':'UPSTOX · STALE QUOTE';$('v8Feed').dataset.kind=q.mode==='DEMO'?'warn':q.fresh?'ok':'bad';
  $('v8Spread').textContent=+q.bid&&+q.ask?rupee(q.bid)+' / '+rupee(q.ask)+' · '+fmt(100*(q.ask-q.bid)/q.ask)+'%':'Unavailable';
  $('v8Vol').textContent=fmt(q.volume);$('v8Oi').textContent=fmt(q.oi);$('v8QuoteAge').textContent=q.mode==='DEMO'?'Not real':q.ageSeconds>=0?q.ageSeconds+'s old':'No timestamp';
  const buys=q.depthBuy||[],sells=q.depthSell||[];
  if(!buys.length&&!sells.length){$('v8Depth').innerHTML='<div class="v8-empty">Full depth not returned for this instrument</div>';}else{
   const max=Math.max(1,...buys.concat(sells).map(x=>+x.quantity||0));$('v8Depth').innerHTML=Array.from({length:5},(_,i)=>{let b=buys[i]||{},s=sells[i]||{};
    return `<div class="v8-depth-row"><div class="v8-depth-bid" data-width="${Math.max(0,(+b.quantity||0)/max*50)}"></div><div class="v8-depth-ask" data-width="${Math.max(0,(+s.quantity||0)/max*50)}"></div><span>${fmt(b.quantity)}</span><span>${fmt(b.price)}</span><span>${fmt(s.price)}</span><span>${fmt(s.quantity)}</span></div>`;}).join('');$('v8Depth').querySelectorAll('[data-width]').forEach(el=>el.style.width=el.dataset.width+'%');}
  if(state.alert&&!state.alert.triggered&&q.mode==='LIVE'&&q.fresh&&+q.ltp>0){const crossed=state.alert.direction==='above'?q.ltp>=state.alert.price:q.ltp<=state.alert.price;if(crossed){state.alert.triggered=true;storeAlert();banner('Price alert reached: '+state.instrument.symbol+' '+state.alert.direction+' ₹'+fmt(state.alert.price),'ok');}}
  draw();updateSignal();window.dispatchEvent(new CustomEvent('marketpulse:quote',{detail:{key:state.instrument?.key,quote:q}}));
}
function syncOptionAnalysis(a){if(!state.option||!a||+state.option.strike!==+a.strike||state.option.type!==a.type||state.option.expiry!==a.expiry)return;
 const fresh=!!a.dataQuality?.fresh&&!!a.dataQuality?.snapshotFresh&&!!a.dataQuality?.withinNormalHours;
 state.quote={ltp:a.premium,bid:a.bid,ask:a.ask,volume:a.volume,oi:a.oi,fresh:a.mode==='LIVE'&&fresh,mode:a.mode,source:a.source,ageSeconds:a.dataQuality?.quoteAgeSeconds,marketOpenApprox:!!a.dataQuality?.withinNormalHours,depthBuy:a.depth?.buy||[],depthSell:a.depth?.sell||[]};displayQuote(state.quote);
}
function invalidateOption(reason){if(!state.option)return;state.quote=null;$('v8Ltp').textContent='—';$('v8Feed').textContent='DATA UNAVAILABLE';$('v8Feed').dataset.kind='bad';$('v8Spread').textContent='—';$('v8Depth').innerHTML='<div class="v8-empty">Provider quote unavailable</div>';updateSignal();banner('Selected option: '+reason,'error');draw();}
function calculations(bars){let ema9=0,ema21=0,pv=0,vsum=0,lastDay='',prices=[],avgGain=0,avgLoss=0;
 return bars.map((b,i)=>{const c=+b.close;ema9=i?ema9*.8+c*.2:c;ema21=i?ema21*(20/22)+c*(2/22):c;
  const day=String(b.time).slice(0,10);if(day!==lastDay){pv=0;vsum=0;lastDay=day;}const v=Math.max(0,+b.volume||0);pv+=v*(+b.high + +b.low +c)/3;vsum+=v;
  prices.push(c);if(prices.length>20)prices.shift();const avg=prices.reduce((a,n)=>a+n,0)/prices.length;const std=Math.sqrt(prices.reduce((a,n)=>a+(n-avg)**2,0)/prices.length);
  let rsi=NaN;if(i>0){const delta=c-(+bars[i-1].close),gain=Math.max(0,delta),loss=Math.max(0,-delta);
   if(i<=14){avgGain+=gain/14;avgLoss+=loss/14;if(i===14)rsi=avgLoss===0?avgGain===0?50:100:100-100/(1+avgGain/avgLoss);}
   else{avgGain=(avgGain*13+gain)/14;avgLoss=(avgLoss*13+loss)/14;rsi=avgLoss===0?avgGain===0?50:100:100-100/(1+avgGain/avgLoss);}
  }
  return {ema9,ema21,vwap:vsum?pv/vsum:c,bbTop:prices.length>=20?avg+std*2:NaN,bbBottom:prices.length>=20?avg-std*2:NaN,rsi};
 });}
function updateSignal(){const root=$('v8Signal');if(!root)return;const bars=state.history,quote=state.quote,mode=state.chart?.mode||'DEMO';
 if(!quote||bars.length<36||mode!=='LIVE'||!quote.fresh){root.innerHTML='<span class="v8-signal-status">WAIT / DATA GATE</span><span>Requires a recent Upstox quote, valid exchange session and at least 36 candle observations. Synthetic/closed-market data cannot produce an actionable setup.</span>';return;}
 const last=bars.at(-1),x=calculations(bars).at(-1),spread=+quote.ask>0&&+quote.bid>0?100*(quote.ask-quote.bid)/quote.ask:Infinity;
 const bullish=(+last.close>x.ema9&&x.ema9>x.ema21&&+last.close>x.vwap&&x.rsi>52&&x.rsi<75);
 const bearish=(+last.close<x.ema9&&x.ema9<x.ema21&&+last.close<x.vwap&&x.rsi<48);
 const valid=spread<=1.5&&+quote.volume>0;
 let signal=valid&&bullish?'BULLISH MOMENTUM':valid&&bearish?'BEARISH MOMENTUM':'WAIT / MIXED';
 root.innerHTML=`<span class="v8-signal-status ${signal.includes('BULLISH')?'bull':signal.includes('BEARISH')?'bear':''}">${signal}</span><span>EMA 9/21, 14-period RSI and session VWAP${valid?' align or conflict':' blocked by spread/volume'}. ${state.instrument?.type==='CE'||state.instrument?.type==='PE'?'This describes option PREMIUM momentum, not a guaranteed underlying direction.':'Observational chart trend only.'} No verified profitability or order execution.</span>`;
}
function canvas(){return $('v8Canvas');}
function measureCanvas(){const c=canvas(),r=c.getBoundingClientRect(),w=Math.max(300,r.width),h=Math.max(330,r.height),dpr=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}let ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w,h};}
function draw(){const c=canvas();if(!c)return;const {ctx,w,h}=measureCanvas();ctx.fillStyle=palettes.bg;ctx.fillRect(0,0,w,h);
 const all=state.history||[],len=Math.min(all.length,Math.max(18,Math.round(state.view))),maxOffset=Math.max(0,all.length-len);state.offset=Math.max(0,Math.min(maxOffset,state.offset));
 const start=Math.max(0,all.length-state.offset-len),bars=all.slice(start,start+len),ind=calculations(all).slice(start,start+len);
 if(!bars.length){ctx.fillStyle=palettes.dim;ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('Select a listed NSE/BSE instrument to load its chart',w/2,h/2);return;}
 const L=22,R=w-92,T=23,BTM=h-31,RSITOP=state.showRsi?h-135:BTM,RSIBOTTOM=h-44,VBASE=state.showRsi?RSITOP-9:BTM,VTOP=state.showVolume?VBASE-78:VBASE,PBTM=VTOP-16;const width=R-L,space=width/bars.length;
 let prices=bars.flatMap(b=>[+b.high,+b.low]);if(state.showEma)ind.forEach(r=>prices.push(r.ema9,r.ema21));if(state.showVwap)ind.forEach(r=>prices.push(r.vwap));if(state.showBoll)ind.forEach(r=>prices.push(r.bbTop,r.bbBottom));
 const min=Math.min(...prices),max=Math.max(...prices),margin=Math.max(.01,(max-min)*.13),low=min-margin,high=max+margin;
 const py=p=>T+(high-p)/(high-low)*(PBTM-T),price=y=>high-(y-T)/(PBTM-T)*(high-low),px=i=>L+(i-start+.5)*space;
 if(state.showGrid){ctx.strokeStyle=palettes.grid;ctx.lineWidth=1;ctx.font='11px system-ui';ctx.textAlign='left';for(let i=0;i<=5;i++){let y=T+(PBTM-T)*i/5;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.fillStyle=palettes.dim;ctx.fillText(fmt(price(y)),R+8,y+3);}for(let j=0;j<8;j++){let x=L+j*width/7;ctx.beginPath();ctx.moveTo(x,T);ctx.lineTo(x,PBTM);ctx.stroke();}}
 const maxVol=Math.max(1,...bars.map(b=>+b.volume||0));
 bars.forEach((b,i)=>{const x=L+(i+.5)*space,up=+b.close>=+b.open,col=up?palettes.up:palettes.down;
  if(state.showVolume){const v=(+b.volume||0)/maxVol*(VBASE-VTOP-7);ctx.globalAlpha=.52;ctx.fillStyle=col;ctx.fillRect(x-space*.29,VBASE-v,Math.max(1,space*.58),v);ctx.globalAlpha=1;}
  ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1.15;
  if(state.chartType==='candle'){ctx.beginPath();ctx.moveTo(x,py(+b.high));ctx.lineTo(x,py(+b.low));ctx.stroke();ctx.fillRect(x-space*.31,Math.min(py(+b.open),py(+b.close)),Math.max(1.5,space*.62),Math.max(1,Math.abs(py(+b.open)-py(+b.close))));}
 });
 const trace=(values,color)=>{ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.65;let began=false;values.forEach((v,i)=>{if(!Number.isFinite(v))return;let x=L+(i+.5)*space,y=py(v);if(!began){ctx.moveTo(x,y);began=true;}else ctx.lineTo(x,y);});ctx.stroke();};
 if(state.chartType==='line')trace(bars.map(b=>+b.close),palettes.up);
 if(state.showEma){trace(ind.map(x=>x.ema9),palettes.gold);trace(ind.map(x=>x.ema21),palettes.blue);}
 if(state.showVwap)trace(ind.map(x=>x.vwap),palettes.purple);
 if(state.showBoll){trace(ind.map(x=>x.bbTop),'#80c1d8');trace(ind.map(x=>x.bbBottom),'#80c1d8');}
 // The latest provider quote is separate from historical OHLC; don't falsify candle shapes.
 if(state.quote?.ltp>0){const q=state.quote,y=py(q.ltp);if(y>=T&&y<=PBTM){ctx.strokeStyle=q.fresh?'#43e3ae':'#caad72';ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=q.fresh?'#145c4a':'#6b573a';ctx.fillRect(R,y-12,91,23);ctx.fillStyle='#f8fdff';ctx.font='bold 11px system-ui';ctx.fillText(fmt(q.ltp),R+8,y+4);}}
 // Historical research annotations: use only completed candles (last candle excluded).
 if(state.showSignals&&window.MarketPulseSignals){
  const signals=window.MarketPulseSignals.compute(all).markers.filter(m=>m.index>=start&&m.index<start+len);
  let lastX=-1000;for(const mark of signals){const x=L+(mark.index-start+.5)*space;
   if(x-lastX<48)continue;lastX=x;const b=all[mark.index],isBuy=mark.type==='BUY',isExit=mark.type==='EXIT';
   const at=isBuy?py(+b.low)+18:py(+b.high)-18,col=isExit?'#f5c66d':isBuy?'#32e5af':'#ff768f';
   const y=Math.max(T+17,Math.min(PBTM-17,at));
   ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y+(isBuy?-9:9),2.6,0,Math.PI*2);ctx.fill();
   ctx.beginPath();ctx.roundRect(x-22,y-11,44,22,6);ctx.fill();
   ctx.font='bold 10px system-ui';ctx.fillStyle='#06131c';ctx.textAlign='center';ctx.fillText(mark.type,x,y+3);
  }
 }
 // Separate RSI pane with 30/70 zones (historical; no fabricated bars).
 if(state.showRsi){
  ctx.fillStyle='#091923';ctx.fillRect(L,RSITOP,R-L,RSIBOTTOM-RSITOP+5);
  ctx.strokeStyle=palettes.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,RSITOP);ctx.lineTo(R,RSITOP);ctx.stroke();
  const ry=v=>RSIBOTTOM-(v/100)*(RSIBOTTOM-RSITOP);
  ctx.fillStyle='#c9a9ff';ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillText('RSI 14',L+7,RSITOP+14);
  for(const v of [30,50,70]){const y=ry(v);ctx.strokeStyle=v===50?'#29495b':'#66506f';ctx.setLineDash(v===50?[3,6]:[5,4]);ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#8ea8bb';ctx.fillText(String(v),R+8,y+3);}
  ctx.beginPath();ctx.strokeStyle='#bb91f7';ctx.lineWidth=1.7;let began=false;ind.forEach((v,i)=>{if(!Number.isFinite(v.rsi))return;const x=L+(i+.5)*space,y=ry(v.rsi);if(!began){ctx.moveTo(x,y);began=true;}else ctx.lineTo(x,y);});ctx.stroke();
 }
 // Draw persistent lines with time anchors instead of canvas pixel coordinates; pan/zoom preserves placements.
 for(const d of state.drawings){ctx.strokeStyle=d.color||palettes.gold;ctx.lineWidth=1.5;ctx.setLineDash(d.kind==='hline'?[5,5]:[]);ctx.beginPath();if(d.kind==='hline'){const y=py(d.price);ctx.moveTo(L,y);ctx.lineTo(R,y);}else{const x1=L+(d.index1-start+.5)*space,x2=L+(d.index2-start+.5)*space;ctx.moveTo(x1,py(d.price1));ctx.lineTo(x2,py(d.price2));}ctx.stroke();ctx.setLineDash([]);}
 if(state.pending){ctx.strokeStyle=palettes.gold;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(state.pending.x,state.pending.y,4,0,2*Math.PI);ctx.stroke();ctx.setLineDash([]);}
 let hover=state.hover;if(hover&&hover.x>=L&&hover.x<=R&&hover.y>=T&&hover.y<=BTM){const idx=Math.max(0,Math.min(bars.length-1,Math.floor((hover.x-L)/space))),bar=bars[idx];ctx.strokeStyle='#758c9f';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(hover.x,T);ctx.lineTo(hover.x,BTM);ctx.moveTo(L,hover.y);ctx.lineTo(R,hover.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#294152';ctx.fillRect(R,hover.y-10,91,20);ctx.fillStyle='#e7f5fd';ctx.font='11px system-ui';ctx.fillText(fmt(price(hover.y)),R+8,hover.y+4);
  $('v8OHLC').textContent=`O ${fmt(bar.open)}   H ${fmt(bar.high)}   L ${fmt(bar.low)}   C ${fmt(bar.close)}   VOL ${fmt(bar.volume)}`;
 }else{const b=bars.at(-1);$('v8OHLC').textContent=`O ${fmt(b.open)}   H ${fmt(b.high)}   L ${fmt(b.low)}   C ${fmt(b.close)}   VOL ${fmt(b.volume)}`;}
 ctx.font='11px system-ui';ctx.fillStyle=palettes.dim;ctx.textAlign='center';for(let i=0;i<6;i++){const ix=Math.min(bars.length-1,Math.round(i*(bars.length-1)/5)),d=new Date(bars[ix].time);if(Number.isFinite(d.getTime()))ctx.fillText(new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d),L+(ix+.5)*space,h-12);}
 const latest=ind.at(-1);if(latest){$('v8Indicators').innerHTML=`<span>EMA 9 <b>${fmt(latest.ema9)}</b></span><span>EMA 21 <b>${fmt(latest.ema21)}</b></span><span>VWAP <b>${fmt(latest.vwap)}</b></span><span>RSI 14 <b>${fmt(latest.rsi)}</b></span>`;}
 state.layout={L,R,T,PBTM,BTM,space,start,price,py,w,h,bars};
}
function interaction(){const c=canvas();const pos=e=>{let r=c.getBoundingClientRect();return {x:(e.clientX-r.left),y:e.clientY-r.top};};
 c.addEventListener('pointerdown',e=>{if(!state.layout)return;let p=pos(e),l=state.layout;if(p.x<l.L||p.x>l.R||p.y<l.T||p.y>l.PBTM)return;
  const idx=Math.round(l.start+(p.x-l.L)/l.space-.5),pr=l.price(p.y);
  if(state.tool==='hline'){state.drawings.push({kind:'hline',price:pr});persistDraw();draw();return;}
  if(state.tool==='trend'){if(!state.pending){state.pending={x:p.x,y:p.y,index:idx,price:pr};banner('Trend line: click the second point');}else{state.drawings.push({kind:'trend',index1:state.pending.index,price1:state.pending.price,index2:idx,price2:pr});state.pending=null;persistDraw();draw();}return;}
  if(state.tool==='measure'){state.pending={x:p.x,y:p.y,index:idx,price:pr};return;}
  state.drag=true;state.dragX=e.clientX;c.setPointerCapture(e.pointerId);
 });
 c.addEventListener('pointermove',e=>{let p=pos(e);if(state.drag){const delta=e.clientX-state.dragX,step=state.layout?.space||10;if(Math.abs(delta)>step){state.offset=Math.max(0,state.offset+Math.round(delta/step));state.dragX=e.clientX;}}state.hover=p;
  if(state.tool==='measure'&&state.pending){const l=state.layout;if(l){const newPrice=l.price(p.y),pct=state.pending.price?100*(newPrice/state.pending.price-1):0;$('v8Measure').textContent=`Δ ${fmt(newPrice-state.pending.price)} (${fmt(pct)}%) · release to finish`;}}draw();});
 c.addEventListener('pointerup',()=>{state.drag=false;if(state.tool==='measure'){state.pending=null;$('v8Measure').textContent='Click and drag to measure price change';draw();}});
 c.addEventListener('pointerleave',()=>{state.hover=null;state.drag=false;draw();});
 c.addEventListener('wheel',e=>{e.preventDefault();state.view=Math.max(18,Math.min(360,state.view+(e.deltaY>0?12:-12)));draw();},{passive:false});
 window.addEventListener('resize',draw);
}
function navSetup(){const catalog=[['explore','⌕','Markets & Search'],['heatmap','▦','Equity Heatmap'],['news','◫','Market News'],['predict','✧','ML Prediction Lab']];
 const sidebar=document.querySelector('.sidebar'),anchor=sidebar.querySelector('a[href="#chart"]');
 for(const [key,icon,text] of catalog){const a=document.createElement('a');a.className='nav v8nav';a.href='#'+key;a.innerHTML=`${icon} <span>${text}</span>`;anchor.parentElement.insertBefore(a,anchor);}
 const original=window.MarketPulsePages?.show;
 if(!original)throw Error('V7 pages not available');
 const pageTitles={explore:'Markets & Instrument Search',heatmap:'Live Equity Heatmap',news:'News Intelligence',predict:'ML Prediction Lab'};
 for(const key of Object.keys(pageTitles)){
 const e=document.createElement('article');e.id='view-'+key;e.className='workspace-page hidden';e.dataset.view=key;e.innerHTML=`<header class="workspace-head"><div><span class="workspace-kicker">MARKETPULSE V10 · NSE / BSE</span><h1>${pageTitles[key]}</h1><p>${key==='explore'?'Search actual broker-listed equities, index contracts, futures and options.':key==='heatmap'?'A transparent sampled stock heatmap with individually clickable exchange instruments.':'Timestamped Upstox instrument news with source links and refresh.'}</p></div></header>`;
 document.querySelector('.content').append(e);
 }
 window.MarketPulsePages.show=(key,changeHash=true)=>{
  if(!pageTitles[key]){for(const k of Object.keys(pageTitles))$('view-'+k).classList.add('hidden');original(key,changeHash);document.querySelectorAll('.v8nav').forEach(x=>x.classList.remove('active'));if(key==='flow')refreshHeatmap(false);return;}
  for(const el of document.querySelectorAll('.workspace-page'))el.classList.toggle('hidden',el.id!=='view-'+key);
  document.querySelectorAll('.sidebar a.nav').forEach(x=>x.classList.toggle('active',x.getAttribute('href')==='#'+key));
  document.querySelector('.sidebar').classList.remove('mobile-open');
  document.querySelector('.crumb').textContent='Trading terminal › '+pageTitles[key];
  if(changeHash)history.pushState(null,'','#'+key);window.scrollTo({top:0});if(key==='heatmap')refreshHeatmap(false);if(key==='news')loadNews(false);if(key==='predict')window.dispatchEvent(new Event('marketpulse:prediction-page'));
 };
 document.querySelectorAll('.v8nav').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();window.MarketPulsePages.show(a.getAttribute('href').slice(1));}));
 window.addEventListener('hashchange',()=>{const k=location.hash.slice(1);if(pageTitles[k])window.MarketPulsePages.show(k,false);else window.MarketPulsePages.show(k||'scanner',false);});
 if(pageTitles[location.hash.slice(1)])window.MarketPulsePages.show(location.hash.slice(1),false);
}
function mount(){
 const explore=$('view-explore');explore.insertAdjacentHTML('beforeend',`<section class="v8-panel"><div class="v8-section-title"><div><strong>Global market finder</strong><small>Instruments from the Upstox search API · enter any NSE/BSE symbol or contract name</small></div><span class="v8-pill">READ ONLY</span></div><form id="v8SearchForm" class="v8-searchbar"><input id="v8Search" type="search" placeholder="Search RELIANCE, TCS, NIFTY, SENSEX, stock option…" minlength="2" maxlength="50" autocomplete="off" required><select id="v8SearchExchange"><option value="ALL">NSE + BSE</option><option value="NSE">NSE</option><option value="BSE">BSE</option></select><select id="v8SearchSeg"><option value="ALL">All instruments</option><option value="EQ">Stocks</option><option value="FO">F&O</option><option value="INDEX">Indices</option></select><button class="v8-mainbtn" type="submit">⌕ Search market</button></form><div class="v8-section-title"><strong>Search results</strong><span id="v8SearchCaption">Search actual listed instruments</span></div><div id="v8Results" class="v8-results"><div class="v8-empty">Start with a stock symbol or company name.</div></div><div id="v8OptionExplorer" class="v8-option-explorer" hidden><div class="v8-section-title"><div><strong id="v8OptionsTitle">Option chain</strong><small>Underlying contract · actual CE/PE instruments from Upstox</small></div><button id="v8CloseOptions">✕ Close</button></div><div class="v8-option-filters"><label>Expiry <select id="v8OptionExpiry"></select></label><label>Strike contains <input id="v8OptionSearch" placeholder="Search strike"></label><button id="v8OptionRefresh">↻ Reload chain</button></div><div id="v8OptionRows" class="v8-option-rows"></div></div></section><section class="v8-panel"><div class="v8-section-title"><strong>★ Your watchlist</strong><small>Stored only in this browser</small></div><div id="v8Watch" class="v8-watch"></div></section>`);
 const heat=$('view-heatmap');heat.insertAdjacentHTML('beforeend',`<section class="v8-panel"><div class="v8-section-title"><div><strong>Equity movement · watch basket</strong><small>Click a stock to inspect its own quote, chart, news and resting depth</small></div><div class="v8-actions"><select id="v8HeatExchange"><option>NSE</option><option>BSE</option></select><button id="v8HeatRefresh" class="v8-mainbtn">↻ Refresh</button></div></div><div class="v8-source-note" id="v8HeatCoverage">A sampled basket, not every NSE/BSE-listed company.</div><div class="v8-heat" id="v8HeatTiles"></div><div class="v8-honesty">A green tile means positive percentage price change, not a verified inflow of capital. Tiles use provider quote snapshots and have no proven institutional-order tracking.</div></section>`);
 const news=$('view-news');news.insertAdjacentHTML('beforeend',`<section class="v8-panel"><div class="v8-section-title"><div><strong>News intelligence</strong><small>Relevant news for the selected exchange instrument · not all-market news crawling</small></div><button id="v8NewsRefresh" class="v8-mainbtn">↻ Check headlines</button></div><div class="v8-source-note" id="v8NewsSource">Choose an instrument in Markets first.</div><div class="v8-news" id="v8NewsItems"></div><div class="v8-honesty">Provider articles cover a limited recent window. Headlines may arrive with delays; summaries are not sentiment probabilities or investment recommendations.</div></section>`);
 const chartPage=$('view-chart');chartPage.insertAdjacentHTML('afterbegin',`<section class="v8-pro-chart" id="v8ProChart"><div class="v8-terminal-heading"><div class="v8-icon">✦</div><div class="v8-symbol-box"><b id="v8Symbol">Select a market instrument</b><small id="v8SubSymbol">Search stocks, indices, futures and options</small></div><div class="v8-price"><strong id="v8Ltp">—</strong><span id="v8Delta">—</span></div><button id="v8WatchToggle" class="v8-ghost">☆ Watchlist</button><button id="v8ExploreOptions" class="v8-ghost">Options chain</button><button id="v8Find" class="v8-mainbtn">⌕ Find instrument</button></div><div class="v8-signal" id="v8Signal"><span class="v8-signal-status">NO SETUP</span><span>Chart trend analysis awaits enough valid candles and recent quotes.</span></div><div class="v8-meta"><span class="v8-pill" id="v8Source">NO INSTRUMENT</span><span id="v8Feed" data-kind="neutral">NOT CONNECTED</span><span id="v8ChartStatus">WAITING</span><span id="v8TimeLabel">5m</span><span class="v8-spacer"></span><span id="v8Measure">Pan · zoom · draw · analyze</span></div><div class="v8-chart-toolbar"><div id="v8Frames" class="v8-tools">${[1,3,5,15,30,60].map(v=>`<button data-tf="${v}" class="${v===5?'selected':''}">${v===60?'1h':v+'m'}</button>`).join('')}</div><span class="v8-rule"></span><div class="v8-tools"><button data-style="candle" class="selected">▥ Candles</button><button data-style="line">⌁ Line</button></div><span class="v8-rule"></span><div class="v8-tools">${[['ema','EMA 9/21',true],['vwap','VWAP',true],['boll','Bands',false],['volume','Volume',true],['grid','Grid',true]].map(([id,name,on])=>`<label class="v8-toggle"><input id="v8-${id}" type="checkbox" ${on?'checked':''}> ${name}</label>`).join('')}</div></div><div class="v8-chart-body"><aside class="v8-draw-tools" id="v8DrawTools"><button data-tool="cross" class="selected" title="Crosshair/pan (C)">⌖</button><button data-tool="hline" title="Horizontal price line (H)">━</button><button data-tool="trend" title="Trend line (T)">╱</button><button data-tool="measure" title="Measure change (M)">↕</button><button id="v8Undo" title="Undo last drawing (Ctrl+Z)">↶</button><button id="v8Clear" title="Clear all drawings">⌫</button></aside><div class="v8-chart-main"><div class="v8-ohlc" id="v8OHLC">O — H — L — C —</div><canvas id="v8Canvas" tabindex="0" aria-label="Interactive multi-asset candlestick chart with crosshair and drawing tools"></canvas><div class="v8-chart-foot"><div id="v8Indicators" class="v8-indicators"></div><div class="v8-tools"><button id="v8ZoomIn">＋</button><button id="v8ZoomOut">−</button><button id="v8Fit">Fit</button><button id="v8Screen" title="Full screen">⛶</button><button id="v8Png">↓ PNG</button><button id="v8Reload">↻</button></div></div></div></div><div class="v8-bottom-panels"><div class="v8-subpanel"><div class="v8-section-title"><strong>Market depth (top 5)</strong><span>Displayed resting orders</span></div><div class="v8-depth-header"><span>Bid qty</span><span>Bid ₹</span><span>Ask ₹</span><span>Ask qty</span></div><div id="v8Depth"></div><div class="v8-stats"><span>Bid / Ask<br><b id="v8Spread">—</b></span><span>Volume<br><b id="v8Vol">—</b></span><span>OI<br><b id="v8Oi">—</b></span><span>Quote age<br><b id="v8QuoteAge">—</b></span></div></div><div class="v8-subpanel"><div class="v8-section-title"><strong>Price alerts · local monitor</strong><span>No broker orders</span></div><p>Alert checks only while this page is running and quotes refresh.</p><div class="v8-alertform"><select id="v8AlertDirection"><option value="above">Above</option><option value="below">Below</option></select><input id="v8AlertPrice" type="number" step=".05" min=".01" placeholder="Price ₹"><button id="v8AddAlert" class="v8-mainbtn">Set alert</button><button id="v8RemoveAlert">Clear</button></div><p class="v8-honesty">Upstox quote polling approximately every 12 seconds, not guaranteed tick-level delivery. The feed doesn't run when this app is closed.</p></div></div></section>`);
 // Keep old option chart container in the DOM for compatibility while making V8 the primary experience.
 $('view-flow')?.insertAdjacentHTML('beforeend',`<section class="v8-panel v8-satellites"><div class="v8-section-title"><div><strong>Equity satellites · linked instruments</strong><small>Stocks alongside the option map, shown as a separate quote sample—not stock-to-stock money transfers</small></div><button data-jump="heatmap">Open heatmap ↗</button></div><div id="v8FlowStocks" class="v8-stockrail"><div class="v8-empty">Loading stock sample when available…</div></div></section>`);
 const toast=document.createElement('div');toast.id='v8Toast';toast.className='v8-toast';toast.setAttribute('role','status');document.body.append(toast);
}
async function search(){const phrase=$('v8Search').value.trim();if(phrase.length<2)return;let id=++state.searchId;
 $('v8Results').innerHTML='<div class="v8-empty">Searching Upstox instrument directory…</div>';
 try{const j=await json(ep('/api/universe/search',{query:phrase,exchange:$('v8SearchExchange').value,segment:$('v8SearchSeg').value}));if(id!==state.searchId)return;state.list=j.instruments||[];
 $('v8SearchCaption').textContent=state.list.length+' results · '+j.mode;
 if(!state.list.length){$('v8Results').innerHTML='<div class="v8-empty">No instruments matched. Try a shorter symbol or a different segment.</div>';return;}
 $('v8Results').innerHTML=state.list.map((x,i)=>`<button class="v8-result" data-result="${i}"><span class="v8-result-icon">${x.type==='CE'?'C':x.type==='PE'?'P':x.segment.includes('FO')?'F':'₹'}</span><span><b>${safe(x.symbol)}</b><small>${safe(x.name||x.segment)} · ${safe(x.key)}</small></span><span class="v8-result-ex">${safe(x.exchange)} · ${safe(x.type||x.segment)}</span><span class="v8-result-actions"><span class="v8-result-go">Open ↗</span>${(x.segment.includes("EQ")||x.segment.includes("INDEX"))?`<span class="v8-option-link" data-option-index="${i}">Explore options</span>`:""}</span></button>`).join('');
 }catch(e){if(id!==state.searchId)return;$('v8Results').innerHTML='<div class="v8-empty">'+safe(e.message)+'</div>';}
}
async function openOptions(inst){state.optionsUnderlying=inst;state.optionExpiry='';state.optionRows=[];
  $('v8OptionExplorer').hidden=false;$('v8OptionsTitle').textContent=inst.symbol+' · Available options';$('v8OptionRows').innerHTML='<div class="v8-empty">Loading listed expiries…</div>';
  try{const j=await json(ep('/api/universe/options',{key:inst.key}));if(state.optionsUnderlying?.key!==inst.key)return;
   state.optionExpiries=j.expiries||[];$('v8OptionExpiry').innerHTML=state.optionExpiries.map(d=>`<option value="${safe(d)}">${safe(d)}</option>`).join('');
   if(!state.optionExpiries.length){$('v8OptionRows').innerHTML='<div class="v8-empty">No listed options returned for this underlying. It may not have eligible derivatives or the provider may not cover it.</div>';return;}
   state.optionExpiry=state.optionExpiries[0];await loadOptionRows();
  }catch(e){$('v8OptionRows').innerHTML='<div class="v8-empty">'+safe(e.message)+'</div>';}
}
async function loadOptionRows(){let inst=state.optionsUnderlying;if(!inst)return;const expiry=$('v8OptionExpiry').value;state.optionExpiry=expiry;
 $('v8OptionRows').innerHTML='<div class="v8-empty">Loading CE / PE contracts for '+safe(expiry)+'…</div>';
 try{const j=await json(ep('/api/universe/options',{key:inst.key,expiry}));if(state.optionsUnderlying?.key!==inst.key||state.optionExpiry!==expiry)return;state.optionRows=j.rows||[];renderOptionRows();}
 catch(e){$('v8OptionRows').innerHTML='<div class="v8-empty">'+safe(e.message)+'</div>';}
}
function renderOptionRows(){const text=$('v8OptionSearch').value.trim(),rows=state.optionRows.filter(x=>!text||String(x.strike).includes(text));
 $('v8OptionRows').innerHTML=rows.length?'<div class="v8-option-head"><span>CALL PREMIUM</span><span>CALL OI</span><span>STRIKE</span><span>PUT OI</span><span>PUT PREMIUM</span></div>'+rows.map(x=>{const i=state.optionRows.indexOf(x);return `<div class="v8-option-row"><button data-opt-leg="${i}:CE" ${!x.CE?.key?'disabled':''}>${rupee(x.CE?.ltp)} ↗</button><span>${fmt(x.CE?.oi)}</span><b>${fmt(x.strike)}</b><span>${fmt(x.PE?.oi)}</span><button data-opt-leg="${i}:PE" ${!x.PE?.key?'disabled':''}>${rupee(x.PE?.ltp)} ↗</button></div>`;}).join(''):'<div class="v8-empty">No matching listed strikes.</div>';
}
function renderWatch(){const vals=[...state.watch.values()];$('v8Watch').innerHTML=vals.length?vals.map((x,i)=>`<div class="v8-watch-row"><button data-watch="${i}">${safe(x.symbol)} <small>${safe(x.exchange||'')} · ${safe(x.segment||'')}</small></button><button data-unwatch="${i}" aria-label="Remove ${safe(x.symbol)} from watchlist">✕</button></div>`).join(''):'<div class="v8-empty">No watchlist items yet. Open any instrument and press ☆ Watchlist.</div>';
}
async function refreshHeatmap(force=true){if(!force&&state.market.length){renderHeat();return;}
 $('v8HeatTiles').innerHTML='<div class="v8-empty">Loading sampled equity quotes…</div>';
 try{const j=await json(ep('/api/universe/heatmap',{exchange:$('v8HeatExchange').value}));state.market=j.items||[];$('v8HeatCoverage').textContent=j.source+' · '+j.coverage+' · fetched '+new Date(j.asOf).toLocaleTimeString('en-IN');renderHeat();}
 catch(e){$('v8HeatTiles').innerHTML='<div class="v8-empty">'+safe(e.message)+'</div>';$('v8FlowStocks').innerHTML='<div class="v8-empty">Stock basket unavailable</div>';}
}
function renderHeat(){const tiles=state.market;
 $('v8HeatTiles').innerHTML=tiles.map((x,i)=>{const up=Number(x.changePct)>=0;return `<button class="v8-heat-tile ${up?'up':'down'}" data-heat="${i}"><span>${safe(x.symbol)}</span><strong>${x.changePct==null?'—':(up?'+':'')+fmt(x.changePct)+'%'}</strong><small>${rupee(x.ltp)} · ${safe(x.exchange||'NSE')}</small><i></i></button>`;}).join('')||'<div class="v8-empty">No listed equities returned by Upstox.</div>';
 $('v8FlowStocks').innerHTML=tiles.map((x,i)=>`<button data-heat="${i}" class="v8-stockchip ${Number(x.changePct)>=0?'up':'down'}"><span>${safe(x.symbol)}</span><b>${x.changePct==null?'—':(x.changePct>=0?'+':'')+fmt(x.changePct)+'%'}</b></button>`).join('')||'<div class="v8-empty">Choose a market for stock quotes.</div>';
}
async function loadNews(force=true){const inst=state.instrument;if(!inst){$('v8NewsSource').textContent='First select a stock or option in Markets.';$('v8NewsItems').innerHTML='';return;}
 if(!force&&state.newsKey===inst.key&&Date.now()-state.lastNewsAt<60_000){renderNews();return;}
 $('v8NewsSource').textContent='Checking articles for '+inst.symbol+'…';
 try{const j=await json(ep('/api/universe/news',{key:inst.key}));if(state.instrument?.key!==inst.key)return;state.news=j.headlines||[];state.newsKey=inst.key;state.lastNewsAt=Date.now();$('v8NewsSource').textContent=inst.symbol+' · '+(j.source||'')+' · checked '+new Date().toLocaleTimeString('en-IN');renderNews();}
 catch(e){state.news=[];$('v8NewsSource').textContent='Provider news unavailable: '+e.message;renderNews();}
}
function renderNews(){let data=state.news;$('v8NewsItems').innerHTML=data.length?data.map(x=>`<article class="v8-news-item"><div class="v8-news-kicker">UPSTOX NEWS · ${x.publishedMs?new Date(x.publishedMs).toLocaleString('en-IN'):'TIME UNAVAILABLE'}</div><h3>${safe(x.headline)}</h3><p>${safe(x.summary)}</p>${x.url?.startsWith('https://')?`<a href="${safe(x.url)}" target="_blank" rel="noopener noreferrer">Read publisher article ↗</a>`:''}</article>`).join(''):'<div class="v8-empty">No instrument-specific headlines returned for this instrument in the available period.</div>';}
function bind(){
 $('v8SearchForm').addEventListener('submit',e=>{e.preventDefault();search();});$('v8Results').addEventListener('click',e=>{let b=e.target.closest('[data-result]');if(b&&state.list[+b.dataset.result]){const opt=e.target.closest('[data-option-index]');if(opt)openOptions(state.list[+opt.dataset.optionIndex]);else setInstrument(state.list[+b.dataset.result]);}});
 $('v8Find').addEventListener('click',()=>window.MarketPulsePages.show('explore'));
 $('v8CloseOptions').addEventListener('click',()=>{$('v8OptionExplorer').hidden=true;});
 $('v8OptionExpiry').addEventListener('change',loadOptionRows);$('v8OptionRefresh').addEventListener('click',loadOptionRows);$('v8OptionSearch').addEventListener('input',renderOptionRows);
 $('v8OptionRows').addEventListener('click',e=>{const b=e.target.closest('[data-opt-leg]');if(!b)return;let [i,type]=b.dataset.optLeg.split(':'),r=state.optionRows[+i],leg=r?.[type];if(!leg?.key)return;let und=state.optionsUnderlying;setInstrument({key:leg.key,symbol:und.symbol+' '+fmt(r.strike)+' '+type,exchange:und.exchange,segment:und.exchange+'_FO',type,name:'Expiry '+state.optionExpiry+' · Underlying '+und.symbol,lotSize:leg.lotSize});});
 $('v8ExploreOptions').addEventListener('click',()=>{if(!state.instrument)return;window.MarketPulsePages.show('explore');openOptions(state.instrument);});
 $('v8WatchToggle').addEventListener('click',()=>{if(!state.instrument)return;const k=state.instrument.key;if(state.watch.has(k))state.watch.delete(k);else state.watch.set(k,{...state.instrument});storeWatch();renderWatch();$('v8WatchToggle').textContent=state.watch.has(k)?'★ In watchlist':'☆ Watchlist';});
 $('v8Watch').addEventListener('click',e=>{let all=[...state.watch.values()],del=e.target.closest('[data-unwatch]'),b=e.target.closest('[data-watch]');if(del){state.watch.delete(all[+del.dataset.unwatch].key);storeWatch();renderWatch();}else if(b)setInstrument(all[+b.dataset.watch]);});
 $('v8HeatRefresh').addEventListener('click',()=>refreshHeatmap(true));$('v8HeatExchange').addEventListener('change',()=>{state.market=[];refreshHeatmap(true);});
 document.addEventListener('click',e=>{let h=e.target.closest('[data-heat]');if(h&&state.market[+h.dataset.heat])setInstrument({...state.market[+h.dataset.heat],segment:state.market[+h.dataset.heat].exchange+'_EQ',name:state.market[+h.dataset.heat].symbol});let jump=e.target.closest('[data-jump]');if(jump)window.MarketPulsePages.show(jump.dataset.jump);});
 $('v8NewsRefresh').addEventListener('click',()=>loadNews(true));
 $('v8Frames').addEventListener('click',e=>{let b=e.target.closest('[data-tf]');if(!b)return;state.interval=+b.dataset.tf;state.view=90;state.offset=0;$('v8Frames').querySelectorAll('button').forEach(x=>x.classList.toggle('selected',x===b));loadChart();});
 document.querySelectorAll('[data-style]').forEach(b=>b.addEventListener('click',()=>{state.chartType=b.dataset.style;document.querySelectorAll('[data-style]').forEach(x=>x.classList.toggle('selected',x===b));draw();}));
 for(const [key,st] of [['ema','showEma'],['vwap','showVwap'],['volume','showVolume'],['grid','showGrid'],['boll','showBoll']])$('v8-'+key).addEventListener('change',e=>{state[st]=e.target.checked;draw();});
 $('v8DrawTools').addEventListener('click',e=>{let b=e.target.closest('[data-tool]');if(!b)return;state.tool=b.dataset.tool;state.pending=null;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('selected',x===b));banner({cross:'Pan and inspect candles',hline:'Click chart to add a horizontal price line',trend:'Click two points to draw a trend line',measure:'Click and drag to measure price move'}[state.tool]);});
 $('v8Undo').addEventListener('click',()=>{state.drawings.pop();persistDraw();draw();});$('v8Clear').addEventListener('click',()=>{state.drawings=[];state.pending=null;persistDraw();draw();});
 $('v8ZoomIn').addEventListener('click',()=>{state.view=Math.max(18,state.view-15);draw();});$('v8ZoomOut').addEventListener('click',()=>{state.view=Math.min(360,state.view+15);draw();});
 $('v8Fit').addEventListener('click',()=>{state.view=90;state.offset=0;draw();});$('v8Screen').addEventListener('click',()=>{const root=$('v8ProChart');if(document.fullscreenElement)document.exitFullscreen?.();else root.requestFullscreen?.();});
 $('v8Reload').addEventListener('click',()=>{loadChart();loadQuote();});$('v8Png').addEventListener('click',()=>{if(!state.instrument)return;let a=document.createElement('a');a.download='MarketPulse_'+state.instrument.symbol.replace(/[^a-z0-9_-]/gi,'_')+'_chart.png';a.href=canvas().toDataURL('image/png');a.click();});
 $('v8AddAlert').addEventListener('click',()=>{if(!state.instrument)return banner('Select an instrument first','warn');const price=Number($('v8AlertPrice').value);if(!(price>0&&price<1e9))return banner('Enter a valid price','warn');state.alert={price,direction:$('v8AlertDirection').value,triggered:false};storeAlert();banner('Local alert saved for '+state.instrument.symbol+' at '+rupee(price),'ok');});
 $('v8RemoveAlert').addEventListener('click',()=>{if(!state.instrument)return;state.alert=null;storeAlert();$('v8AlertPrice').value='';banner('Price alert removed');});
 window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(e.key==='/'&&!e.ctrlKey){e.preventDefault();window.MarketPulsePages.show('explore');$('v8Search').focus();}if(e.ctrlKey&&e.key.toLowerCase()==='z'){e.preventDefault();state.drawings.pop();persistDraw();draw();}if(!['chart','explore'].includes(location.hash.slice(1)))return;const tools={h:'hline',t:'trend',c:'cross',m:'measure'};if(tools[e.key.toLowerCase()]){state.tool=tools[e.key.toLowerCase()];document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('selected',x.dataset.tool===state.tool));}});
 interaction();
}
function copilotContext(){if(!state.instrument)return{};
 const k=state.instrument, q=state.quote||{},rows=state.history,ind=rows.length?calculations(rows).at(-1):{};
 const signal=$('v8Signal')?.querySelector('.v8-signal-status')?.textContent||'WAIT / DATA GATE';
 return {mode:state.chart?.mode||'DEMO',provider:state.chart?.mode==='LIVE'?'Upstox':'Synthetic demo',asOf:state.chart?.asOf||'',symbol:k.symbol,exchange:k.exchange,source:state.chart?.source||'',signal,alignmentScore:0,premium:q.ltp||0,bid:q.bid||0,ask:q.ask||0,oi:q.oi||0,spreadPct:q.ask>0&&q.bid>0?100*(q.ask-q.bid)/q.ask:0,
   indicators:{ema9:ind.ema9||0,ema21:ind.ema21||0,vwap:ind.vwap||0,rsi14:ind.rsi||0},dataQuality:{fresh:!!q.fresh,snapshotFresh:!!q.fresh,withinNormalHours:!!q.marketOpenApprox,quoteAgeSeconds:q.ageSeconds||-1},
   newsHeadlines:state.newsKey===k.key?state.news.slice(0,5).map(x=>x.headline):[],reasons:['This is an indicator-based description, not a validated trading recommendation.']};
}
function init(){readWatch();navSetup();mount();bind();renderWatch();window.MarketPulseTerminal={selectOption,setInstrument,syncOptionAnalysis,invalidateOption,search,draw,refreshHeatmap,loadNews,context:copilotContext,currentOptionKey:state.option?state.instrument?.key:null,getInstrument:()=>state.instrument,getInterval:()=>state.interval,getQuote:()=>state.quote,getCandles:()=>state.history,getWatchlist:()=>[...state.watch.values()],getNews:()=>state.news,getSignals:()=>window.MarketPulseSignals?.compute(state.history)||{markers:[],latest:null},setSignals:v=>{state.showSignals=!!v;draw();},setRsi:v=>{state.showRsi=!!v;draw();}};
 // Poll only the selected instrument; news refresh is slower, and all calls stay within the Java adapter.
 setInterval(()=>{if(state.instrument)loadQuote();},12000);
 setInterval(()=>{if(state.instrument&&location.hash==='#chart')loadChart();},60000);
 setInterval(()=>{if(state.instrument&&location.hash==='#news')loadNews(false);},75000);
 setInterval(()=>{if(['#heatmap','#flow'].includes(location.hash))refreshHeatmap(true);},45000);
 // Help user jump into the new market explorer without an extra setup screen.
 if(location.hash==='#chart'&&!state.instrument)$('v8ChartStatus').textContent='SELECT INSTRUMENT TO BEGIN';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
