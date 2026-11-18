"""Read-only smoke test of the hosted synthetic-data MarketPulse showcase.
No broker tokens, passwords or account credentials are used.
"""
import json
import os
import time
import urllib.request
from urllib.parse import urlparse

SITE=os.environ.get('PUBLIC_SITE_URL','https://marketpulse-hackathon.onrender.com').rstrip('/')
parsed=urlparse(SITE)
if parsed.scheme!='https' and not (parsed.scheme=='http' and parsed.hostname in ('localhost','127.0.0.1')):
    raise SystemExit('Public deployment checks require HTTPS.')

def get(path):
    req=urllib.request.Request(SITE+path,headers={'Cache-Control':'no-cache','User-Agent':'MarketPulse-Health-Selftest/1'})
    with urllib.request.urlopen(req,timeout=85) as response:
        return response.read().decode('utf-8')

def check():
    health=json.loads(get('/api/health'))
    status=json.loads(get('/api/status'))
    ml=json.loads(get('/api/ml/status'))
    ui=get('/')
    assert health.get('ok') is True, 'Health endpoint unhealthy'
    assert health.get('mode')=='DEMO', 'A public service must never expose live broker market data'
    assert status.get('mode')=='DEMO' and status.get('ordersEnabled') is False, 'Public demo cannot execute broker orders'
    assert ml.get('ready') is False, 'No unverified/synthetic trained-model artifact should be hosted publicly'
    assert 'PRO RESEARCH TERMINAL • V10' in ui and 'RESEARCH DESK / V10' in ui, 'Hosted UI is still using old branding'
    assert 'LOCALHOST ONLY' not in ui, 'Hosted UI shows a misleading localhost label'
    print('PASS: public V10 HTTPS site, healthy API, guarded DEMO data and ML status')

if __name__=='__main__':
    attempts=int(os.environ.get('CLOUD_CHECK_ATTEMPTS','8'))
    for i in range(1,attempts+1):
        try:
            check()
            break
        except Exception as e:
            print(f'Attempt {i}/{attempts}: {type(e).__name__}: {e}',flush=True)
            if i==attempts:
                raise SystemExit('Hosted app did not reach the verified V9 synthetic showcase state.')
            time.sleep(25)
