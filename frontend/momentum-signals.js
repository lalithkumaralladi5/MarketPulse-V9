'use strict';
/* Historical, non-repainting research annotations: finalized candles only.
   The last provider candle is excluded because it may still be forming.
   BUY/SELL are momentum classifications; EXIT marks invalidation, not a broker order. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.MarketPulseSignals=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 function compute(candles){
  if(!Array.isArray(candles)||candles.length<42)return {markers:[],latest:null,closedCount:0};
  const closed=candles.slice(0,-1);let e9=0,e21=0,gain=0,loss=0,pv=0,vsum=0,day='',state='FLAT',qualUp=false,qualDown=false,miss=0;
  const markers=[];
  for(let i=0;i<closed.length;i++){
   const b=closed[i],c=Number(b.close),p=i?Number(closed[i-1].close):c;
   const o=Number(b.open),hi=Number(b.high),lo=Number(b.low),vol=Math.max(0,Number(b.volume)||0);
   if(!Number.isFinite(c)||c<=0||!Number.isFinite(o)||!Number.isFinite(hi)||!Number.isFinite(lo))continue;
   e9=i?e9*.8+c*.2:c;e21=i?e21*(20/22)+c*(2/22):c;
   if(i){const d=c-p,up=Math.max(d,0),dn=Math.max(-d,0);gain=i<=14?gain+up/14:(gain*13+up)/14;loss=i<=14?loss+dn/14:(loss*13+dn)/14;}
   const rsi=i>=14?(loss===0?(gain===0?50:100):100-100/(1+gain/loss)):50;
   const currentDay=String(b.time||'').slice(0,10);if(currentDay!==day){day=currentDay;pv=0;vsum=0;}
   pv+=vol*(hi+lo+c)/3;vsum+=vol;const vwap=vsum>0?pv/vsum:c;
   if(i<35)continue;
   const up=c>e9&&e9>e21&&c>vwap&&rsi>=53&&rsi<=75;
   const down=c<e9&&e9<e21&&c<vwap&&rsi>=25&&rsi<=47;
   let type=null;
   if(state==='FLAT'){
    if(up&&qualUp){state='UP';type='BUY';miss=0;}
    else if(down&&qualDown){state='DOWN';type='SELL';miss=0;}
   }else if(state==='UP'){
    miss=up?0:miss+1;
    if(c<e21||rsi<45||miss>=2){state='FLAT';type='EXIT';miss=0;}
   }else if(state==='DOWN'){
    miss=down?0:miss+1;
    if(c>e21||rsi>55||miss>=2){state='FLAT';type='EXIT';miss=0;}
   }
   if(type)markers.push({index:i,time:String(b.time),type,price:c,rsi:Number(rsi.toFixed(1)),basis:'EMA9/21 · VWAP · RSI14'});
   qualUp=up;qualDown=down;
  }
  return {markers,latest:markers.at(-1)||null,closedCount:closed.length,regime:state};
 }
 return {compute};
});
