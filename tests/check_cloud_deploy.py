"""Read-only smoke test of the hosted synthetic-data MarketPulse showcase.
No broker tokens, passwords or account credentials are used.
"""
import json
import os
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

SITE=os.environ.get('PUBLIC_SITE_URL','https://marketpulse-hackathon.onrender.com').rstrip('/')
parsed=urlparse(SITE)
if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1')):
    raise SystemExit('Public deployment checks require HTTPS.')

def get(path):
    req=urllib.request.Request(SITE+path,headers={'Cache-Control':'no-cache','User-Agent':'MarketPulse-Health-Selftest/1'})
    with urllib.request.urlopen(req,timeout=85) as response:
        return response.read().decode('utf-8')

def expect_private_auth(path):
    try:
        get(path)
    except urllib.error.HTTPError as err:
        assert err.code == 401, f'Private route {path} returned HTTP {err.code}, expected 401'
        assert 'Basic' in err.headers.get('WWW-Authenticate',''), 'Private route must require HTTP Basic authentication'
        return
    raise AssertionError(f'Private Upstox service exposed {path} without authentication')

def check():
    health=json.loads(get('/api/health'))
    assert health.get('ok') is True, 'Health endpoint unhealthy'
    if health.get('mode')=='LIVE':
        # Do not pass a real token or password to CI. Validate only that the
        # web-facing service is LOCKED and all sensitive routes return 401.
        for path in ('/','/api/status','/api/ml/status','/api/india-heatmap/page?exchange=NSE','/chart-terminal-pro.js'):
            expect_private_auth(path)
        print('PASS: privately password-protected LIVE Render service, no unauthorized market data access')
        return
    assert health.get('mode')=='DEMO', 'Unknown hosted data mode'
    status=json.loads(get('/api/status'))
    ml=json.loads(get('/api/ml/status'))
    ui=get('/')
    chart_js=get('/chart-terminal-pro.js')
    signal_js=get('/momentum-signals.js')
    assert status.get('mode')=='DEMO' and status.get('ordersEnabled') is False, 'Public demo cannot execute broker orders'
    assert ml.get('ready') is False, 'No unverified/synthetic trained-model artifact should be hosted publicly'
    assert 'PRO RESEARCH TERMINAL • V10' in ui and 'RESEARCH DESK / V10' in ui, 'Hosted UI is still using old branding'
    assert 'LOCALHOST ONLY' not in ui, 'Hosted UI shows a misleading localhost label'
    heatmap_js=get('/india-heatmap.js')
    assert 'marketpulse_india_exchange' in heatmap_js and 'ihMosaic' in heatmap_js, 'Hosted UI missing Indian stock heatmap'
    nse=json.loads(get('/api/india-heatmap/page?exchange=NSE&limit=20&sort=alpha'))
    bse=json.loads(get('/api/india-heatmap/page?exchange=BSE&limit=20&sort=alpha'))
    for market,board in [('NSE',nse),('BSE',bse)]:
        assert board['exchange']==market and board['mode']=='DEMO', market
        assert board['catalogueCount']>500 and len(board['items'])==20, 'Not a full '+market+' equity catalogue'
        assert board['quoteCount']==0 and all('changePct' not in row for row in board['items']), 'Public stock returns must not be invented'
    assert 'v11Audit' in chart_js and "['audit','Audit']" in chart_js, 'Hosted chart has not deployed the new Signal Audit tab'
    assert 'return {compute,audit}' in signal_js, 'Hosted momentum engine is an older release without event auditing'
    print('PASS: public NSE/BSE BOD catalogues, chart + audit, API, synthetic-data safety')

if __name__=='__main__':
    attempts=int(os.environ.get('CLOUD_CHECK_ATTEMPTS','8'))
    for i in range(1,attempts+1):
        try:
            check()
            break
        except Exception as e:
            print(f'Attempt {i}/{attempts}: {type(e).__name__}: {e}',flush=True)
            if i==attempts:
                raise SystemExit('Hosted app did not reach a safe DEMO or authenticated LIVE state.')
            time.sleep(25)
