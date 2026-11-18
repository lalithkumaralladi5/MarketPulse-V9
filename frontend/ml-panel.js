'use strict';
/* ML analysis module. Never interprets untrained model or synthetic candles as live. */
(()=>{
 const q=id=>document.getElementById(id);
 let activeKey=null,activeSymbol='',counter=0;
 const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
 async function load(path){const control=new AbortController();const timer=setTimeout(()=>control.abort(),11000);try{const r=await fetch(path,{cache:'no-store',signal:control.signal});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;}finally{clearTimeout(timer);}}
 function badge(kind,message){const e=q('mlLabel');e.dataset.status=kind;e.textContent=message;}
 function metrics(m){const area=q('mlMetrics');
  if(!m){area.innerHTML='<div class="ml-empty">No model evaluation yet. Train on historical candles and refresh.</div>';return;}
  const entries=[['Out-of-sample accuracy',pct(m.testAccuracy)],['Balanced accuracy',pct(m.testBalancedAccuracy)],['Macro F1',pct(m.testMacroF1)],['Majority baseline',pct(m.majorityClassBaseline)],['Test candles',m.testRows],['High-score signals',m.highScoreSignals]];
  area.innerHTML=entries.map(([label,n])=>`<div class="ml-metric"><span>${escape(label)}</span><strong>${escape(n)}</strong></div>`).join('');
 }
 async function status(){badge('loading','CHECKING MODEL');try{const j=await load('/api/ml/status');
   q('mlService').textContent=j.ready?'Python ML service online · Model loaded':'Model unavailable';
   q('mlInfo').textContent=j.ready?`Source: ${j.metadata.source} · Trained: ${new Date(j.metadata.trainedAt).toLocaleString('en-IN')} · ${j.metadata.intervalMinutes}m candles`:(j.reason||'Train with real historical data first.');
   metrics(j.metadata?.metrics);badge(j.ready?'ready':'offline',j.ready?'MODEL READY':'NOT TRAINED');q('mlPredictBtn').disabled=!j.ready;
  }catch(e){badge('offline','SERVICE OFFLINE');q('mlService').textContent='Python ML service not running';q('mlInfo').textContent='Start run-ml-windows.bat. '+e.message;metrics(null);q('mlPredictBtn').disabled=true;}
 }
 function clear(){q('mlSymbol').textContent=activeSymbol||'No instrument selected';q('mlCall').textContent='—';q('mlExplanation').textContent='Select an NSE/BSE stock or CE/PE contract in Markets to begin.';q('mlProb').innerHTML='';}
 async function predict(){const id=++counter;if(!activeKey){clear();return;}
   q('mlCall').textContent='CHECKING';q('mlExplanation').textContent='Requesting genuine historical candles and latest quote. Model cannot act on stale data.';
   try{
    const j=await load('/api/ml/predict?'+new URLSearchParams({key:activeKey,interval:'15'}));if(id!==counter)return;
    const model=j.model||{};q('mlCall').textContent=j.signal||'NO SIGNAL';
    q('mlCall').dataset.signal=['UP','UP_BIAS'].includes(j.signal)?'up':['DOWN','DOWN_BIAS'].includes(j.signal)?'down':'wait';
    q('mlExplanation').textContent=j.reason||model.meaning||'Model unavailable';
    const scores=model.scores||{};
    q('mlProb').innerHTML=Object.keys(scores).map(key=>`<div class="ml-barrow"><div><span>${escape(key)} score</span><b>${pct(scores[key])}</b></div><div class="ml-track"><i style="width:${Math.min(100,Math.max(0,Number(scores[key])*100))}%"></i></div></div>`).join('');
    if(model.heldoutMetrics)metrics(model.heldoutMetrics);
    q('mlCandle').textContent=model.latestCandle?'Last candle: '+new Date(model.latestCandle).toLocaleString('en-IN'):'No valid prediction';
   }catch(e){if(id!==counter)return;q('mlCall').textContent='WAIT';q('mlExplanation').textContent='ML analysis failed safely: '+e.message;q('mlProb').innerHTML='';}
 }
 function initialize(){const page=q('view-predict');if(!page)return;
   page.innerHTML=`<header class="workspace-head"><div><span class="workspace-kicker">✧ MARKETPULSE · MACHINE LEARNING</span><h1>Prediction Intelligence Lab</h1><p>Real historical training, chronological holdout, and guarded directional scores for the selected NSE/BSE instrument.</p></div><div class="workspace-quick"><div><small>SELECTED</small><strong id="mlSymbol">No instrument selected</strong></div><button type="button" class="secondary" id="mlFind">Search market ↗</button></div></header>
   <div class="ml-layout"><section class="ml-hero"><div class="ml-top"><div><span class="ml-kicker">01 / DIRECTIONAL RESEARCH ENGINE</span><h2>Model prediction</h2><p>Based on 15-minute candles · 3-bar forecast horizon · no broker orders</p></div><span id="mlLabel" data-status="offline">CHECKING</span></div><div class="ml-output"><div><small>GUARDED SIGNAL</small><strong id="mlCall">—</strong><span id="mlCandle">Select an instrument to analyze</span></div><div id="mlProb" class="ml-probs"></div></div><p class="ml-reason" id="mlExplanation">ML models require real, properly ordered historical data. Demo mode never creates a live prediction.</p><div class="ml-actions"><button class="ml-primary" id="mlPredictBtn" disabled>Analyze selected contract</button><button id="mlRefreshBtn">↻ Check model</button><button id="mlChartBtn">Open chart ↗</button></div></section>
   <section class="ml-hero"><div class="ml-top"><div><span class="ml-kicker">02 / INDEPENDENT TEST RESULTS</span><h2>Model evidence</h2><p>The test set is never used for model fitting or threshold choice.</p></div></div><div id="mlMetrics" class="ml-metrics"></div><p class="ml-caption" id="mlService">Checking local Python service…</p><p class="ml-caption" id="mlInfo"></p><div class="ml-warning">Accuracy means class labels predicted correctly on unseen historical bars, <b>not</b> actual profitable trades. Out-of-sample means chronological holdout; full walk-forward optimization, slippage, expiry handling and live paper verification are still needed.</div></section></div>
   <section class="ml-playbook"><div><b>1 · COLLECT</b><p>Download historical NSE/BSE candles with the locally stored Upstox read-only token.</p></div><div><b>2 · TRAIN</b><p>Python scikit-learn trains a classification model on lagged-only technical features.</p></div><div><b>3 · VALIDATE</b><p>Report chronological holdout metrics and a majority-class baseline.</p></div><div><b>4 · ANALYZE</b><p>Show model scores only when quote freshness passes the Java market-data gate.</p></div></section>
   <p class="ml-note">Scores are uncalibrated ML class scores, not 99% confidence. Neither this software nor Pulse Copilot can place real orders. Prices and alerts may be delayed; check timestamps.</p>`;
   q('mlPredictBtn').addEventListener('click',predict);q('mlRefreshBtn').addEventListener('click',status);
   q('mlFind').addEventListener('click',()=>window.MarketPulsePages?.show('explore'));
   q('mlChartBtn').addEventListener('click',()=>window.MarketPulsePages?.show('chart'));
   window.addEventListener('marketpulse:instrument',e=>{activeKey=e.detail.key;activeSymbol=e.detail.symbol;counter++;clear();});
   window.addEventListener('marketpulse:prediction-page',status);
   const inst=window.MarketPulseTerminal?.getInstrument?.();if(inst){activeKey=inst.key;activeSymbol=inst.symbol;clear();}
   status();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
