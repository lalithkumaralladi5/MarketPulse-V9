'use strict';
/* Interactive exchange OHLCV visualization – only browser-native Canvas, no CDN or token access.
 * A Upstox quote is drawn as a separate horizontal marker: never fabricated into OHLC candles.
 */
(()=>{
  const el=id=>document.getElementById(id);
  const st={selection:null,data:null,interval:5,requestId:0,inflight:false,view:82,offset:0,hover:-1,viewBars:[],metrics:[],dragging:false,lastX:0,started:false};
  const fmt=n=>Number.isFinite(+n)?'₹'+(+n).toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2}):'—';
  const number=n=>Number.isFinite(+n)?(+n).toLocaleString('en-IN',{maximumFractionDigits:0}):'—';
  function choose(id,text){el(id).textContent=text;}
  function identity(s){return s?[s.exchange,s.underlying,s.expiry,s.strike,s.type].join('|'):'';}
  function quoteLabel(ms){if(!ms)return 'No last-trade timestamp';const d=new Date(ms);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d)+' IST':'Invalid market timestamp';}
  function setState(t,cls=''){const b=el('chartStatus');b.textContent=t;b.className='chart-mode-pill '+cls;}
  function setEmpty(t){const e=el('chartEmpty');e.textContent=t;e.classList.remove('hidden');}
  function clear(t='Choose a CE/PE premium in the chain to open its chart'){
    st.data=null;st.hover=-1;st.offset=0;st.requestId++;
    setEmpty(t);choose('chartLastPrice','—');choose('chartTradeTime','No market timestamp');choose('chartCount','—');
    choose('chartOHLC','O —   H —   L —   C —');setState('AWAITING CONTRACT');draw();
  }
  function select(s,focus=false){
    const different=identity(s)!==identity(st.selection);
    st.selection={...s};if(different){st.data=null;st.offset=0;st.hover=-1;}
    choose('chartTitle',`${s.underlying==='NIFTY'?'NIFTY 50':s.underlying} ${Number(s.strike).toLocaleString('en-IN')} ${s.type} · ${s.expiry}`);
    setEmpty('Loading the selected option premium chart from '+(typeof isUpstox==='function'&&isUpstox()?'Upstox':'demo data')+'…');
    setState('LOADING CHART');
    if(focus){if(window.MarketPulsePages)window.MarketPulsePages.show('chart');else el('chartPanel').scrollIntoView({behavior:'smooth',block:'start'});}
    void refresh(false);
  }
  async function refresh(silent=false){
    if(!st.selection||st.inflight&&silent)return;
    const request=++st.requestId,contract={...st.selection},i=st.interval;
    st.inflight=true;
    try{
      const qs=new URLSearchParams({...contract,interval:String(i)});
      const r=await fetch('/api/chart?'+qs,{cache:'no-store'});
      const j=await r.json();
      if(!r.ok)throw Error(j.error||'Provider HTTP '+r.status);
      if(request!==st.requestId||identity(contract)!==identity(st.selection)||i!==st.interval)return;
      const bars=(Array.isArray(j.candles)?j.candles:[]).filter(b=>[b.open,b.high,b.low,b.close].every(v=>Number.isFinite(+v)&&+v>0)).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
      if(!bars.length)throw Error('No candles provided for this contract and interval');
      st.data={...j,candles:bars};
      el('chartEmpty').classList.add('hidden');
      choose('chartLastPrice',fmt(j.ltp));
      choose('chartTradeTime',j.lastTradeTime?quoteLabel(j.lastTradeTime):j.mode==='DEMO'?'Illustrative data only':'Quote timestamp unavailable');
      const closed=j.mode==='LIVE'&&!j.marketOpen;
      setState(j.mode==='DEMO'?'SYNTHETIC · DEMO':closed?'MARKET CLOSED · LAST DATA':j.quoteFresh?'UPSTOX · RECENT REST QUOTE':'UPSTOX · STALE QUOTE',j.mode==='DEMO'?'demo':closed?'closed':j.quoteFresh?'recent':'error');
      choose('chartSubtitle',j.mode==='LIVE'?'Upstox exchange candles · latest quote overlaid · REST snapshots (~12s)':'Sample option-premium candles · not actual exchange prices');
      choose('chartFooter',j.notice||(j.mode==='DEMO'?'Synthetic candles':'Exchange-sourced candles; REST snapshots'));
      choose('chartCount',bars.length+' candles · '+i+'m');
      draw();
    }catch(e){
      if(request!==st.requestId)return;
      st.data=null;setState('CHART DATA UNAVAILABLE','error');
      setEmpty('Chart unavailable: '+e.message+'. Historical data is not being replaced with simulated prices.');
      choose('chartCount','No valid candles');draw();
    }finally{if(request===st.requestId)st.inflight=false;}
  }
  const ensureNum=(n)=>Number(n)||0;
  function overlays(bars){
    let e9=0,e21=0,sumPV=0,sumV=0,lastDate='';
    return bars.map((b,i)=>{
      const c=+b.close;e9=i?(2/10)*c+(8/10)*e9:c;e21=i?(2/22)*c+(20/22)*e21:c;
      const date=String(b.time).slice(0,10);if(date!==lastDate){sumPV=0;sumV=0;lastDate=date;}
      const v=Math.max(0,+b.volume||0);sumPV+=v*(+b.high + +b.low + c)/3;sumV+=v;
      return {e9,e21,vwap:sumV>0?sumPV/sumV:c};
    });
  }
  function draw(){
    const can=el('candles');if(!can)return;
    const w=Math.max(310,Math.round(can.parentElement.getBoundingClientRect().width-18));
    const h=window.innerWidth<650?360:425,dpr=Math.min(window.devicePixelRatio||1,2);
    can.width=Math.round(w*dpr);can.height=Math.round(h*dpr);can.style.height=h+'px';
    const ctx=can.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#0b1b27';ctx.fillRect(0,0,w,h);
    const data=st.data;
    if(!data||!data.candles.length){
      ctx.strokeStyle='#253949';for(let j=1;j<6;j++){let y=j*h/6;ctx.beginPath();ctx.moveTo(10,y);ctx.lineTo(w-8,y);ctx.stroke();}
      return;
    }
    const all=data.candles,n=Math.min(all.length,Math.max(15,Math.round(st.view)));
    st.offset=Math.min(Math.max(0,st.offset),Math.max(0,all.length-n));
    const end=all.length-st.offset,start=Math.max(0,end-n),bars=all.slice(start,end);
    const meta=overlays(all).slice(start,end);
    const left=15,right=w-72,plotW=right-left,top=22,volTop=h-95,priceBottom=volTop-17,volBottom=h-42,axisY=h-14;
    const space=plotW/bars.length;
    const prices=bars.flatMap(b=>[+b.high,+b.low]);
    const validQuote=data.mode==='LIVE'&&+data.ltp>0;
    if(validQuote)prices.push(+data.ltp);
    if(el('chartEma').checked)for(const row of meta)prices.push(row.e9,row.e21);
    if(el('chartVwap').checked)for(const row of meta)prices.push(row.vwap);
    const mn=Math.min(...prices),mx=Math.max(...prices),range=Math.max(0.25,mx-mn),low=mn-range*.14,high=mx+range*.14;
    const y=p=>top+(high-p)/(high-low)*(priceBottom-top);
    ctx.save();ctx.strokeStyle='#20384a';ctx.lineWidth=1;ctx.font='10px system-ui';ctx.textBaseline='middle';
    for(let j=0;j<6;j++){let p=low+(high-low)*j/5,yy=y(p);ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#8babbc';ctx.fillText(p.toFixed(2),right+9,yy);}
    ctx.fillStyle='#83a3b3';ctx.fillText('VOLUME',left,volTop+7);
    const vMax=Math.max(1,...bars.map(b=>+b.volume||0));
    ctx.strokeStyle='#2c4657';ctx.beginPath();ctx.moveTo(left,volTop);ctx.lineTo(right,volTop);ctx.stroke();
    for(let j=0;j<bars.length;j++){
      let b=bars[j],x=left+j*space+space/2,isUp=+b.close>=+b.open,col=isUp?'#50dda9':'#ef718b';
      ctx.globalAlpha=.58;ctx.fillStyle=col;let barH=(+b.volume||0)/vMax*(volBottom-volTop-18);
      ctx.fillRect(x-space*.3,volBottom-barH,Math.max(1.3,space*.6),barH);ctx.globalAlpha=1;
      ctx.strokeStyle=col;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x,y(+b.high));ctx.lineTo(x,y(+b.low));ctx.stroke();
      ctx.fillStyle=col;const op=y(+b.open),cl=y(+b.close);
      ctx.fillRect(x-Math.max(1,space*.31),Math.min(op,cl),Math.max(2,space*.62),Math.max(1.2,Math.abs(op-cl)));
    }
    function line(key,color){ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.globalAlpha=.9;let started=false;meta.forEach((v,j)=>{const value=v[key];if(!Number.isFinite(value))return;const x=left+j*space+space/2;if(!started){ctx.moveTo(x,y(value));started=true;}else ctx.lineTo(x,y(value));});ctx.stroke();ctx.globalAlpha=1;}
    if(el('chartEma').checked){line('e9','#e5b76b');line('e21','#74a9fd');}
    if(el('chartVwap').checked)line('vwap','#b990e9');
    if(validQuote){let qY=y(+data.ltp);ctx.strokeStyle=data.quoteFresh&&data.marketOpen?'#50e3b0':'#d0b477';ctx.setLineDash([6,5]);ctx.lineWidth=1.25;ctx.beginPath();ctx.moveTo(left,qY);ctx.lineTo(right,qY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=data.quoteFresh&&data.marketOpen?'#1c624e':'#604f2f';ctx.fillRect(right,qY-11,69,21);ctx.fillStyle='#f8ffff';ctx.font='bold 10px system-ui';ctx.fillText((+data.ltp).toFixed(2),right+6,qY);}
    if(el('chartLevels').checked && window.analysis && window.analysis?.strike===st.selection?.strike){
      const a=window.analysis;const valid=a.mode==='DEMO'||(a.dataQuality?.fresh&&a.dataQuality?.snapshotFresh&&data.marketOpen);
      if(valid){for(const [key,color] of [['entryReference','#78dba9'],['illustrativeStop','#ff8e9f'],['illustrativeTarget1','#74aafd']]){const lv=+a.risk?.[key];if(!lv||lv<low||lv>high)continue;ctx.setLineDash([3,7]);ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(left,y(lv));ctx.lineTo(right,y(lv));ctx.stroke();ctx.setLineDash([]);}}
    }
    const indexes=[0,Math.floor(bars.length*.25),Math.floor(bars.length*.5),Math.floor(bars.length*.75),bars.length-1];
    ctx.fillStyle='#8baabb';ctx.font='10px system-ui';ctx.textAlign='center';
    indexes.forEach(j=>{const b=bars[j];if(!b)return;const d=new Date(b.time);if(!Number.isFinite(d.getTime()))return;const t=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);ctx.fillText(t,left+j*space+space/2,axisY);});
    ctx.textAlign='left';
    if(st.hover>=0&&st.hover<bars.length){
      const j=st.hover,b=bars[j],x=left+j*space+space/2;
      ctx.strokeStyle='#a5c8d5';ctx.globalAlpha=.72;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,volBottom);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
      ctx.fillStyle='#284758';ctx.fillRect(Math.max(left,x-24),h-36,49,17);
      ctx.fillStyle='#d7edf7';ctx.font='10px system-ui';ctx.fillText(String(st.hover+start+1),Math.max(left,x-19),h-28);
    }
    ctx.restore();
    st.viewBars=bars;st.plot={left,right,space};
    showOHLC();
  }
  function showOHLC(){
    const b=st.hover>=0?st.viewBars[st.hover]:st.viewBars.at(-1);
    if(!b)return;
    const vals=[['O',fmt(b.open)],['H',fmt(b.high)],['L',fmt(b.low)],['C',fmt(b.close)],['Vol',number(b.volume)]];
    el('chartOHLC').innerHTML='';
    for(const [k,v] of vals){const span=document.createElement('span');span.textContent=k+' '+v;
      if(k==='C')span.className=+b.close>=+b.open?'up':'down';el('chartOHLC').append(span);}
  }
  function zoom(inward){st.view=Math.max(20,Math.min(230,st.view+(inward?-16:16)));draw();}
  function bind(){
    if(st.started)return;st.started=true;
    el('chartTimeframes').querySelectorAll('[data-interval]').forEach(b=>b.addEventListener('click',()=>{
      const v=Number(b.dataset.interval);if(v===st.interval)return;st.interval=v;st.view=82;st.offset=0;
      el('chartTimeframes').querySelectorAll('button').forEach(t=>t.classList.toggle('active',t===b));
      if(st.selection){st.data=null;setEmpty('Loading '+v+'-minute Upstox candles…');void refresh(false);}
    }));
    ['chartEma','chartVwap','chartLevels'].forEach(id=>el(id).addEventListener('change',draw));
    el('chartRefresh').addEventListener('click',()=>void refresh(false));
    el('chartZoomIn').addEventListener('click',()=>zoom(true));el('chartZoomOut').addEventListener('click',()=>zoom(false));
    el('chartReset').addEventListener('click',()=>{st.view=82;st.offset=0;st.hover=-1;draw();});
    const can=el('candles');
    can.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0);},{passive:false});
    can.addEventListener('pointerdown',e=>{st.dragging=true;st.lastX=e.clientX;can.setPointerCapture(e.pointerId);});
    can.addEventListener('pointerup',()=>st.dragging=false);
    can.addEventListener('pointercancel',()=>st.dragging=false);
    can.addEventListener('pointerleave',()=>{st.hover=-1;if(!st.dragging)draw();});
    can.addEventListener('pointermove',e=>{
      if(st.dragging){const delta=e.clientX-st.lastX;const step=st.plot?.space||8;if(Math.abs(delta)>step){st.offset=Math.max(0,st.offset+Math.round(delta/step));st.lastX=e.clientX;st.hover=-1;draw();}return;}
      if(!st.plot||!st.viewBars?.length)return;
      const rect=can.getBoundingClientRect(),x=(e.clientX-rect.left)*(can.width/(Math.min(window.devicePixelRatio||1,2)*rect.width));
      const next=Math.floor((x-st.plot.left)/st.plot.space);st.hover=next>=0&&next<st.viewBars.length?next:-1;draw();
    });
    can.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(true);}if(e.key==='-'){e.preventDefault();zoom(false);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){st.offset=Math.max(0,st.offset+(e.key==='ArrowLeft'?3:-3));draw();}});
    window.addEventListener('resize',()=>{draw();});
    draw();
  }
  window.MarketPulseChart={select,refresh,draw,clear};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
