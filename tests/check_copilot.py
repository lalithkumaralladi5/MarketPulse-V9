"""Offline V5 copilot smoke test. Start demo MarketPulse on 127.0.0.1:8765 first."""
import json, time, urllib.request, urllib.error
BASE='http://127.0.0.1:8765'
def request(obj=None, headers=None,method='POST'):
    h={'Content-Type':'application/json'}
    if headers:h.update(headers)
    data=json.dumps(obj or {}).encode() if method=='POST' else None
    req=urllib.request.Request(BASE+'/api/copilot',data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(req,timeout=7) as resp:return resp.status,json.load(resp)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
def main():
    with urllib.request.urlopen(BASE+'/api/status') as r:status=json.load(r)
    assert status['mode']=='DEMO' and status['copilotCloudAvailable'] is False
    ctx={'mode':'DEMO','underlying':'NIFTY','strike':25500,'type':'CE','signal':'WAIT','alignmentScore':57,
         'depth':{'buyQty':2000,'sellQty':1900,'imbalance':2.6},'spreadPct':0.5,'oi':1000,
         'dataQuality':{'fresh':True},'checks':{'EMA9 above EMA21':False},'reasons':['Market closed']}
    c={'question':'Why is the signal WAIT?','context':ctx,'engine':'local'}
    code,response=request(c);assert code==403 and 'error' in response
    code,response=request(c,{'X-MarketPulse-Client':'marketpulse-v5','Origin':'https://evil.example'});assert code==403
    good={'X-MarketPulse-Client':'marketpulse-v5'}
    code,response=request(c,good);assert code==200 and response['engine']=='local-explainer' and 'DEMO' in response['answer'] and 'WAIT' in response['answer'],response
    time.sleep(.95)
    code,response=request({**c,'engine':'cloud'},good);assert code==400 and 'not configured' in response['error'],response
    code,response=request(method='GET',headers=good);assert code==405
    time.sleep(.95)
    code,response=request({**c,'question':'x'*600},good);assert code==400
    assert 'UPSTOX_ACCESS_TOKEN' not in json.dumps(status) and 'OPENAI_API_KEY' not in json.dumps(status)
    print('PASS: copilot local context, disabled cloud, origin/header checks, read-only interface and length validation')
if __name__=='__main__':main()
