'use strict';
const $=id=>document.getElementById(id);
let chain=null, analysis=null, selected=null, loading=false, position=null, refreshHandle=null, selectedLoadId=0, activeProvider='Synthetic demo';
const money=n=>Number.isFinite(Number(n))?'₹'+Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const num=(n,dec=0)=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-IN',{maximumFractionDigits:dec,minimumFractionDigits:dec}):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const set=(id,value)=>$(id).textContent=value;
function warn(message){$('alert').textContent=message;$('alert').classList.toggle('hidden',!message)}
async function api(path){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);try{const r=await fetch(path,{signal:controller.signal,cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP '+r.status);return j;}finally{clearTimeout(timeout);}}
function getExpiry(){return $('expiryManual').value||$('expiry').value;}
function query(params){return '?'+new URLSearchParams(params).toString();}
function savePosition(){try{localStorage.setItem('marketpulse_v3_paper',JSON.stringify(position));}catch{}}
try{position=JSON.parse(localStorage.getItem('marketpulse_v3_paper')||'null');}catch{position=null;}
async function startup(){updateClock();setInterval(updateClock,15000);$('exchange').addEventListener('change',()=>{if($('exchange').value==='BSE')$('underlying').value='SENSEX';refreshExpiry();});$('underlying').addEventListener('change',()=>{$('exchange').value=$('underlying').value==='SENSEX'?'BSE':'NSE';refreshExpiry();});$('loadChain').addEventListener('click',loadChain);$('analyzeStrike').addEventListener('click',()=>{if(!chain){warn('Load the chain first.');return;}let strike=Number($('strikeSearch').value);if(!chain.rows.some(r=>Math.abs(Number(r.strike)-strike)<.01)){warn('Strike is not in the loaded option chain. Choose a listed strike.');return;}warn('');selectContract(strike,$('directType').value,true);});$('expiry').addEventListener('change',()=>{$('expiryManual').value='';loadChain();});$('paperBuy').addEventListener('click',paperBuy);$('paperExit').addEventListener('click',paperExit);await refreshStatus();await refreshExpiry();refreshHandle=setInterval(async()=>{await refreshStatus();if(selected){await loadAnalysis(true);if(window.MarketPulseChart)await window.MarketPulseChart.refresh(true);}},12000);setInterval(async()=>{if(chain){try{await loadChain(true);}catch{}}},35000);}
function updateClock(){set('clock',new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())+' IST');}
function showFeedState(label,kind){const conn=$('connection');conn.className='status '+kind;conn.textContent='● '+label;}
function isUpstox(){return activeProvider==='Upstox';}
async function refreshStatus(){try{const data=await api('/api/status');activeProvider=data.provider||'Synthetic demo';if(isUpstox()){
 $('exchange').value='NSE';$('underlying').value='NIFTY';
 for(const o of $('exchange').options)o.disabled=o.value!=='NSE';
 for(const o of $('underlying').options)o.disabled=o.value!=='NIFTY';
 if(analysis){const q=analysis.dataQuality||{};showFeedState(q.fresh&&q.snapshotFresh?'UPSTOX REST · SNAPSHOTS':'UPSTOX · STALE / WAIT',q.fresh&&q.snapshotFresh?'live':'warning');}
 else showFeedState(chain?'UPSTOX · CHAIN LOADED':'UPSTOX TOKEN SET · VERIFY',chain?'live':'warning');
 }else if(data.mode==='LIVE')showFeedState('GROWW API CONFIGURED','warning');else showFeedState('DEMO · SYNTHETIC','demo');
 set('sessionStatus',data.normalSession?'WITHIN REGULAR MARKET HOURS*':'OUTSIDE REGULAR MARKET HOURS');
 if(!analysis)set('dataMode',isUpstox()?'UPSTOX · AWAITING QUOTE':data.mode==='LIVE'?'BROKER DATA':'DEMO');
 }catch(e){showFeedState('SERVER OFFLINE','error');analysis=null;clearAnalysis();warn('Cannot reach the Java backend: '+e.message);}}
async function refreshExpiry(){warn('');try{const q={exchange:$('exchange').value,underlying:$('underlying').value};const j=await api('/api/expiries'+query(q));const sel=$('expiry');sel.innerHTML='';for(const date of j.expiries||[]){const option=document.createElement('option');option.value=date;option.textContent=date;sel.append(option);}if(!sel.options.length){const o=document.createElement('option');o.value='';o.textContent='Enter date manually →';sel.append(o);}if(sel.options.length&&sel.value)await loadChain();else warn('No future expiries returned. Enter a valid listed expiry in the manual date field.');}catch(e){warn('Expiry lookup: '+e.message+' You can enter an expiry manually.');$('expiry').innerHTML='<option value="">Enter date manually →</option>';}}
async function loadChain(silent=false){if(loading)return;const exp=getExpiry();if(!exp){if(!silent)warn('Choose an expiry or manually enter a valid expiry date.');return;}loading=true;if(!silent)warn('');$('loadChain').disabled=true;try{const q={exchange:$('exchange').value,underlying:$('underlying').value,expiry:exp};const j=await api('/api/chain'+query(q));const same=selected&&selected.expiry===exp&&selected.underlying===q.underlying&&selected.exchange===q.exchange;chain=j;if(isUpstox())showFeedState('UPSTOX · CHAIN LOADED','live');set('spot',money(j.underlyingLtp));set('spotDesc',j.underlying+' · '+j.exchange+' · '+j.mode);set('chainNote',j.warning||'');if(!same)selected=null;renderChain();if(selected){await loadAnalysis(true);}else{const atm=(j.rows||[]).reduce((p,c)=>Math.abs(c.strike-j.underlyingLtp)<Math.abs(p.strike-j.underlyingLtp)?c:p,j.rows?.[0]);if(atm)await selectContract(atm.strike,'CE');}}catch(e){if(!silent)warn('Option chain could not load: '+e.message);else warn('Live update failed: '+e.message);chain=null;analysis=null;clearAnalysis();set('spot','—');showFeedState('FEED ERROR · NO QUOTES','error');renderChain();if(window.MarketPulseChart)window.MarketPulseChart.clear("Option chain unavailable");}finally{loading=false;$('loadChain').disabled=false;}}
function renderChain(){const root=$('chainRows');if(!chain||!chain.rows?.length){root.innerHTML='<div class="empty">No contracts. Verify expiry and provider access.</div>';return;}let rows=[...chain.rows],spot=chain.underlyingLtp;rows=rows.sort((a,b)=>Math.abs(a.strike-spot)-Math.abs(b.strike-spot)).slice(0,25).sort((a,b)=>a.strike-b.strike);root.innerHTML=rows.map(r=>{const ce=r.CE||{},pe=r.PE||{},atm=Math.abs(r.strike-spot)<(chain.underlying==='NIFTY'?26:52),csel=selected?.strike===r.strike&&selected?.type==='CE',psel=selected?.strike===r.strike&&selected?.type==='PE';return `<div class="chain-item ${atm?'atm':''}"><button class="contract ${csel?'chosen':''}" data-strike="${r.strike}" data-type="CE" aria-label="Analyze call option ${r.strike}">${money(ce.ltp)}</button><span class="oi">${num(ce.oi)}</span><span class="strike">${num(r.strike)}</span><span class="oi">${num(pe.oi)}</span><button class="contract pe ${psel?'chosen':''}" data-strike="${r.strike}" data-type="PE" aria-label="Analyze put option ${r.strike}">${money(pe.ltp)}</button></div>`;}).join('');root.querySelectorAll('button[data-strike]').forEach(b=>b.addEventListener('click',()=>selectContract(Number(b.dataset.strike),b.dataset.type,true)));}
async function selectContract(strike,type,openChart=false){if(!chain)return;selected={strike,type,expiry:chain.expiry,underlying:chain.underlying,exchange:chain.exchange};$('strikeSearch').value=strike;$('directType').value=type;renderChain();if(window.MarketPulseChart)window.MarketPulseChart.select({...selected},openChart);if(openChart)window.MarketPulseTerminal?.selectOption({...selected},chain);await loadAnalysis(false);}
async function loadAnalysis(silent=false){if(!selected)return;const id=++selectedLoadId;const s={...selected};try{const data=await api('/api/analysis'+query(s));if(id!==selectedLoadId)return;analysis=data;if(isUpstox()){const q=data.dataQuality||{};showFeedState(q.fresh&&q.snapshotFresh?'UPSTOX REST · SNAPSHOTS':'UPSTOX · STALE / WAIT',q.fresh&&q.snapshotFresh?'live':'warning');}warn('');window.MarketPulseTerminal?.syncOptionAnalysis(data);renderAnalysis();}catch(e){if(id!==selectedLoadId)return;analysis=null;clearAnalysis();window.MarketPulseTerminal?.invalidateOption(e.message);showFeedState('QUOTE / HISTORY ERROR','error');set('signalBadge','DATA UNAVAILABLE');$('signalBadge').className='signal-badge neutral';warn('Analysis unavailable: '+e.message+'. No signals will be produced until valid data arrives.');renderPaper();}}
function clearAnalysis(){
 for(const k of ['premium','imbalance','alignment','entry','stop','target1','target2'])set(k,'—');
 set('contractName','Data unavailable');set('depthLabel','No current market-depth snapshot');
 $('checks').innerHTML='<div class="empty">Data unavailable. No active signal.</div>';
 $('indicators').innerHTML='<div class="empty">No current indicators.</div>';
 $('depthRows').innerHTML='<div class="empty">Depth unavailable</div>';
 $('flowSvg').innerHTML='';$('scoreFill').style.width='0%';
 if(typeof renderFlow==='function')renderFlow();
 set('riskNote','Signal suspended until valid provider data resumes.');
 set('signalBadge','NO VALID SIGNAL');$('signalBadge').className='signal-badge neutral';
 renderPaper();
}
function renderAnalysis(){if(!analysis)return;const a=analysis,d=a.depth||{},ind=a.indicators||{};set('premium',money(a.premium));set('contractName',`${a.underlying} ${num(a.strike)} ${a.type} · ${a.mode}`);set('selContract',`${a.exchange} • ${a.underlying} ${num(a.strike)} ${a.type} • ${a.expiry}`);set('imbalance',(d.imbalance>=0?'+':'')+num(d.imbalance,1)+'%');set('depthLabel',`${num(d.buyQty)} bid qty / ${num(d.sellQty)} ask qty`);set('alignment',num(a.alignmentScore)+' / 100');set('dataMode',a.mode==='LIVE'?(a.provider==='Upstox'?'UPSTOX REST DATA':'BROKER DATA'):'SYNTHETIC DATA');set('signalBadge',a.signal);$('signalBadge').className='signal-badge '+(a.signal==='BUY SETUP'?'buy':a.signal==='EXIT / AVOID'?'exit':'neutral');$('scoreFill').style.width=a.alignmentScore+'%';const r=a.risk||{};const verified=a.mode!=='LIVE'||(a.dataQuality?.fresh && (a.provider!=='Upstox'||a.dataQuality?.snapshotFresh));
 set('entry',verified?money(r.entryReference):'—');set('stop',verified?money(r.illustrativeStop):'—');
 set('target1',verified?money(r.illustrativeTarget1):'—');set('target2',verified?money(r.illustrativeTarget2):'—');$('checks').innerHTML=Object.entries(a.checks||{}).map(([k,v])=>`<div class="check"><span>${esc(k)}</span><span class="${v?'pass':'fail'}">${v?'✓ PASS':'× FAIL'}</span></div>`).join('');const stale=a.dataQuality&&(!a.dataQuality.fresh||(a.provider==='Upstox'&&!a.dataQuality.snapshotFresh));set('riskNote',`${a.mode} · ${stale?'STALE DATA: ':''}${a.warning} Proposed levels are reference examples, not executable prices.`);$('reasons').innerHTML=(a.reasons||[]).map(x=>`<p>• ${esc(x)}</p>`).join('');const indicators=[['EMA 9',ind.ema9],['EMA 21',ind.ema21],['RSI 14',ind.rsi14],['Session VWAP',ind.vwap],['ATR 14',ind.atr14],['Rel. volume',num(ind.relativeVolume,2)+'×'],['Open interest',num(a.oi)],['OI change',num(a.oiChangePct,2)+'%'],['Bid/ask spread',num(a.spreadPct,2)+'%'],['Implied vol.',num(a.iv,2)+'%'],['Delta',num(a.delta,3)],['Theta',num(a.theta,2)]];$('indicators').innerHTML=indicators.map(([k,v])=>`<div class="indicator"><small>${esc(k)}</small><b>${typeof v==='string'?esc(v):num(v,2)}</b></div>`).join('');renderDepth();renderFlow();if(window.MarketPulseChart)window.MarketPulseChart.draw();else legacyDrawChart();renderPaper();}
function renderDepth(){if(!analysis)return;const dep=analysis.depth||{},b=dep.buy||[],s=dep.sell||[];let str='';for(let i=0;i<5;i++){str+=`<div class="depth-row"><span class="bid">${num(b[i]?.quantity)}</span><span>${money(b[i]?.price)}</span><span>${money(s[i]?.price)}</span><span class="ask">${num(s[i]?.quantity)}</span></div>`;}$('depthRows').innerHTML=str;const pct=dep.buyQty+dep.sellQty>0?100*dep.buyQty/(dep.buyQty+dep.sellQty):50;$('bidFill').style.width=pct+'%';set('bidPct','Bids '+num(pct,0)+'%');set('askPct','Asks '+num(100-pct,0)+'%');}
function renderFlow(){
 const svg=$('flowSvg');if(!svg)return;
 const valid=!!(chain?.rows?.length&&analysis),a=analysis;
 const source=chain?.mode==='LIVE'?'UPSTOX OI SNAPSHOT':chain?.mode==='DEMO'?'SYNTHETIC · DEMO':'NO DATA';
 set('flowSource',source);
 if(!valid){for(const id of ['flowCallOI','flowPutOI','flowNet'])set(id,'—');set('flowStatus','NO VERIFIED DEPTH');
  svg.innerHTML='<rect width="1420" height="810" fill="#0a1923"/><text x="710" y="380" text-anchor="middle" font-size="27" font-weight="800" fill="#b3d3dd">Select a CE / PE contract in Option Scanner</text><text x="710" y="422" text-anchor="middle" font-size="16" fill="#7796a8">No flow routes or resting liquidity are inferred without actual chain/quote data.</text>';return;}
 const rows=chain.rows.filter(r=>Number.isFinite(+r.strike)&&+r.strike>0).map(r=>({strike:+r.strike,CE:r.CE||{},PE:r.PE||{}}));
 const ceOI=rows.reduce((x,r)=>x+Math.max(0,Number(r.CE.oi)||0),0),peOI=rows.reduce((x,r)=>x+Math.max(0,Number(r.PE.oi)||0),0);
 set('flowCallOI',num(ceOI));set('flowPutOI',num(peOI));
 const imbalance=Number(a.depth?.imbalance)||0;
 set('flowNet',(imbalance>0?'+':'')+num(imbalance,1)+'%');
 const age=a?.dataQuality?.quoteAgeSeconds;
 const quality=a.mode==='LIVE'?a.dataQuality?.snapshotFresh?'RECENT QUOTE':'STALE / CLOSED':'DEMO DATA';
 set('flowStatus',source+' · '+quality);
 const options=[];for(const r of rows){for(const t of ['CE','PE'])if(Number.isFinite(+r[t].oi))options.push({type:t,strike:r.strike,oi:Math.max(0,+r[t].oi||0),ltp:+r[t].ltp||0});}
 const filter=window.marketpulseFlowFilter||'all',raw=($('flowSearch')?.value||'').trim();
 let near=options.filter(o=>filter==='all'||o.type===filter).filter(o=>!raw||String(o.strike).includes(raw));
 near=near.sort((x,y)=>Math.abs(x.strike-chain.underlyingLtp)-Math.abs(y.strike-chain.underlyingLtp));
 const ce=near.filter(o=>o.type==='CE').slice(0,12),pe=near.filter(o=>o.type==='PE').slice(0,12);
 let render=[];
 render.push(`<defs><linearGradient id="flowBg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#0b2c29"/><stop offset=".5" stop-color="#081924"/><stop offset="1" stop-color="#080e19"/></linearGradient><linearGradient id="flowCE" x1="0" x2="1"><stop stop-color="#34b782" stop-opacity=".06"/><stop offset="1" stop-color="#51f7af" stop-opacity=".77"/></linearGradient><linearGradient id="flowPE" x1="0" x2="1"><stop stop-color="#ef6b92" stop-opacity=".04"/><stop offset="1" stop-color="#fe789c" stop-opacity=".77"/></linearGradient><filter id="flow-glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
 render.push('<rect width="1420" height="810" fill="url(#flowBg)"/><g stroke="#22413e" stroke-width=".6" opacity=".33">');
 for(let x=0;x<1420;x+=45)render.push(`<path d="M ${x} 0 V 810"/>`);
 for(let y=0;y<810;y+=45)render.push(`<path d="M 0 ${y} H 1420"/>`);
 render.push('</g>');
 const label=(x,y,s,size=13,color='#a5c5cd',weight=700)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" font-family="ui-sans-serif,system-ui">${esc(s)}</text>`;
 render.push(label(42,37,'CONTRACT LANDSCAPE',17,'#d4eff2',850));render.push(label(42,58,'NIFTY CE / PE OPEN INTEREST • STATIC SNAPSHOTS',11,'#7298a0'));
 render.push(label(600,37,'CENTRAL DEPTH SPINE',15,'#d9f3f6',850));
 render.push(label(930,37,'CLICK A CONTRACT TO OPEN ITS CHART',13,'#a6c7d4',780));
 render.push('<path d="M 40 406 H 1380" stroke="#567380" opacity=".5" stroke-dasharray="4 7"/>');
 render.push(label(46,101,'CALL INTEREST · CE',13,'#5feeb0',900));render.push(label(46,445,'PUT INTEREST · PE',13,'#ff91aa',900));
 render.push('<rect x="635" y="75" width="156" height="671" rx="15" fill="#102532" stroke="#34626a" stroke-width="2"/><rect x="658" y="99" width="110" height="292" rx="9" fill="#103b30" stroke="#387f63"/><rect x="658" y="424" width="110" height="293" rx="9" fill="#39232d" stroke="#915066"/>');
 render.push(label(677,120,'CE / BID',11,'#85f7c2',830));render.push(label(677,447,'PE / ASK',11,'#ffb3c4',830));
 render.push('<text x="713" y="404" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="19" font-weight="900" fill="#f5f9fc">OI</text>');
 const peak=Math.max(1,...options.map(o=>o.oi));
 const nodeY=(type,i)=>type==='CE'?113+49*(i%6):440+49*(i%6);
 const group=(type,list)=>{
  const col=type==='CE'?'#55eeb1':'#ff7c9e',gradient=type==='CE'?'url(#flowCE)':'url(#flowPE)',cy=type==='CE'?210:563;
  // Left side horizontal volume profile and smooth curves; never labelled as transaction flow.
  for(let i=0;i<26;i++){
    const item=list.length?list[i%list.length]:null;
    const width=item?Math.max(28,item.oi/peak*475):0;
    const y=type==='CE'?126+i*9.4:460+i*9.25;
    if(item){
     render.push(`<rect x="${(530-width).toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="3.4" rx="2" fill="${col}" opacity="${(.16+(i%7)*.06).toFixed(2)}"/>`);
     render.push(`<path class="flow-path" d="M ${(530-width).toFixed(1)} ${y.toFixed(1)} C 580 ${(y+((i%5)-2)*9).toFixed(1)} 610 ${cy} 655 ${(cy+((i%8)-4)*8).toFixed(1)}" stroke="${gradient}" stroke-width="${(1+(i%5)*.3).toFixed(1)}" fill="none" opacity=".65"/>`);
    }
  }
  const total=Math.max(1,list.reduce((s,x)=>s+x.oi,0));
  for(let i=0;i<33;i++){
    const y=type==='CE'?132+i*7.2:461+i*7.2;
    const weight=list.length?list[i%list.length].oi/total:0;
    const width=18+weight*600;
    render.push(`<rect x="${(714-width/2).toFixed(2)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="3.3" fill="${col}" opacity=".70" rx="1.5"/>`);
  }
  list.forEach((o,i)=>{
    const colIdx=i>=6?1:0,ix=i%6,y=nodeY(type,ix),x=colIdx?1159:920;
    // The central-to-card routing is a UI grouping convention, not a liquidity transfer.
    const py=cy+((i%9)-4)*8;
    render.push(`<path class="flow-path" d="M 769 ${py} C 838 ${py} ${x-95} ${y+21} ${x-9} ${y+21}" stroke="${gradient}" stroke-width="${(1.2+Math.min(3,o.oi/peak*3)).toFixed(1)}" fill="none" opacity=".64"/>`);
  });
  list.forEach((o,i)=>{
    const colIdx=i>=6?1:0,ix=i%6,y=nodeY(type,ix),x=colIdx?1159:920;
    const selected=+a.strike===o.strike&&a.type===type;
    const bar=Math.max(4,Math.min(222,210*o.oi/peak));
    render.push(`<g class="flow-card" role="button" tabindex="0" data-flow-strike="${o.strike}" data-flow-type="${type}" aria-label="Open ${num(o.strike)} ${type} chart, open interest ${num(o.oi)}"><rect x="${x}" y="${y}" width="226" height="43" rx="6" fill="${selected?'#205647':type==='CE'?'#142f2b':'#30222d'}" stroke="${selected?'#f2f7d7':type==='CE'?'#3ba77a':'#b85d79'}" stroke-width="${selected?2.3:1.1}"/><text x="${x+9}" y="${y+15}" fill="#eefaff" font-size="13" font-weight="800">${num(o.strike)} ${type}</text><text x="${x+216}" y="${y+15}" text-anchor="end" fill="${col}" font-size="12" font-weight="800">₹${num(o.ltp,2)}</text><rect x="${x+9}" y="${y+23}" width="${bar.toFixed(1)}" height="4" rx="2" fill="${col}" opacity=".72"/><text x="${x+9}" y="${y+38}" fill="#96afbc" font-size="9">OI ${num(o.oi)}${selected?'  · SELECTED':''}</text></g>`);
  });
 };
 group('CE',ce);group('PE',pe);
 render.push(label(42,766,'OI bars and paths are a visual index of outstanding contracts—not executed trades or money movement.',11,'#9ab5bf'));
 render.push(label(42,790,'UPSTOX: snapshot-based · bids/asks describe resting orders · no tick-level institutional flow inference.',11,'#698f9c'));
 if(!ce.length&&!pe.length)render.push('<text x="1055" y="391" font-size="20" fill="#a5b9c4" text-anchor="middle">No matching listed strikes</text>');
 svg.innerHTML=render.join('');
 $('flowSelection').textContent=`${a.underlying} ${num(a.strike)} ${a.type} • premium ${money(a.premium)} • bid ${num(a.depth?.buyQty)} / ask ${num(a.depth?.sellQty)} • ${source} • ${quality}. Select a strike node to open its chart.`;
}
function legacyDrawChart(){const canvas=$('candles'),bars=analysis?.candles||[],rect=canvas.parentElement.getBoundingClientRect(),w=Math.max(320,Math.floor(rect.width-18)),h=285;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.height=h+'px';const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);if(!bars.length){c.fillStyle='#91a8b5';c.fillText('No candle history available',18,24);return;}const bs=bars.slice(-75),max=Math.max(...bs.map(b=>b.high)),min=Math.min(...bs.map(b=>b.low));const range=Math.max(.001,max-min),left=24,right=w-68,top=20,bot=h-39,space=(right-left)/bs.length,priceY=p=>top+(max+range*.05-p)/(range*1.1)*(bot-top);c.font='10px system-ui';c.strokeStyle='#273b4c';c.fillStyle='#839ba9';for(let i=0;i<6;i++){let y=top+i*(bot-top)/5;c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.fillText(money(max+range*.05-i*range*1.1/5),right+7,y+3);}bs.forEach((b,i)=>{let x=left+i*space+space/2,up=b.close>=b.open;c.strokeStyle=up?'#51d5a6':'#f07891';c.fillStyle=c.strokeStyle;c.beginPath();c.moveTo(x,priceY(b.high));c.lineTo(x,priceY(b.low));c.stroke();const yo=priceY(b.open),yc=priceY(b.close);c.fillRect(x-space*.3,Math.min(yo,yc),Math.max(2,space*.58),Math.max(1,Math.abs(yc-yo)));});
const drawEMA=(period,color)=>{const alpha=2/(period+1);let e=bs[0].close;c.beginPath();c.strokeStyle=color;c.lineWidth=1.6;bs.forEach((b,i)=>{e=i?alpha*b.close+(1-alpha)*e:e;let x=left+i*space+space/2,y=priceY(e);i?c.lineTo(x,y):c.moveTo(x,y);});c.stroke();};drawEMA(9,'#e3ba71');drawEMA(21,'#80aefa');c.fillStyle='#8099aa';c.fillText('75 most recent 5-minute candles (or fewer)',left,h-13);}
function paperBuy(){if(!analysis){warn('Select a contract with valid data first.');return;}if(analysis.mode==='LIVE'&&(!analysis.dataQuality?.fresh||(analysis.provider==='Upstox'&&!analysis.dataQuality?.snapshotFresh))){warn('Live quote is stale. Paper entry disabled.');return;}if(position){warn('Close the existing paper position first.');return;}position={id:`${analysis.mode}|${analysis.exchange}|${analysis.symbol}`,symbol:analysis.symbol,mode:analysis.mode,entry:analysis.ask>0?analysis.ask:analysis.premium,opened:new Date().toISOString()};savePosition();renderPaper();warn('Manual PAPER position opened: no real order was placed.');}
function paperExit(){if(!position)return;const mark=analysis&&`${analysis.mode}|${analysis.exchange}|${analysis.symbol}`===position.id?analysis.bid:undefined;const pnl=Number.isFinite(mark)?(mark-position.entry).toFixed(2):'unavailable for this contract';warn(`Paper position closed. Gross per-unit result: ${pnl==='unavailable for this contract'?pnl:'₹'+pnl}. No brokerage order placed.`);position=null;savePosition();renderPaper();}
function renderPaper(){if(!position){set('positionStatus','No paper position open');set('paperEntry','—');set('paperMark','—');set('paperPnl','—');set('paperContract','—');$('paperExit').disabled=true;$('paperBuy').disabled=!analysis||(analysis.mode==='LIVE'&&(!analysis.dataQuality?.fresh||(analysis.provider==='Upstox'&&!analysis.dataQuality?.snapshotFresh)));return;}set('positionStatus','LONG OPTION · MANUAL PAPER ONLY');set('paperEntry',money(position.entry));const same=analysis&&`${analysis.mode}|${analysis.exchange}|${analysis.symbol}`===position.id;set('paperMark',same&&analysis.dataQuality?.fresh?money(analysis.bid):'No fresh quote');set('paperPnl',same&&analysis.dataQuality?.fresh?money(analysis.bid-position.entry):'—');set('paperContract',position.symbol+' · '+position.mode);$('paperExit').disabled=false;$('paperBuy').disabled=true;}
startup();
