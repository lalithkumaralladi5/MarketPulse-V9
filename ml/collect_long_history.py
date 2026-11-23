"""Collect up to 15 years of real Upstox V3 DAILY equity OHLCV.

Token lives only in the server-side process environment; never saved to source.
Not expired-options history, intraday depth, or 15 years of minute candles.
"""
from __future__ import annotations
import argparse, csv, datetime as dt, os, re, time
from pathlib import Path
from urllib.parse import quote
import requests

EQ_KEY=re.compile(r'^(NSE|BSE)_EQ\|[A-Za-z0-9._ -]{3,78}$')
FIELDS=('timestamp','instrument_key','open','high','low','close','volume')

def historical_window(start:dt.date,end:dt.date,chunk_days:int=365):
    if start>end or not 1<=chunk_days<=365:raise ValueError('Invalid date span/chunk size')
    left=start
    while left<=end:
        right=min(end,left+dt.timedelta(days=chunk_days-1))
        yield left,right
        left=right+dt.timedelta(days=1)

def start_years_ago(end:dt.date,years:int)->dt.date:
    try:return end.replace(year=end.year-years)
    except ValueError:return end.replace(year=end.year-years,day=28)

def fetch_range(session,key:str,left:dt.date,right:dt.date,retry_sleep=time.sleep):
    url='https://api.upstox.com/v3/historical-candle/'+quote(key,safe='')+'/days/1/'+right.isoformat()+'/'+left.isoformat()
    for attempt in range(4):
        try:resp=session.get(url,timeout=25)
        except requests.RequestException:
            if attempt==3:raise RuntimeError('Upstox network error after retries (no credential logged)') from None
            retry_sleep(1+attempt);continue
        code=resp.status_code
        if code==429 or 500<=code<600:
            if attempt==3:raise RuntimeError(f'Upstox HTTP {code} after retries; check rate limits')
            retry_sleep(min(12,2**attempt));continue
        if code!=200:raise RuntimeError(f'Upstox history HTTP {code}; check access, dates and instrument entitlement')
        try:payload=resp.json()
        except ValueError:raise RuntimeError('Upstox returned invalid JSON') from None
        if payload.get('status')!='success':raise RuntimeError('Upstox returned unsuccessful history status')
        data=payload.get('data') or {}
        if not isinstance(data,dict):raise RuntimeError('Upstox response data was not an object')
        bars=data.get('candles') or []
        if not isinstance(bars,list):raise RuntimeError('Upstox candles were not a list')
        return bars
    raise AssertionError('Unreachable retry state')

def collect(keys,years=15,out='data/upstox_daily_long.csv',*,end=None,sleep=0.35,session=None,pause=time.sleep):
    token=os.getenv('UPSTOX_ACCESS_TOKEN','').strip()
    if not token:raise RuntimeError('UPSTOX_ACCESS_TOKEN missing. Enter a replacement token in a masked local prompt.')
    keys=list(dict.fromkeys(str(k).strip() for k in keys if str(k).strip()))
    if not keys or len(keys)>80:raise ValueError('Use 1-80 real listed NSE/BSE equity keys')
    if not all(EQ_KEY.fullmatch(k) for k in keys):raise ValueError('Only NSE_EQ|... or BSE_EQ|... listed keys are supported')
    if years not in (10,12,15):raise ValueError('Select 10, 12 or 15 years')
    # Exclude today's potentially unfinished daily candle, even if collection runs intraday.
    end=end or (dt.date.today()-dt.timedelta(days=1))
    start=start_years_ago(end,years)
    s=session or requests.Session()
    s.headers.update({'Authorization':'Bearer '+token,'Accept':'application/json'})
    rows={};stats={}
    for key in keys:
        for left,right in historical_window(start,end):
            bars=fetch_range(s,key,left,right,retry_sleep=pause)
            for b in bars:
                if not isinstance(b,list) or len(b)<6:continue
                try:
                    day=dt.date.fromisoformat(str(b[0])[:10])
                    if not start<=day<=end:continue
                    o,h,l,c,v=(float(b[i]) for i in range(1,6))
                    if min(o,h,l,c)<=0 or h<max(o,c,l) or l>min(o,c,h) or v<0:continue
                except (ValueError,TypeError,OverflowError,IndexError):continue
                rows[(key,str(b[0]))]={'timestamp':str(b[0]),'instrument_key':key,
                    'open':o,'high':h,'low':l,'close':c,'volume':v}
            if sleep:pause(sleep)
        days=sorted({r['timestamp'][:10] for r in rows.values() if r['instrument_key']==key})
        stats[key]={'rows':len(days),'from':days[0] if days else None,'to':days[-1] if days else None}
        print(f'{key.split("|")[0]}: {len(days)} ACTUAL daily candles; '+(f'{days[0]} to {days[-1]}' if days else 'NO HISTORY'))
    if not rows:raise RuntimeError('No genuine historical daily candles were returned; dataset not created')
    path=Path(out);path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader()
        w.writerows(sorted(rows.values(),key=lambda r:(r['instrument_key'],r['timestamp'])))
    print(f'COLLECTED {len(rows)} provider daily candles to {path}. Requested {years} years, actual history may be shorter.')
    return {'rows':len(rows),'requestedYears':years,'path':str(path),'instruments':stats}

if __name__=='__main__':
    p=argparse.ArgumentParser(description='Private Upstox V3 10–15y DAILY equity history')
    p.add_argument('--keys',nargs='+',required=True)
    p.add_argument('--years',type=int,choices=[10,12,15],default=15)
    p.add_argument('--out',default='data/upstox_daily_long.csv')
    a=p.parse_args()
    collect(a.keys,years=a.years,out=a.out)
