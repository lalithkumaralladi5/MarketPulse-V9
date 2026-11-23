'use strict';
/* MarketPulse V11 - strictly local paper-trading portfolio. NO broker order requests. */
(()=>{
 const $=id=>document.getElementById(id), STORAGE='marketpulse_paper_desk_v1';
 const money=n=>Number.isFinite(n)?'₹'+n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const initial=()=>({cash:1000000,positions:{},ledger:[],realized:0});
 let account=initial(),message='',messageKind='neutral';
 const round=n=>Math.round(n*100)/100;
 const valid=n=>Number.isFinite(+n)&&+n>=0;
 function restore(){
  try {
   const a=JSON.parse(localStorage.getItem(STORAGE)||'null');
   if(!a||!valid(a.cash)||!Array.isArray(a.ledger)||typeof a.positions!=='object'||!a.positions||!valid(a.realized))return;
   const positions={};
   for(const [key,p] of Object.entries(a.positions)){
    if(!/^(NSE|BSE|DEMO)_(EQ|FO|INDEX)\|[A-Za-z0-9._ -]{1,78}$/.test(key))continue;
    if(!Number.isSafeInteger(p.qty)||p.qty<1||p.qty>1000000||!valid(p.avg))continue;
    positions[key]={symbol:String(p.symbol||key).slice(0,80),qty:p.qty,avg:+p.avg};
   }
   account={cash:+a.cash,positions,realized:+a.realized,ledger:a.ledger.slice(-70).filter(t=>t&&['BUY','SELL'].includes(t.side))};
  } catch {account=initial();}
 }
 function save(){try{localStorage.setItem(STORAGE,JSON.stringify(account));}catch{note('Browser storage is unavailable; this paper account will not persist.','warn');}}
 function note(text,kind='neutral'){message=text;messageKind=kind;const el=$('deskMessage');if(el){el.textContent=text;el.dataset.kind=kind;}}
 function selected(){return window.MarketPulseTerminal?.getInstrument?.()||null;}
 function quote(){return window.MarketPulseTerminal?.getQuote?.()||null;}
 function authorized(q){return !!q && +q.ltp>0 && (q.mode==='DEMO'||(q.mode==='LIVE'&&q.fresh===true&&q.marketOpenApprox===true&&Number.isFinite(+q.ageSeconds)&&+q.ageSeconds>=-30&&+q.ageSeconds<=60));}
 function charges(notional){return round(Math.min(20,notional*0.0003)+notional*0.0005);}
 function estimate(side){
  const inst=selected(),q=quote(),qty=Number($('deskQuantity')?.value||0),stop=Number($('deskStop')?.value||0),riskPct=Number($('deskRisk')?.value||0);
  const pos=inst?account.positions[inst.key]:null;
  if(!inst)return {error:'Select an instrument from Markets or the heatmap first.'};
  if(!authorized(q))return {error:q?.mode==='LIVE'?'Live quote unavailable, stale, or market closed. New paper fills are blocked.': 'No verified quote. Choose an instrument first.'};
  if(!Number.isSafeInteger(qty)||qty<1||qty>100000)return {error:'Quantity must be a whole number between 1 and 100,000.'};
  const best=side==='BUY'?(+q.ask>0?+q.ask:+q.ltp):(+q.bid>0?+q.bid:+q.ltp);
  // Illustrative 5 bps adverse slippage per side; no fills, taxes or lot-size guarantees.
  const fill=round(best*(side==='BUY'?1.0005:.9995));
  const notional=round(fill*qty),fee=charges(notional);
  if(!(fill>0))return {error:'No positive reference price.'};
  if(side==='SELL'){
   if(!pos||pos.qty<qty)return {error:'Paper SELL can only close units already held in this simulated account.'};
   return {side,inst,q,qty,fill,notional,fee,position:pos,ok:true};
  }
  if(!Number.isFinite(stop)||stop<=0||stop>=fill)return {error:'Set a stop below the paper entry price to define maximum planned price risk.'};
  if(!Number.isFinite(riskPct)||riskPct<=0||riskPct>5)return {error:'Risk budget must be between 0.1% and 5%.'};
  const risk=round((fill-stop)*qty+fee),budget=round((1000000+account.realized)*riskPct/100);
  if(notional+fee>account.cash)return {error:'Not enough simulated cash for this order plus estimated charges.'};
  if(risk>budget)return {error:'Risk '+money(risk)+' exceeds your '+riskPct+'% budget of '+money(budget)+'. Lower quantity or widen the risk budget cautiously.'};
  return {side,inst,q,qty,fill,notional,fee,risk,budget,ok:true};
 }
 function totals(){
  const holdings=Object.values(account.positions);
  const basis=holdings.reduce((a,p)=>a+p.qty*p.avg,0);
  const current=selected(),q=quote(),p=current?account.positions[current.key]:null;
  const mark=p&&q&&+q.ltp>0?round((+q.ltp-p.avg)*p.qty):null;
  $('deskCash').textContent=money(account.cash);
  $('deskBasis').textContent=money(basis);
  $('deskRealized').textContent=money(account.realized);
  $('deskUnrealized').textContent=mark===null?'—':money(mark);
  $('deskMarkNote').textContent=mark===null?'No current selected holding to mark':'Selected holding only; other positions are not marked automatically';
  const root=$('deskPositions');root.innerHTML='';
  if(!holdings.length){root.innerHTML='<div class="desk-empty">No open paper positions yet. Choose an instrument and review a simulated order.</div>';return;}
  for(const [key,holding] of Object.entries(account.positions)){
   const row=document.createElement('div');row.className='desk-position';
   const isCurrent=key===current?.key;
   const pnl=isCurrent&&q&&+q.ltp>0?(+q.ltp-holding.avg)*holding.qty:null;
   row.innerHTML='<div><strong>'+esc(holding.symbol)+'</strong><small>'+esc(key)+'</small></div>'+
     '<span>'+holding.qty+' units</span><span>Avg '+money(holding.avg)+'</span>'+
     '<b class="'+(pnl!==null?(pnl>=0?'desk-up':'desk-down'):'')+'">'+(pnl===null?'Mark unavailable':money(pnl))+'</b>';
   root.append(row);
  }
 }
 function journal(){
  const root=$('deskJournal');root.innerHTML='';
  if(!account.ledger.length){root.innerHTML='<div class="desk-empty">Simulated fills will be recorded here, locally in your browser.</div>';return;}
  for(const t of [...account.ledger].reverse().slice(0,14)){
   const row=document.createElement('div');row.className='desk-fill';
   const dir=t.side==='BUY'?'desk-up':'desk-down';
   row.innerHTML='<span>'+esc(new Date(t.time).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'short',timeStyle:'short'}))+'</span>'+
    '<strong class="'+dir+'">'+esc(t.side)+'</strong><span>'+esc(t.symbol)+' × '+Number(t.qty)+'</span>'+
    '<b>'+money(+t.price)+'</b><span>'+esc(t.mode||'PAPER')+'</span>';
   root.append(row);
  }
 }
 function render(){
  if(!$('deskStatus'))return;
  const inst=selected(),q=quote();
  $('deskSymbol').textContent=inst?.symbol||'No instrument selected';
  $('deskInstrument').textContent=inst?(inst.exchange+' · '+inst.segment+' · '+inst.key):'Search a stock or select a CE/PE option first';
  $('deskPrice').textContent=q&&+q.ltp>0?money(+q.ltp):'—';
  $('deskStatus').textContent=!q?'NO QUOTE':q.mode==='DEMO'?'DEMO REFERENCE · SIMULATED':authorized(q)?'UPSTOX · RECENT SNAPSHOT':'UPSTOX · MARKET CLOSED / STALE';
  $('deskStatus').dataset.kind=authorized(q)?q.mode==='DEMO'?'demo':'live':'blocked';
  const side=$('deskSide').value;
  const v=estimate(side);
  $('deskPreview').textContent=v.ok
   ?'Estimated '+side+' reference '+money(v.fill)+' × '+v.qty+' = '+money(v.notional)+
    '  ·  estimated costs '+money(v.fee)+(v.risk!==undefined?'  ·  planned stop risk '+money(v.risk)+' / '+money(v.budget):'  ·  closing held paper units')
   :v.error;
  $('deskExecute').disabled=!v.ok;
  $('deskExecute').textContent='Simulate paper '+side;
  totals();journal();
 }
 function execute(){
  const v=estimate($('deskSide').value);
  if(!v.ok){note(v.error,'warn');render();return;}
  const {side,inst,q,qty,fill,notional,fee}=v;
  const pos=account.positions[inst.key];
  if(side==='BUY'){
   account.cash=round(account.cash-notional-fee);
   if(pos){const all=pos.qty+qty;pos.avg=round((pos.avg*pos.qty+notional)/all);pos.qty=all;}
   else account.positions[inst.key]={symbol:inst.symbol,qty,avg:fill};
  }else{
   account.cash=round(account.cash+notional-fee);
   account.realized=round(account.realized+(fill-pos.avg)*qty-fee);
   pos.qty-=qty;if(pos.qty===0)delete account.positions[inst.key];
  }
  account.ledger.push({time:new Date().toISOString(),side,symbol:inst.symbol,key:inst.key,qty,price:fill,fee,mode:q.mode==='LIVE'?'UPSTOX SNAPSHOT · PAPER':'SYNTHETIC DEMO · PAPER'});
  account.ledger=account.ledger.slice(-70);save();
  note('Recorded '+side+' of '+qty+' '+inst.symbol+' at simulated '+money(fill)+'. No broker order was sent.','success');
  render();
 }
 async function modelStatus(){
  const el=$('deskModel');
  if(!el)return;
  try{const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),8000);
   let r;try{r=await fetch('/api/ml/status',{cache:'no-store',signal:ctrl.signal});}finally{clearTimeout(t);}
   const d=await r.json();el.textContent=d.ready
    ?'MODEL LOADED · '+String(d.metadata?.source||'private training')+' · scores available in Prediction Lab'
    :'MODEL NOT TRAINED · no verified prediction until historical training and validation complete';
  }catch{el.textContent='MODEL OFFLINE · trained prediction unavailable';}
 }
 function init(){
  const root=$('view-tradingdesk');if(!root)return;
  restore();
  root.innerHTML=[
   '<header class="desk-heading"><div><span class="desk-eyebrow">MARKETPULSE / PROFESSIONAL RESEARCH EXECUTION</span><h1>Trading Desk <em>Simulated</em></h1><p>A brokerage-style decision workspace with risk budgets, a paper order ticket, portfolio and fill journal. Real-money orders are not connected.</p></div><span class="desk-tag">PAPER ONLY · NO BROKER EXECUTION</span></header>',
   '<div class="desk-kpis"><div><small>SIMULATED CASH</small><strong id="deskCash">—</strong></div><div><small>OPEN POSITION COST BASIS</small><strong id="deskBasis">—</strong></div><div><small>REALIZED PAPER P&amp;L</small><strong id="deskRealized">—</strong></div><div><small>SELECTED HOLDING UNREALIZED</small><strong id="deskUnrealized">—</strong><small id="deskMarkNote"></small></div></div>',
   '<div class="desk-grid"><section class="desk-card"><div class="desk-card-head"><span class="desk-eyebrow">01 / SELECTED MARKET</span><span id="deskStatus" data-kind="blocked">NO QUOTE</span></div><h2 id="deskSymbol">No instrument selected</h2><p id="deskInstrument"></p><div class="desk-bigprice" id="deskPrice">—</div><div class="desk-buttons"><button id="deskFind">Find a stock</button><button id="deskChart">Open chart</button><button id="deskPredict">Prediction lab</button></div><p class="desk-caution" id="deskModel">Checking model readiness…</p><p class="desk-note">Upstox V3 REST prices are snapshots. A loaded model does not imply a reliable trading edge; check held-out results in Prediction Lab.</p></section>',
   '<section class="desk-card"><div class="desk-card-head"><span class="desk-eyebrow">02 / RISK-CHECKED ORDER TICKET</span><span class="desk-ticket-mode">SIMULATION</span></div><div class="desk-form">',
   '<label>Paper side<select id="deskSide"><option value="BUY">BUY / add long</option><option value="SELL">SELL / close long</option></select></label>',
   '<label>Quantity (units)<input id="deskQuantity" type="number" min="1" max="100000" step="1" value="1"></label>',
   '<label>Planned stop-loss price (₹)<input id="deskStop" type="number" min="0.01" step="0.05" placeholder="Required for paper buys"></label>',
   '<label>Maximum risk budget (%)<input id="deskRisk" type="number" min="0.1" max="5" step="0.1" value="1"></label></div>',
   '<div id="deskPreview" class="desk-preview" role="status">Select an instrument to preview a paper trade.</div>',
   '<button id="deskExecute" class="desk-execute" disabled>Simulate paper BUY</button>',
   '<p class="desk-note">No limit/market orders are routed. Estimated costs: 5 bps slippage per side plus illustrative charges (0.05% and up to ₹20). Does not model taxes, fills, freeze quantities, lot-size rules, margin, or broker execution.</p>',
   '<p id="deskMessage" class="desk-message" aria-live="polite"></p></section></div>',
   '<section class="desk-card"><div class="desk-card-head"><span class="desk-eyebrow">03 / OPEN PAPER POSITIONS</span><span>LOCAL BROWSER JOURNAL</span></div><div id="deskPositions"></div></section>',
   '<section class="desk-card"><div class="desk-card-head"><span class="desk-eyebrow">04 / FILL JOURNAL</span><button id="deskReset" class="desk-reset">Reset practice account</button></div><div id="deskJournal"></div></section>',
   '<p class="desk-disclaimer">This is paper research only, not a broker trading interface. Currency, quantities and P&amp;L are simulated. Orders are never submitted to Upstox or any exchange. All account data is saved only in this browser. Past backtest accuracy and live model scores do not guarantee profit.</p>'
  ].join('');
  for(const id of ['deskSide','deskQuantity','deskStop','deskRisk'])$(id).addEventListener('input',render);
  $('deskExecute').addEventListener('click',execute);
  $('deskFind').addEventListener('click',()=>window.MarketPulsePages?.show('explore'));
  $('deskChart').addEventListener('click',()=>window.MarketPulsePages?.show('chart'));
  $('deskPredict').addEventListener('click',()=>window.MarketPulsePages?.show('predict'));
  $('deskReset').addEventListener('click',()=>{
   if(!window.confirm('Reset your local paper cash, all positions and simulated trade history?'))return;
   account=initial();save();note('Practice account reset. No broker account was affected.','success');render();
  });
  window.addEventListener('marketpulse:quote',render);
  window.addEventListener('marketpulse:instrument',()=>setTimeout(render,0));
  window.addEventListener('hashchange',()=>{if(location.hash==='#tradingdesk'){render();modelStatus();}});
  render();modelStatus();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();