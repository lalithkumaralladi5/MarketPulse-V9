"""Offline tests of the separate public global market adapter. No real provider calls or secrets."""
import json,os,subprocess,time,threading,urllib.request,urllib.error
from datetime import datetime,timezone
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler

PROVIDER_PORT=18763
APP_PORT=18764
class Provider(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if not self.path.startswith('/v8/finance/chart/AAPL?'):
            return self.respond(404,{'error':'Unknown fixture'})
        t0=int(datetime(2026,11,20,15,tzinfo=timezone.utc).timestamp())
        ts=[t0+i*300 for i in range(40)]
        p=[200.0+i*.1 for i in range(40)]
        self.respond(200,{'chart':{'result':[{
            'timestamp':ts,'meta':{'currency':'USD','regularMarketPrice':204.3},
            'indicators':{'quote':[{'open':p,'high':[x+.2 for x in p],
                'low':[x-.2 for x in p],'close':p,'volume':[1200]*40}]}
        }],'error':None}})
    def respond(self,status,obj):
        data=json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers();self.wfile.write(data)

def get(route):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{APP_PORT}'+route,timeout=10) as response:
            return response.status,json.load(response)
    except urllib.error.HTTPError as e:
        return e.code,json.load(e)

def main():
    srv=ThreadingHTTPServer(('127.0.0.1',PROVIDER_PORT),Provider)
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    env=os.environ.copy()
    env.pop('UPSTOX_ACCESS_TOKEN',None);env.pop('GROWW_ACCESS_TOKEN',None)
    env.pop('MARKETPULSE_ACCESS_PASSWORD',None)
    env.update(PORT=str(APP_PORT),MARKETPULSE_BIND='127.0.0.1',
               MARKETPULSE_GLOBAL_TEST_BASE=f'http://127.0.0.1:{PROVIDER_PORT}')
    p=subprocess.Popen(['java','-cp','backend/classes','MarketPulseServer'],env=env,
                       stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(45):
            try:
                if get('/api/health')[0]==200:break
            except Exception:time.sleep(.2)
        else:raise AssertionError('Java service did not boot')
        code,listing=get('/api/global/search?query=Apple&category=US%20STOCKS')
        assert code==200 and listing['count']==1 and listing['instruments'][0]['key']=='US_STOCK|AAPL',listing
        code,res=get('/api/global/chart?key=US_STOCK%7CAAPL&interval=5')
        assert code==200 and res['mode']=='PUBLIC_PROVIDER' and len(res['candles'])==40,res
        assert res['currency']=='USD' and res['readOnly'] is True
        assert all('open' in bar and 'time' in bar for bar in res['candles'])
        for route in ('/api/global/chart?key=US_STOCK%7C%2Fetc%2Fpasswd&interval=5',
                      '/api/global/chart?key=US_STOCK%7CAAPL&interval=3',
                      '/api/global/search?category=BAD'):
            code,_=get(route);assert code==400,(route,code)
        for asset in ('/global-market.js','/global-market.css'):
            with urllib.request.urlopen(f'http://127.0.0.1:{APP_PORT}'+asset,timeout=5) as response:
                assert response.status==200
        print('PASS: global catalogue, genuine provider-shaped OHLC, validation, read-only provenance and assets')
    finally:
        p.terminate()
        try:p.wait(timeout=5)
        except subprocess.TimeoutExpired:p.kill()
        srv.shutdown();srv.server_close()
if __name__=='__main__':main()
