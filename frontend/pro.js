'use strict';
/* V5 insight layer. Uses existing V4 normalized analysis/chain; never accesses tokens. */
(() => {
  const el = id => document.getElementById(id);
  const fixed = (x,d=1) => Number.isFinite(Number(x)) ? Number(x).toFixed(d) : '—';
  const rupee = x => Number.isFinite(Number(x)) ? '₹'+Number(x).toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:2}) : '—';
  const int = x => Number.isFinite(Number(x)) ? Math.round(Number(x)).toLocaleString('en-IN') : '—';
  const setText = (id,val) => { if(el(id))el(id).textContent = String(val); };
  const numeric = x => Number.isFinite(Number(x)) ? Number(x) : 0;
  let labResult = null, cloudAvailable = false, busy = false;
  function gateRow(name,passed,detail){
    const wrap=document.createElement('div');wrap.className='ready-row';
    const l=document.createElement('span');l.textContent=name;
    const r=document.createElement('strong');r.className=passed?'':'unsafe';r.textContent=(passed?'✓ ':'× ')+detail;
    wrap.append(l,r);return wrap;
  }
  function proClear(){
    for(const id of ['readyScore','oiPcr','oiMaxPain','oiCallWall','oiPutWall','labTrades','labWR','labExpect','labNet','labDD','labBars','riskLots','riskLoss','riskDebit'])setText(id,'—');
    el('readyGauge').style.setProperty('--score','0%');setText('readyLabel','NO VALID QUOTE');
    el('readinessChecks').replaceChildren(gateRow('Snapshot freshness',false,'UNAVAILABLE'));
    setText('readySummary','No current contract analysis. Any previous setup has been cleared.');
    setText('labStatus','No usable quote or candles.');setText('proIntegrity','UNVERIFIED');
    el('labEquity').replaceChildren();labResult=null;
  }
  function chainSummary(){
    if(!chain?.rows?.length){for(const id of ['oiPcr','oiMaxPain','oiCallWall','oiPutWall'])setText(id,'—');return;}
    const rows=chain.rows.filter(r=>Number.isFinite(Number(r.strike))).map(r=>({k:+r.strike,call:Math.max(0,numeric(r.CE?.oi)),put:Math.max(0,numeric(r.PE?.oi))}));
    const cs=rows.reduce((s,r)=>s+r.call,0),ps=rows.reduce((s,r)=>s+r.put,0);
    setText('oiPcr',cs>0?fixed(ps/cs,2):'—');
    const valid=rows.filter(r=>r.call+r.put>0);
    if(!valid.length){for(const id of ['oiMaxPain','oiCallWall','oiPutWall'])setText(id,'—');return;}
    const peakC=valid.reduce((a,b)=>a.call>b.call?a:b),peakP=valid.reduce((a,b)=>a.put>b.put?a:b);
    const mp=valid.reduce((best,r)=>{
      const pay=valid.reduce((s,o)=>s+o.call*Math.max(0,r.k-o.k)+o.put*Math.max(0,o.k-r.k),0);
      return !best||pay<best.pay?{k:r.k,pay}:best;
    },null);
    setText('oiMaxPain',int(mp.k));setText('oiCallWall',int(peakC.k));setText('oiPutWall',int(peakP.k));
    setText('oiDisclaimer',(chain.mode==='LIVE'?'Provider':'Synthetic')+' expiry '+chain.expiry+' · '+valid.length+' quoted strikes. Max pain is theoretical static OI settlement arithmetic—not a forecast or verified support.');
  }
  function updateReadiness(){
    if(!analysis){proClear();return;}
    const a=analysis,q=a.dataQuality||{},checks=a.checks||{};
    const isLive=a.mode==='LIVE';
    const fresh=!!q.fresh&&(!isLive||a.provider!=='Upstox'||!!q.snapshotFresh);
    const spread=numeric(a.spreadPct)<=1.5&&numeric(a.ask)>0&&numeric(a.bid)>0;
    const oi=numeric(a.oi)>=500;
    const session=!!q.withinNormalHours;
    const alignment=a.signal==='BUY SETUP';
    const node=el('readinessChecks');node.replaceChildren(
      gateRow('Timestamp / freshness',isLive&&fresh,isLive?(fresh?'CURRENT':'STALE'):'DEMO ONLY'),
      gateRow('Spread ≤ 1.5%',spread,spread?'PASS':fixed(a.spreadPct,2)+'%'),
      gateRow('Open interest ≥ 500',oi,oi?'PASS':'LOW'),
      gateRow('Regular session',session,session?'IN HOURS':'CLOSED'),
      gateRow('Direction & rules',alignment,alignment?'SETUP':'NO ENTRY')
    );
    setText('readyScore',Math.round(numeric(a.alignmentScore))+'%');
    el('readyGauge').style.setProperty('--score',Math.max(0,Math.min(100,numeric(a.alignmentScore)))+'%');
    setText('readyLabel',!isLive?'DEMO · NO LIVE SIGNAL':!fresh?'STALE · BLOCKED':alignment?'CONDITIONAL SETUP':'WAIT / NO ENTRY');
    setText('readySummary',!isLive?'Demo numbers are synthetic. Evaluate UI and rules only; do not act on them.':!fresh?'Outdated or missing quote timestamps. All live entry levels must be treated as unavailable.':'Received Upstox market-data snapshots. This is not an audited strategy or win probability.');
    setText('proIntegrity',!isLive?'SYNTHETIC DEMO':!fresh?'LIVE · STALE':'LIVE · CHECK QUOTE');
    setText('proDataHint',isLive?(a.provider||'Broker')+' · '+a.underlying+' '+a.strike+' '+a.type+' · '+a.expiry:a.underlying+' · synthetic research session');
    updateRisk();runLab();
  }
  function updateRisk(){
    const capital=Number(el('riskCapital').value),riskPct=Number(el('riskPct').value),lot=Number(el('riskLot').value);
    const validCapital=Number.isFinite(capital)&&capital>=1000&&capital<=1e9;
    const validRisk=Number.isFinite(riskPct)&&riskPct>=.1&&riskPct<=10;
    setText('riskBudget',validCapital&&validRisk?rupee(capital*riskPct/100):'—');
    if(!analysis||!validCapital||!validRisk||!Number.isInteger(lot)||lot<=0||lot>50000){
      for(const id of ['riskLots','riskLoss','riskDebit'])setText(id,'—');
      setText('riskHelp',!Number.isInteger(lot)||lot<=0?'Enter the real, broker-confirmed lot size before calculating contracts.':'Choose a contract with valid prices; check capital, risk % and lot size.');return;
    }
    const a=analysis,entry=numeric(a.risk?.entryReference),stop=numeric(a.risk?.illustrativeStop);
    const liveValid=a.mode!=='LIVE'||(a.dataQuality?.fresh&&(a.provider!=='Upstox'||a.dataQuality?.snapshotFresh));
    if(!liveValid||entry<=0||stop<=0||stop>=entry){
      for(const id of ['riskLots','riskLoss','riskDebit'])setText(id,'—');
      setText('riskHelp','No valid entry/stop for this quote. Stale provider data blocks sizing.');return;
    }
    const riskLot=(entry-stop)*lot,debitLot=entry*lot;
    const nLots=Math.max(0,Math.min(100000,Math.floor(capital*riskPct/100/riskLot),Math.floor(capital/debitLot)));
    setText('riskLots',int(nLots));setText('riskLoss',rupee(nLots*riskLot));setText('riskDebit',rupee(nLots*debitLot));
    setText('riskHelp',nLots===0?'The chosen risk budget or capital cannot support even one theoretical lot at these reference levels.':'Stop loss is not guaranteed to fill. Tax, brokerage, slippage and other open positions are NOT included; this is not a trade instruction.');
  }
  function ema(arr,n){let v=arr[0];const out=[v],k=2/(n+1);for(let i=1;i<arr.length;i++){v=arr[i]*k+(1-k)*v;out.push(v)}return out;}
  function rsiAt(bars,i,n=14){if(i<n)return 50;let g=0,l=0;for(let j=i-n+1;j<=i;j++){let delta=bars[j].close-bars[j-1].close;g+=Math.max(0,delta);l+=Math.max(0,-delta);}return l===0?(g===0?50:100):100-100/(1+g/l);}
  function atrAt(bars,i,n=14){if(i<2)return 0;let total=0,count=0;for(let j=Math.max(1,i-n+1);j<=i;j++){const x=bars[j],p=bars[j-1];total+=Math.max(x.high-x.low,Math.abs(x.high-p.close),Math.abs(x.low-p.close));count++;}return total/count;}
  function sessionVwap(bars,i){let pv=0,vol=0,date=String(bars[i].time).slice(0,10);for(let j=i;j>=0&&String(bars[j].time).slice(0,10)===date;j--){const b=bars[j],v=Math.max(0,b.volume);pv+=(b.high+b.low+b.close)/3*v;vol+=v;}return vol>0?pv/vol:bars[i].close;}
  function backtest(history){
    const rows=(history||[]).map(b=>({time:String(b.time||''),open:+b.open,close:+b.close,high:+b.high,low:+b.low,volume:+b.volume}))
      .filter(b=>b.time&&[b.open,b.close,b.high,b.low,b.volume].every(Number.isFinite)&&b.open>0&&b.close>0&&b.high>=Math.max(b.close,b.open)&&b.low<=Math.min(b.close,b.open));
    if(rows.length<70)return {bars:rows.length,trades:[],equity:[],note:'Too few historical candles for even a diagnostic. At least 70 complete bars required.'};
    rows.pop(); // latest 5-minute bar may be forming
    const close=rows.map(r=>r.close),e9=ema(close,9),e21=ema(close,21),trades=[];
    let nextAllowed=22;
    for(let i=22;i<rows.length-1;i++){
      if(i<nextAllowed||i>=rows.length-2)continue;
      const direction=e9[i]>e21[i]&&e9[i-1]<=e21[i-1];
      const bullish=rsiAt(rows,i)>=52&&rsiAt(rows,i)<=75&&rows[i].close>sessionVwap(rows,i);
      const openRow=rows[i+1];if(!direction||!bullish||String(openRow.time).slice(0,10)!==String(rows[i].time).slice(0,10))continue;
      const start=openRow.open*1.0010;const atr=atrAt(rows,i),risk=Math.max(atr*1.4,start*.07),stop=Math.max(.01,start-risk),target=start+1.8*risk;
      let exitAt=i+1,exit=rows[exitAt].close,how='time';
      for(let j=i+1;j<Math.min(rows.length,i+9);j++){
        if(String(rows[j].time).slice(0,10)!==String(openRow.time).slice(0,10))break;
        const b=rows[j];exitAt=j;
        if(b.low<=stop){exit=stop;how='stop';break;}
        if(b.high>=target){exit=target;how='target';break;}
        exit=b.close;
      }
      exit=exit*(1-.0010); // 10 bps exit slippage; stop may gap through (not modelled)
      const cost=(start+exit)*.0012; // 12 bps per side assumed, includes illustrative execution costs
      const r=(exit-start-cost)/Math.max(.01,start-stop);
      trades.push({time:openRow.time,entry:start,exit,barIndex:exitAt,R:r,result:how});nextAllowed=exitAt+1;
    }
    let eq=0,peak=0,dd=0;const equity=[0];for(const t of trades){eq+=t.R;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);equity.push(eq);}
    const cut=Math.floor(rows.length*.6);const holdout=trades.filter(t=>t.barIndex>=cut),wins=holdout.filter(t=>t.R>0).length,net=holdout.reduce((s,t)=>s+t.R,0);
    return {bars:rows.length,trades,holdout,winRate:holdout.length?wins/holdout.length:NaN,net,expectancy:holdout.length?net/holdout.length:NaN,drawdown:dd,equity,note:trades.length<10?'FEW TRADES: not a statistical benchmark.':'Chronological 60/40 split, fixed rules, no hyperparameter fitting. More expiries still required.'};
  }
  function graph(values){const svg=el('labEquity');svg.replaceChildren();if(values.length<2)return;
    const v=[...values],lo=Math.min(0,...v),hi=Math.max(0,...v),range=Math.max(.1,hi-lo),points=v.map((n,i)=>(11+i*578/(v.length-1)).toFixed(1)+','+(66-(n-lo)/range*56).toFixed(1)).join(' ');
    const xmlns='http://www.w3.org/2000/svg';const l=document.createElementNS(xmlns,'line');l.setAttribute('x1','10');l.setAttribute('x2','590');l.setAttribute('y1',String(66-(0-lo)/range*56));l.setAttribute('y2',String(66-(0-lo)/range*56));l.setAttribute('stroke','#385966');l.setAttribute('stroke-dasharray','5 5');svg.append(l);
    const poly=document.createElementNS(xmlns,'polyline');poly.setAttribute('points',points);poly.setAttribute('fill','none');poly.setAttribute('stroke','#51e2b5');poly.setAttribute('stroke-width','2');poly.setAttribute('vector-effect','non-scaling-stroke');svg.append(poly);
  }
  function runLab(){
    if(!analysis){return;}
    labResult=backtest(analysis.candles);
    setText('labBars',int(labResult.bars));
    setText('labTrades',int(labResult.holdout?.length||0));
    setText('labWR',labResult.holdout?.length?fixed(labResult.winRate*100,1)+'%':'—');
    setText('labExpect',labResult.holdout?.length?fixed(labResult.expectancy,2)+'R':'—');
    setText('labNet',labResult.holdout?.length?fixed(labResult.net,2)+'R':'—');
    setText('labDD',labResult.trades?.length?fixed(labResult.drawdown,2)+'R':'—');
    setText('labStatus',(analysis.mode==='LIVE'?'Provider candle history':'SYNTHETIC demonstration history')+' · Holdout final 40% · '+labResult.note);
    graph(labResult.equity);
  }
  function exportReport(){
    if(!analysis){alert('Choose an option contract before exporting a snapshot.');return;}
    const a=analysis;
    const sanitized={reportVersion:'MarketPulse V5',exportedAt:new Date().toISOString(),providerMode:a.mode,provider:a.provider||'Synthetic demo',contract:{exchange:a.exchange,underlying:a.underlying,expiry:a.expiry,strike:a.strike,type:a.type},quote:{premium:a.premium,bid:a.bid,ask:a.ask,asOf:a.asOf,spreadPct:a.spreadPct,oi:a.oi},signal:{action:a.signal,alignmentScore:a.alignmentScore,notProbability:true,checks:a.checks,reasons:a.reasons,quality:a.dataQuality},indicators:a.indicators,risk:a.risk,depthTotals:{buyQty:a.depth?.buyQty,sellQty:a.depth?.sellQty,imbalance:a.depth?.imbalance},diagnostic:labResult?{bars:labResult.bars,tradesAll:labResult.trades?.length,holdoutTrades:labResult.holdout?.length,holdoutWinRate:labResult.winRate,holdoutNetR:labResult.net,drawdownR:labResult.drawdown,note:labResult.note}:null,limitations:'Not investment advice. No validated win probability. No real trades. Displayed depth != executed flow. Backtest is exploratory and excludes complete market frictions.'};
    const blob=new Blob([JSON.stringify(sanitized,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='marketpulse-'+String(a.underlying||'contract').toLowerCase()+'-'+String(a.strike||'')+'-'+String(a.type||'')+'-snapshot.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function chatMessage(side,speaker,text){const elBubble=document.createElement('div');elBubble.className='chat-bubble '+side;const sp=document.createElement('span');sp.className='speaker';sp.textContent=speaker;elBubble.append(sp,document.createTextNode(text));const feed=el('chatFeed');feed.append(elBubble);if(feed.children.length>24)feed.firstElementChild.remove();feed.scrollTop=feed.scrollHeight;return elBubble;}
  function chatContext(){const generic=window.MarketPulseTerminal?.context?.();if(generic?.symbol&&(!analysis||analysis.symbol!==window.MarketPulseTerminal?.currentOptionKey))return generic;if(!analysis)return{};const a=analysis;return {mode:a.mode,provider:a.provider,asOf:a.asOf,underlying:a.underlying,exchange:a.exchange,symbol:a.symbol,expiry:a.expiry,strike:a.strike,type:a.type,signal:a.signal,alignmentScore:a.alignmentScore,premium:a.premium,bid:a.bid,ask:a.ask,spreadPct:a.spreadPct,oi:a.oi,oiChangePct:a.oiChangePct,iv:a.iv,delta:a.delta,theta:a.theta,indicators:a.indicators,dataQuality:a.dataQuality,risk:a.risk,depth:{buyQty:a.depth?.buyQty,sellQty:a.depth?.sellQty,imbalance:a.depth?.imbalance},checks:a.checks,reasons:a.reasons};}
  async function ask(text){if(busy||!text.trim())return;busy=true;chatMessage('user','YOU',text);const wait=chatMessage('bot','PULSE COPILOT','Reading selected contract context…');el('chatSend').disabled=true;setText('chatStatus','Computing research explanation…');
    try{const engine=el('chatEngine').value;const res=await fetch('/api/copilot',{method:'POST',headers:{'Content-Type':'application/json','X-MarketPulse-Client':'marketpulse-v5'},body:JSON.stringify({question:text,engine,context:chatContext()}),cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed');wait.replaceChildren();const sp=document.createElement('span');sp.className='speaker';sp.textContent=data.engine==='cloud-ai'?'PULSE COPILOT · CLOUD AI':'PULSE COPILOT · LOCAL';wait.append(sp,document.createTextNode(data.answer));setText('chatStatus',data.engine==='cloud-ai'?'Cloud model response · verify important claims':'Local rule-grounded explanation · no AI service required');}
    catch(e){wait.replaceChildren();const sp=document.createElement('span');sp.className='speaker';sp.textContent='PULSE COPILOT · ERROR';wait.append(sp,document.createTextNode('Could not answer: '+e.message));setText('chatStatus','Request failed. Try local mode.');}
    finally{busy=false;el('chatSend').disabled=false;el('chatFeed').scrollTop=el('chatFeed').scrollHeight;}
  }
  async function copilotStatus(){try{const r=await fetch('/api/status');const d=await r.json();cloudAvailable=!!d.copilotCloudAvailable;const opt=el('chatEngine').querySelector('option[value="cloud"]');opt.disabled=!cloudAvailable;opt.textContent=cloudAvailable?'Cloud AI (uses paid API token)':'Cloud AI (not configured)';setText('botBadge',cloudAvailable?'LOCAL + OPT-IN CLOUD':'LOCAL FREE ENGINE');}catch{setText('botBadge','LOCAL MODE');}}
  const beforeRender=window.renderAnalysis;window.renderAnalysis=function(){beforeRender();chainSummary();updateReadiness();};
  const beforeChain=window.renderChain;window.renderChain=function(){beforeChain();chainSummary();};
  const beforeClear=window.clearAnalysis;window.clearAnalysis=function(){beforeClear();proClear();};
  ['riskCapital','riskPct','riskLot'].forEach(id=>el(id).addEventListener('input',updateRisk));
  el('exportReport').addEventListener('click',exportReport);
  el('chatForm').addEventListener('submit',e=>{e.preventDefault();const question=el('chatQuestion').value.trim();if(question){el('chatQuestion').value='';ask(question);}});
  document.querySelectorAll('button[data-ask]').forEach(b=>b.addEventListener('click',()=>ask(b.dataset.ask)));
  setText('proDataHint','Research terminal initialized · data validation pending');
  copilotStatus();
  // Deferred bootstrap can finish before this enhancement file has installed its hooks.
  // Render the latest application state once, then rely on the wrapped callbacks.
  queueMicrotask(()=>{chainSummary();if(analysis)updateReadiness();else updateRisk();});
})();
