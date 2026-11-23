'use strict';
const assert=require('node:assert/strict');
const {compute,audit}=require('../frontend/momentum-signals.js');
const bars=[];
let last=100;
for(let i=0;i<180;i++){
 const change=(i<70?.38:i<132?-.38:.38)+Math.sin(i*.45)*.9;
 const open=last,close=Math.max(10,last+change);
 bars.push({time:new Date(Date.UTC(2026,9,1,3,45)+i*300000).toISOString(),open,high:Math.max(open,close)+.34,low:Math.min(open,close)-.31,close,volume:10000+i*7});last=close;
}
const a=compute(bars);assert.ok(a.markers.length>1,'Expected confirmed transitions in fixture');
assert.ok(a.markers.every(x=>['BUY','SELL','EXIT'].includes(x.type)&&x.index<bars.length-1));
const changed=structuredClone(bars);changed.at(-1).close=999999;changed.at(-1).high=999999;
assert.deepEqual(compute(changed).markers,a.markers,'Forming last candle must not influence research markers');
for(let n=45;n<bars.length;n+=7){
 const previous=compute(bars.slice(0,n));
 const future=compute(bars.slice(0,n+1));
 assert.deepEqual(future.markers.filter(m=>m.index<n-1),previous.markers,'Adding a new bar must not repaint past completed-candle markers');
}
assert.equal(compute([]).markers.length,0);
// Explicit next-completed-candle-open outcome pairing, not a brokerage fill.
const fixture=[100,100,104,105,108,110].map((open,i)=>({
 time:new Date(Date.UTC(2026,9,5,3,45)+i*300000).toISOString(),
 open,high:open+1,low:open-1,close:open,volume:1000
}));
const paired={closedCount:5,markers:[
 {index:1,time:fixture[1].time,type:'BUY'},
 {index:3,time:fixture[3].time,type:'EXIT'}
]};
const event=audit(fixture,paired);
assert.equal(event.completedEvents,1);
assert.equal(event.events[0].entryPrice,104);
assert.equal(event.events[0].exitPrice,108);
assert.ok(Math.abs(event.events[0].netMovePct-((108/104-1)*100-.30))<0.001);
assert.equal(event.assumedRoundTripCostBps,30);
const noLookahead=audit(fixture,{...paired,closedCount:4});
assert.equal(noLookahead.completedEvents,0,'Cannot fill an EXIT at the unfinished candle open');
const formingChanged=structuredClone(fixture);
formingChanged.at(-1).open=987654;
assert.deepEqual(audit(formingChanged,paired),event,'Forming candle must not alter closed event outcomes');
// Real signals and event pairing are both invariant to changes in the live candle.
assert.deepEqual(audit(changed,compute(changed)),audit(bars,a));
const pending=audit(fixture,{closedCount:5,markers:[{index:1,time:fixture[1].time,type:'SELL'}]});
assert.equal(pending.openPositionNotEvaluated,true);
assert.equal(pending.completedEvents,0);
console.log('PASS: completed-candle signals + next-completed-open cost audit without repainting');
