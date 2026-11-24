"""Offline integration check for the read-only Upstox SSE stream. No real credentials."""
import json, os, subprocess, threading, time, urllib.parse, urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

ROOT=os.path.dirname(os.path.dirname(__file__))
KEY='NSE_EQ|INE002A01018'
TOKEN='FAKE-TEST-TOKEN-NEVER-EXPOSE'
STATE={'calls':0,'fail':False}
IST=ZoneInfo('Asia/Kolkata')

class Provider(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def reply(self,code,value):
        raw=json.dumps(value).encode()
        self.send_response(code);self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        path=urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        if path.startswith('/v3/historical-candle/'):
            if '/intraday/' not in path:return self.reply(404,{'status':'error'})
            base=datetime.now(IST).replace(hour=9,minute=15,second=0,microsecond=0)
            if base>datetime.now(IST):base=base.replace(day=base.day-1)
            arr=[]
            from datetime import timedelta
            for i in range(70):
                t=base-timedelta(days=1)+timedelta(minutes=5*i)
                price=200+i*.3
                arr.append([t.isoformat(),price,price+1,price-1,price+.4,1000+i,0])
            return self.reply(200,{'status':'success','data':{'candles':list(reversed(arr))}})
        if path=='/v3/market-quote/quotes':
            STATE['calls']+=1
            if STATE['fail']:return self.reply(401,{'status':'error'})
            now=datetime.now(IST); stamp=str(int(now.timestamp()*1000))
            px=240+STATE['calls']*.4
            return self.reply(200,{'status':'success','data':{KEY.replace('|',':'):{
                'instrument_token':KEY,'last_price':px,'prev_close_price':235,
                'last_trade_time':stamp,'timestamp':now.isoformat(),'volume':120000+STATE['calls']*20,
                'depth':{'buy':[{'price':px-.1,'quantity':400}],
                         'sell':[{'price':px+.1,'quantity':250}]}}}})
        return self.reply(404,{'status':'error'})

def events(port,want,seconds=20):
    path='/api/live/stream?key='+urllib.parse.quote(KEY)+'&interval=5'
    with urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=seconds) as r:
        result=[];typ=None;end=time.monotonic()+seconds
        while time.monotonic()<end and len(result)<want:
            line=r.readline().decode().strip()
            if line.startswith('event: '):typ=line[7:]
            if line.startswith('data: '):result.append((typ,json.loads(line[6:])))
        return result

def run():
    fake=ThreadingHTTPServer(('127.0.0.1',17892),Provider)
    threading.Thread(target=fake.serve_forever,daemon=True).start()
    env={k:v for k,v in os.environ.items() if k not in ('UPSTOX_ACCESS_TOKEN','GROWW_ACCESS_TOKEN')}
    env.update(UPSTOX_ACCESS_TOKEN=TOKEN,UPSTOX_TEST_BASE='http://127.0.0.1:17892',PORT='18893')
    server=subprocess.Popen(['java','-cp','backend/classes','MarketPulseServer'],
       cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for i in range(45):
            try:
                with urllib.request.urlopen('http://127.0.0.1:18893/api/health',timeout=1): break
            except Exception: time.sleep(.25)
        else:raise AssertionError('Server did not start')
        feed=events(18893,5,24)
        assert [x[0] for x in feed[:2]]==['hello','snapshot'],feed
        ticks=[d for typ,d in feed if typ=='tick']
        statuses=[d for typ,d in feed if typ=='status']
        assert ticks and statuses,feed
        assert all(t['synthetic'] is False and t['price']>0 and t['exchangeTime'] for t in ticks)
        assert all(t['marketOpen']==t['fresh'] for t in ticks)
        assert all('Authorization' not in json.dumps(e) and TOKEN not in json.dumps(e) for _,e in feed)
        assert statuses[0]['fresh']==statuses[0]['marketOpen']
        STATE['fail']=True
        failure=events(18893,3,18)
        assert any(typ=='status' and d.get('error') for typ,d in failure),failure
        assert not any(typ=='tick' for typ,_ in failure[2:]),'Never synthesize live data on provider failure'
        print('PASS: exchange-time SSE quote events, freshness status, provider failure, token isolation')
    finally:
        server.terminate();fake.shutdown();fake.server_close()

if __name__=='__main__':run()
