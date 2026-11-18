'use strict';
/* MarketPulse multi-workspace navigation. Each view owns its own page container;
   existing component nodes are MOVED, not cloned, so event handlers and state persist. */
(() => {
  const $ = id => document.getElementById(id);
  const content = document.querySelector('.content');
  const catalog = {
    scanner:['Option Scanner','Select an expiry, strike and CE/PE contract; open the exact premium chart.','▦'],
    intelligence:['Market Intelligence','Market breadth proxies, OI landscape and an honest historical diagnostic.','◉'],
    flow:['Liquidity Flow Map','Interactive strike network with separate OI and displayed order-book measurements.','〰'],
    chart:['Pro Chart Terminal','Equity and derivatives charts with overlays, drawing tools and research data.','▥'],
    paper:['Paper Positions','Manual paper trading only. No broker order endpoints exist.','◎'],
    risk:['Risk Studio','Lot sizing and worst-case premium exposure before a decision.','◇'],
    copilot:['Pulse Copilot AI','Ask about your selected contract, risk gates and available data.','✧'],
    methodology:['Methodology & Evidence','Transparent signal rules, constraints and data interpretation.','⊞']
  };
  const page={};
  const activeFromHash=()=>{
    const key=(location.hash||'#scanner').slice(1).split('?')[0];
    return catalog[key]?key:({terminal:'scanner',intel:'intelligence',chartPanel:'chart',riskPanel:'risk',paperPanel:'paper'}[key]||'scanner');
  };
  let active='scanner';
  const move=(name,node)=>{if(node)page[name].append(node);};
  const makeHead=(name)=>{
    const header=document.createElement('header');header.className='workspace-head';
    const [title,description,glyph]=catalog[name];
    header.innerHTML=`<div><span class="workspace-kicker">${glyph} MARKETPULSE · ${name.toUpperCase()} WORKSPACE</span><h1>${title}</h1><p>${description}</p></div><div class="workspace-quick"><div><small>ACTIVE CONTRACT</small><strong id="quick-${name}">Choose an option in Scanner</strong></div><button type="button" class="secondary go-chart" data-go="chart">Open chart ↗</button><button type="button" class="secondary" data-go="scanner">Change contract</button></div>`;
    return header;
  };
  function build(){
    const original=[...content.children];
    const alert=$('alert'),footer=original.find(n=>n.tagName==='FOOTER');
    if(alert)content.prepend(alert);
    for(const name of Object.keys(catalog)){
      const wrapper=document.createElement('article');wrapper.id='view-'+name;wrapper.dataset.view=name;
      wrapper.className='workspace-page'+(name!=='scanner'?' hidden':'');
      wrapper.setAttribute('aria-label',catalog[name][0]);
      wrapper.append(makeHead(name));page[name]=wrapper;content.append(wrapper);
    }
    for(const cls of ['.titleline','.control-card','.kpi-grid','.pro-statusbar'])move('scanner',original.find(n=>n.matches?.(cls)));
    const originalChain=original.find(n=>n.classList?.contains('two-col')&&!n.classList.contains('lower'));
    move('scanner',originalChain);
    move('chart',$('chartPanel'));
    move('flow',$('flow'));
    move('intelligence',$('intel'));
    const lab=$('lab');if(lab)move('intelligence',lab);
    const risk=$('riskPanel');if(risk){risk.classList.add('workspace-risk');move('risk',risk);}
    move('paper',$('paperPanel'));
    move('copilot',$('copilot'));
    const playbook=Array.from(original).find(n=>n.classList?.contains('pro-duo')&&!n.id);
    if(playbook){for(const child of [...playbook.children])if(child.classList.contains('panel'))move('methodology',child);}
    move('methodology',$('methodology'));
    for(const node of original){
      if(node===alert||node===footer||Object.values(page).includes(node))continue;
      // Remove empty former grid wrappers after their contents have moved.
      if(node.parentElement===content)node.remove();
    }
    if(footer){footer.textContent='MARKETPULSE V8 · LOCAL READ-ONLY RESEARCH · NO BROKER ORDERS · REST SNAPSHOTS ARE NOT WEBSOCKET STREAMS';content.append(footer);}
    const top=document.querySelector('.topbar');
    const menu=document.createElement('button');menu.type='button';menu.id='mobilePages';menu.className='mobile-pages';menu.setAttribute('aria-label','Open page navigation');menu.textContent='☰ Pages';top.prepend(menu);
    menu.addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('mobile-open'));
    const backdrop=document.createElement('button');backdrop.id='pageBackdrop';backdrop.className='page-backdrop';backdrop.setAttribute('aria-label','Close page navigation');document.body.append(backdrop);
    backdrop.addEventListener('click',()=>document.querySelector('.sidebar').classList.remove('mobile-open'));
    for(const nav of document.querySelectorAll('.sidebar a.nav')){
      const dst=activeFromAnchor(nav.getAttribute('href'));
      nav.setAttribute('href','#'+dst);
      nav.addEventListener('click',e=>{e.preventDefault();show(dst);});
    }
    document.addEventListener('click',e=>{
      const button=e.target.closest?.('[data-go]');if(button){show(button.dataset.go);return;}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('.sidebar').classList.remove('mobile-open');});
    window.addEventListener('hashchange',()=>show(activeFromHash(),false));
    window.addEventListener('marketpulse-selection',syncHeader);
    for(const [name,wrapper] of Object.entries(page))if(name==='scanner'){
      const title=wrapper.querySelector('.titleline');
      if(title){
        const marketHours=title.querySelector('#sessionStatus');
        const topRight=document.querySelector('.top-right');
        if(marketHours&&topRight)topRight.prepend(marketHours); // keep state target alive on recurring updates
        title.remove(); // Workspace header replaces duplicated hero.
      }
    }
    const svg=$('flowSvg');
    const selectNode=e=>{
      const node=e.target.closest?.('[data-flow-strike]');if(!node)return;
      if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;
      if(e.type==='keydown')e.preventDefault();
      const strike=Number(node.dataset.flowStrike),type=node.dataset.flowType;
      if(typeof selectContract==='function'&&Number.isFinite(strike)&&(type==='CE'||type==='PE'))void selectContract(strike,type,true);
    };
    svg?.addEventListener('click',selectNode);
    svg?.addEventListener('keydown',selectNode);
    const filterButtons=document.querySelectorAll('[data-flow-filter]');
    filterButtons.forEach(b=>b.addEventListener('click',()=>{
      window.marketpulseFlowFilter=b.dataset.flowFilter;
      filterButtons.forEach(x=>x.classList.toggle('active',x===b));
      if(typeof renderFlow==='function')renderFlow();
    }));
    $('flowSearch')?.addEventListener('input',()=>{if(typeof renderFlow==='function')renderFlow();});
    $('flowReset')?.addEventListener('click',()=>{
      window.marketpulseFlowFilter='all';$('flowSearch').value='';
      filterButtons.forEach(x=>x.classList.toggle('active',x.dataset.flowFilter==='all'));
      if(typeof renderFlow==='function')renderFlow();
    });
    $('flowRefresh')?.addEventListener('click',async()=>{
      if(typeof loadChain==='function')await loadChain(false);
    });
    show(activeFromHash(),false);
    setInterval(syncHeader,1500);
  }
  function activeFromAnchor(raw){
    return ({'#terminal':'scanner','#intel':'intelligence','#chartPanel':'chart','#paperPanel':'paper','#riskPanel':'risk'}[raw])||(raw||'#scanner').slice(1);
  }
  function syncHeader(){
    const contract=(typeof selected!=='undefined'&&selected)?`${selected.underlying} ${Number(selected.strike).toLocaleString('en-IN')} ${selected.type} · ${selected.expiry}`:'Choose an option in Scanner';
    for(const name of Object.keys(catalog)){
      const target=$('quick-'+name);if(target)target.textContent=contract;
      const chartButton=page[name].querySelector('.go-chart');if(chartButton)chartButton.disabled=!(typeof selected!=='undefined'&&selected);
    }
  }
  function show(name,updateHash=true){
    if(!page[name])name='scanner';active=name;
    for(const [key,root] of Object.entries(page))root.classList.toggle('hidden',key!==name);
    for(const nav of document.querySelectorAll('.sidebar a.nav')){
      const chosen=nav.getAttribute('href')==='#'+name;nav.classList.toggle('active',chosen);
      if(chosen)nav.setAttribute('aria-current','page');else nav.removeAttribute('aria-current');
    }
    document.querySelector('.sidebar')?.classList.remove('mobile-open');
    const crumb=document.querySelector('.crumb');if(crumb)crumb.textContent='Trading terminal   ›   '+catalog[name][0];
    document.title='MarketPulse · '+catalog[name][0];
    if(updateHash&&location.hash!=='#'+name)history.pushState(null,'','#'+name);
    if(name==='chart')requestAnimationFrame(()=>{window.MarketPulseChart?.draw();});
    if(name==='flow')requestAnimationFrame(()=>{if(typeof renderFlow==='function')renderFlow();});
    if(name==='intelligence'&&window.MarketPulsePro?.refresh)window.MarketPulsePro.refresh();
    syncHeader();window.scrollTo({top:0,behavior:'instant'});
  }
  window.MarketPulsePages={show,active:()=>active};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build);else build();
})();
