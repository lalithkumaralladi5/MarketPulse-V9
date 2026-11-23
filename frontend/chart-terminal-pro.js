'use strict';
/* MarketPulse chart-focused research workspace. Native DOM only, no broker actions. */
(()=>{
 const q=id=>document.getElementById(id),term=()=>window.MarketPulseTerminal;
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
 const fmt=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-IN',{maximumFractionDigits:2}):'—';
 let active='overview';
 function init(){const chart=q('v8ProChart'),body=chart?.querySelector('.v8-chart-body');if(!body||q('v10Sidebar'))return;
  chart.classList.add('v10-terminal');
  const parent=chart.parentElement;
  const ribbon=document.createElement('div');ribbon.className='v10-ribbon';ribbon.innerHTML=`<span class="v10-ribbon-label">MARKETPULSE <b>PRO CHART V10</b></span><button data-dest="explore">⌕ Search NSE / BSE</button><button data-dest="scanner">INDEX OPTIONS</button><button data-dest="heatmap">STOCK HEATMAP</button><span class="v10-ribbon-fill"></span><span>READ-ONLY · NO ORDER ROUTING</span>`;
  parent.insertBefore(ribbon,chart);
  const toolbar=chart.querySelector('.v8-chart-toolbar');const extras=document.createElement('div');extras.className='v10-chart-extras';extras.innerHTML=`<label title="Show historical research markers on completed candles"><input id="v10Signals" type="checkbox" checked> BUY / SELL / EXIT</label><label title="Separate Relative Strength Index pane"><input id="v10Rsi" type="checkbox" checked> RSI pane</label><span class="v10-help">Signals are historical observations, not orders</span>`;toolbar.append(extras);
  const side=document.createElement('aside');side.id='v10Sidebar';side.className='v10-sidebar';side.innerHTML=`<div class="v10-side-top"><strong>Instrument intelligence</strong><span id="v10SideMode">NO INSTRUMENT</span></div><div class="v10-side-tabs" role="tablist">${[['overview','Overview'],['audit','Audit'],['depth','Depth'],['watchlist','Watchlist'],['news','News'],['alerts','Alerts']].map(([k,t])=>`<button type="button" role="tab" data-side="${k}" aria-selected="${k==='overview'}">${t}</button>`).join('')}</div><div class="v10-side-content"><section data-pane="overview"><div class="v10-key" id="v10Summary">Select a stock or contract in Markets & Search.</div><div class="v10-research-label">CLOSED-CANDLE MOMENTUM</div><div id="v10Latest" class="v10-latest">Waiting for historical data</div><div class="v10-research-label">QUOTE SAFETY GATE</div><div class="v10-key" id="v10LiveGate">No quote available</div><div class="v10-signal-legend"><b class="buy">BUY</b><b class="sell">SELL</b><b class="exit">EXIT</b><small>Signals are based on completed price candles; they do not execute trades.</small></div></section><section data-pane="audit" hidden><div id="v11Audit">Waiting for completed candles</div></section><section data-pane="depth" hidden></section><section data-pane="watchlist" hidden><div id="v10WatchItems" class="v10-watch-items"></div></section><section data-pane="news" hidden><div id="v10NewsItems" class="v10-news-items"></div><button id="v10RefreshNews" class="v10-side-action">↻ Check headlines</button></section><section data-pane="alerts" hidden></section></div><div class="v10-side-bottom"><button data-dest="explore">⌕ Instruments</button><button data-dest="flow">〰 Liquidity map</button></div>`;
  body.append(side);
  const lower=chart.querySelector('.v8-bottom-panels');if(lower){const children=Array.from(lower.children);if(children[0])side.querySelector('[data-pane="depth"]').append(children[0]);if(children[1])side.querySelector('[data-pane="alerts"]').append(children[1]);lower.remove();}
  const note=document.createElement('div');note.className='v10-footnote';note.innerHTML='MARKERS: Completed-candle EMA9/21 + VWAP + RSI14 momentum regimes. Last potentially forming candle omitted. <b>DEMO markers are illustrative.</b> Real-time signal use requires a fresh authorized quote, market hours and independent validation. No brokerage orders.';
  chart.append(note);
  q('v10Signals').addEventListener('change',e=>term()?.setSignals(e.target.checked));
  q('v10Rsi').addEventListener('change',e=>term()?.setRsi(e.target.checked));
  chart.querySelectorAll('[data-side]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.side)));
  chart.querySelectorAll('[data-dest]').forEach(b=>b.addEventListener('click',()=>window.MarketPulsePages?.show(b.dataset.dest)));
  ribbon.querySelectorAll('[data-dest]').forEach(b=>b.addEventListener('click',()=>window.MarketPulsePages?.show(b.dataset.dest)));
  q('v8WatchToggle').addEventListener('click',()=>queueMicrotask(refresh));
  q('v10WatchItems').addEventListener('click',e=>{const b=e.target.closest('[data-watchkey]');if(!b)return;const inst=term()?.getWatchlist().find(x=>x.key===b.dataset.watchkey);if(inst)term()?.setInstrument(inst);});
  q('v10RefreshNews').addEventListener('click',async()=>{await term()?.loadNews(true);renderNews();});
  for(const event of ['marketpulse:instrument','marketpulse:candles','marketpulse:quote'])window.addEventListener(event,()=>{refresh();});
  window.addEventListener('hashchange',()=>{if(location.hash==='#chart')setTimeout(()=>{term()?.draw();refresh();},50);});
  select('overview');refresh();
 }
 function select(tab){active=tab;const root=q('v10Sidebar');if(!root)return;root.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.side===tab)));root.querySelectorAll('[data-pane]').forEach(p=>p.hidden=p.dataset.pane!==tab);if(tab==='news')term()?.loadNews(false)?.then(renderNews);refresh();}
 function renderNews(){const el=q('v10NewsItems');if(!el)return;const articles=term()?.getNews()||[];el.innerHTML=articles.length?articles.slice(0,7).map(x=>`<article class="v10-article"><b>${safe(x.headline)}</b><small>${x.publishedMs?new Date(x.publishedMs).toLocaleString('en-IN'):'Publication time unavailable'}</small>${typeof x.url==='string'&&x.url.startsWith('https://')?`<a target="_blank" rel="noopener noreferrer" href="${safe(x.url)}">Read source ↗</a>`:''}</article>`).join(''):'<div class="v10-muted">No verified instrument-specific headlines returned.</div>';}
 function renderAudit(){
  const root=q('v11Audit'),api=term();
  if(!root||!api)return;
  const candles=api.getCandles(),result=api.getSignals();
  const audit=window.MarketPulseSignals?.audit(candles,result);
  if(!audit){root.textContent='Signal audit is unavailable';return;}
  const mode=api.getQuote()?.mode==='LIVE'?'BROKER HISTORY · RESEARCH ONLY':'SYNTHETIC DEMO · ILLUSTRATIVE';
  const shown=n=>Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—';
  const pct=n=>Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
  root.innerHTML=`<div class="v11-audit-source">${safe(mode)}</div>
    <div class="v11-audit-metrics"><div><small>Closed setups</small><strong>${audit.completedEvents}</strong></div>
    <div><small>Net-positive events</small><strong>${pct(audit.netPositiveShare)}</strong></div>
    <div><small>Mean net move*</small><strong>${shown(audit.meanNetMovePct)}</strong></div></div>
    <p class="v11-audit-notice">*Hypothetical next-COMPLETED-candle open fills after BUY/SELL and EXIT signals, minus ${audit.assumedRoundTripCostBps} bps assumed round-trip costs. Not real orders, profitability, or an audited backtest. Overlapping opportunities and exchange costs are not modeled.</p>
    ${audit.openPositionNotEvaluated?'<div class="v11-audit-pending">Unclosed momentum setup excluded from outcomes.</div>':''}
    <div class="v11-audit-ledger">${audit.events.length?audit.events.slice(-8).reverse().map(x=>`<div class="v11-audit-event">
      <div><b class="${x.type==='BUY'?'v11-audit-buy':'v11-audit-sell'}">${safe(x.type)}</b>
      <strong class="${x.netMovePct>=0?'v11-audit-positive':'v11-audit-negative'}">${shown(x.netMovePct)}</strong></div>
      <small>Entry ₹${fmt(x.entryPrice)} → exit ₹${fmt(x.exitPrice)} · ${x.barsHeld} bars</small>
      <small>Observed ${safe(x.entrySignalAt)} · exit observed ${safe(x.exitSignalAt)}</small>
      </div>`).join(''):'<div class="v10-muted">No completed entry/exit pairs in available candles. This is not a prediction.</div>'}</div>`;
 }
 function refresh(){const api=term();if(!api)return;const inst=api.getInstrument(),quote=api.getQuote(),res=api.getSignals(),bars=api.getCandles();
  const mode=quote?.mode||'DEMO',fresh=mode==='LIVE'&&quote?.fresh===true;
  q('v10SideMode').textContent=mode==='DEMO'?'DEMO · SYNTHETIC':fresh?'UPSTOX · FRESH':'UPSTOX · STALE';
  q('v10Summary').innerHTML=inst?`<strong>${safe(inst.symbol)}</strong><span>${safe(inst.exchange)} · ${safe(inst.segment)}</span><span>Last quote: ${quote?.ltp>0?'₹'+fmt(quote.ltp):'Unavailable'}</span><span>Observed candles: ${bars.length}</span>`:'Select a listed NSE/BSE stock or option to begin.';
  const last=res.latest,age=last&&bars.length?res.closedCount-1-last.index:Infinity;
  q('v10Latest').innerHTML=last?`<div class="v10-call ${last.type.toLowerCase()}">${last.type}</div><strong>₹${fmt(last.price)}</strong><span>${safe(new Date(last.time).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}))}</span><small>${age===0?'Latest completed candle':age+' completed bars ago'} · EMA / VWAP / RSI</small>`:'<span class="v10-muted">No confirmed momentum transition in available history.</span>';
  q('v10LiveGate').textContent=mode==='DEMO'?'SYNTHETIC DEMO — no live entry signal':!fresh?'WAIT — stale, missing or closed-market quote':age>1?'WAIT — no new signal on the last completed candle':'FRESH QUOTE — research signal only; not a trade instruction';
  const watch=api.getWatchlist()||[];q('v10WatchItems').innerHTML=watch.length?watch.map(x=>`<button data-watchkey="${safe(x.key)}">☆ ${safe(x.symbol)}<small>${safe(x.exchange)}</small></button>`).join(''):'<div class="v10-muted">Add stocks and contracts with ☆ Watchlist to see them here.</div>';
  if(active==='news')renderNews();
  renderAudit();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
