"""stdlib smoke tests. Start run-windows.bat first, then run: python tests/check_demo.py"""
import json
import os
import urllib.error
import urllib.request
from urllib.parse import urlencode
BASE='http://127.0.0.1:'+os.environ.get('MARKETPULSE_TEST_PORT','8765')
def get(p,**kw):
    u=BASE+p+('?' + urlencode(kw) if kw else '')
    with urllib.request.urlopen(u,timeout=10) as r: return json.load(r)

def run():
    s=get('/api/status'); assert s['ordersEnabled'] is False
    assert s['mode']=='DEMO','tests require an unconfigured DEMO server; unset GROWW_ACCESS_TOKEN'
    exp=get('/api/expiries',exchange='NSE',underlying='NIFTY')['expiries'][0]
    chain=get('/api/chain',exchange='NSE',underlying='NIFTY',expiry=exp)
    assert len(chain['rows'])==25 and chain['mode']=='DEMO'
    for typ in ['CE','PE']:
        a=get('/api/analysis',exchange='NSE',underlying='NIFTY',expiry=exp,strike='25500',type=typ)
        assert a['type']==typ and a['mode']=='DEMO'
        assert a['signal'] in ['BUY SETUP','EXIT / AVOID','WAIT']
        assert 0<=a['alignmentScore']<=100 and a['alignmentNotProbability']
        assert len(a['candles'])>=32 and len(a['checks'])==7
        assert a['risk']['illustrativeStop']<a['risk']['entryReference']<a['risk']['illustrativeTarget1']
        assert not a['dataQuality']['liveEntitlementTested']
        assert a['premium']>0 and a['spreadPct']>0
    try:get('/api/analysis',exchange='NSE',underlying='NIFTY',expiry=exp,strike='-1000',type='CE')
    except urllib.error.HTTPError as e:assert e.code==400
    else:raise AssertionError('bad strike should be rejected')
    try:get('/api/analysis',exchange='NSE',underlying='NIFTY',expiry=exp,strike='25500',type='BAD')
    except urllib.error.HTTPError as e:assert e.code==400
    else:raise AssertionError('invalid type should be rejected')
    with urllib.request.urlopen(BASE+'/') as r:assert b'MarketPulse V9' in r.read()
    print('PASS: V9 demo expiries, chain, CE & PE analysis, guarded signals, risk levels, validation, UI')
if __name__=='__main__':run()
