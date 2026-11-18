"""Download historical 15m Upstox candles using secret from process environment.
Never puts token in filenames/URLs/logs or frontend. Respects per-request date chunks.
"""
import argparse, csv, datetime as dt, os, time, urllib.parse
import requests
from pathlib import Path

def collect(keys,days=100,interval=15,out='data/upstox_15m.csv',sleep=.45):
    token=os.environ.get('UPSTOX_ACCESS_TOKEN','').strip()
    if not token:raise RuntimeError('UPSTOX_ACCESS_TOKEN missing from environment. Run secure Windows collector launcher.')
    if not all(k.startswith(('NSE_EQ|','BSE_EQ|','NSE_INDEX|','BSE_INDEX|','NSE_FO|','BSE_FO|')) for k in keys):raise ValueError('Pass provider-issued instrument keys, e.g. NSE_EQ|INE002A01018')
    today=dt.date.today();start=today-dt.timedelta(days=days)
    session=requests.Session(); session.headers.update({'Authorization':'Bearer '+token,'Accept':'application/json'})
    out_rows=[]
    for key in keys:
        left=start
        while left<=today:
            right=min(left+dt.timedelta(days=14),today)
            url='https://api.upstox.com/v3/historical-candle/'+urllib.parse.quote(key,safe='')+'/minutes/'+str(interval)+'/'+str(right)+'/'+str(left)
            try:
                resp=session.get(url,timeout=20)
                resp.raise_for_status()
                bars=resp.json().get('data',{}).get('candles',[])
                for b in bars:
                    if len(b)>=6:out_rows.append({'timestamp':b[0],'instrument_key':key,'open':b[1],'high':b[2],'low':b[3],'close':b[4],'volume':b[5]})
                print(key.split('|')[0],str(left),'to',str(right),len(bars),'candles')
            except requests.HTTPError as e:
                status=e.response.status_code if e.response is not None else 'unknown'
                raise RuntimeError('Provider error HTTP '+str(status)+' for '+str(left)+' to '+str(right)+'; no token logged') from None
            left=right+dt.timedelta(days=1)
            time.sleep(sleep)
    if not out_rows:raise RuntimeError('No candles returned. Check instrument keys, dates, and API entitlements.')
    path=Path(out);path.parent.mkdir(parents=True,exist_ok=True)
    unique={(x['instrument_key'],x['timestamp']):x for x in out_rows}
    with path.open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=['timestamp','instrument_key','open','high','low','close','volume']);writer.writeheader()
        writer.writerows(sorted(unique.values(),key=lambda x:(x['instrument_key'],x['timestamp'])))
    print('Saved',len(unique),'real provider candles to',path)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--keys',nargs='+',required=True,help='Exact Upstox instrument keys');ap.add_argument('--days',type=int,default=100);ap.add_argument('--interval',type=int,choices=[1,3,5,15,30,60],default=15);ap.add_argument('--out',default='data/upstox_15m.csv')
    args=ap.parse_args()
    if not 8<=args.days<=730:ap.error('Choose 8–730 days')
    collect(args.keys,args.days,args.interval,args.out)
