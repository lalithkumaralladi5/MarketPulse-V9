'use strict';
const assert=require('node:assert/strict');
const {compute}=require('../frontend/momentum-signals.js');
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
console.log('PASS: completed-candle BUY/SELL/EXIT, forming-bar lookahead/repainting guard');
