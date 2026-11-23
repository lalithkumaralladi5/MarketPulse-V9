"""Full NSE/BSE catalogue and quote coverage test, entirely offline. No real token."""
import gzip,json,os,subprocess,threading,time,urllib.parse,urllib.request,urllib.error,sys
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from datetime import datetime
from zoneinfo import ZoneInfo

PORT=17967
def masters():
    out={}
    for ex,n in (('NSE',233),('BSE',214)):
        rows=[]
        for i in range(n):
            symbol=chr(65+i%26)+'H'+str(i).zfill(4)
            rows.append({'segment':ex+'_EQ','name':symbol+' INDUSTRIES','exchange':ex,
                'instrument_key':ex+'_EQ|INE'+str(i).zfill(9),
                'trading_symbol':symbol,'instrument_type':'BE' if i%8==0 else 'EQ','isin':'INE'+str(i).zfill(9)})
        rows.append({'segment':ex+'_FO','instrument_key':ex+'_FO|123','trading_symbol':'CE','instrument_type':'CE'})
        out[ex]=gzip.compress(json.dumps(rows).encode())
    return out
MASTER=masters()

class Broker(BaseHTTPRequestHandler):
    batches=[]
    def log_message(self,*args):pass
    def do_GET(self):
        parsed=urllib.parse.urlparse(self.path);path=urllib.parse.unquote(parsed.path)
        q=urllib.parse.parse_qs(parsed.query)
        if path.endswith('.json.gz'):
            ex=path.rsplit('/',1)[-1].replace('.json.gz','')
            if ex not in MASTER:return self.json(404,{'error':'No fixture'})
            body=MASTER[ex]
            self.send_response(200);self.send_header('Content-Length',str(len(body)))
            self.send_header('Content-Type','application/gzip');self.end_headers();self.wfile.write(body);return
        if path=='/v3/market-quote/quotes':
            keys=q.get('instrument_key',[''])[0].split(',');self.batches.append(keys)
            assert len(keys)<=140
            ts=str(int(datetime.now(ZoneInfo('Asia/Kolkata')).timestamp()*1000))
            data={k.replace('|',':'):{'instrument_token':k,'last_price':101.5,'prev_close_price':100,
                'last_trade_time':ts,'volume':50000} for k in keys}
            return self.json(200,{'status':'success','data':data})
        return self.json(404,{'error':'Unimplemented mock route'})
    def json(self,status,value):
        b=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)

def get(port,path):
    try:
        with urllib.request.urlopen('http://127.0.0.1:'+str(port)+path,timeout=25) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)

def serve(mode,port):
    env={k:v for k,v in os.environ.items() if k not in ('GROWW_ACCESS_TOKEN','UPSTOX_ACCESS_TOKEN','UPSTOX_TEST_BASE','MARKETPULSE_BOD_TEST_BASE')}
    env.update(PORT=str(port),MARKETPULSE_BOD_TEST_BASE='http://127.0.0.1:'+str(PORT))
    if mode=='LIVE':
        env.update(UPSTOX_ACCESS_TOKEN='OFFLINE-ONLY-DO-NOT-LOG',UPSTOX_TEST_BASE='http://127.0.0.1:'+str(PORT))
    p=subprocess.Popen(['java','-Xmx192m','-cp','backend/classes','MarketPulseServer'],cwd=os.path.dirname(os.path.dirname(__file__)),
        env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for _ in range(75):
        try:
            if get(port,'/api/health')[0]==200:return p
        except Exception:time.sleep(.15)
    raise RuntimeError('Backend failed')

def check_api(port,mode):
    for ex,count in (('NSE',233),('BSE',214)):
        sets=[]
        for page in range(1,4):
            status,r=get(port,f'/api/india-heatmap/page?exchange={ex}&page={page}&limit=100&sort=mosaic')
            assert status==200,(status,r)
            assert r['catalogueCount']==count and r['matchedCount']==count
            assert r['mode']==mode
            expected=min(100,max(0,count-(page-1)*100))
            assert len(r['items'])==expected
            if mode=='LIVE':
                assert r['quoteCount']==expected and all(x['changePct']==1.5 for x in r['items'])
            else:assert r['quoteCount']==0 and all('changePct' not in x for x in r['items'])
            sets+= [x['key'] for x in r['items']]
        assert len(sets)==len(set(sets))==count,'Catalog must cover every unique key across pages'
        status,r=get(port,f'/api/india-heatmap/page?exchange={ex}&query=AH&limit=20')
        assert status==200 and r['matchedCount']>0
        assert all('AH' in x['symbol'] for x in r['items'])
        status,r=get(port,f'/api/india-heatmap/page?exchange={ex}&type=BE&limit=20')
        assert status==200 and all(x['type']=='BE' for x in r['items'])
    for bad in ('exchange=MCX','exchange=NSE&limit=500','exchange=NSE&sort=invalid'):
        status,r=get(port,'/api/india-heatmap/page?'+bad);assert status==400,(bad,r)
    assert all(len(batch)<=140 for batch in Broker.batches)

def check_browser(port):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1650,'height':960})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:'+str(port)+'/#indiaheatmap',wait_until='domcontentloaded')
        page.locator('.ih-tile').first.wait_for(timeout=30000)
        assert page.locator('.ih-tile').count()==100
        assert '233' in page.locator('#ihTotal').inner_text()
        assert '0 / 100' in page.locator('#ihQuoted').inner_text()
        page.locator('#ihPreview').check()
        assert page.locator('#ihPreviewNote').is_visible()
        page.locator('#ihNext').click()
        page.get_by_text('Page 2 / 3').wait_for(timeout=15000)
        page.locator('[data-market-exchange="BSE"]').click()
        page.locator('#ihTotal').get_by_text('214').wait_for(timeout=15000)
        page.locator('#ihSearch').fill('AH')
        page.wait_for_timeout(700)
        assert page.locator('.ih-tile').count()>0
        page.locator('#ihSearch').fill('')
        page.wait_for_timeout(700)
        page.locator('.ih-tile').first.click()
        page.locator('#v8ProChart').wait_for(timeout=15000)
        assert page.url.endswith('#chart'),page.url
        assert not errors,errors
        phone=browser.new_page(viewport={'width':430,'height':890})
        phone.goto('http://127.0.0.1:'+str(port)+'/#indiaheatmap',wait_until='domcontentloaded')
        phone.locator('.ih-tile').first.wait_for(timeout=30000)
        assert phone.locator('.ih-tile').count()==100
        browser.close()

def main():
    if '--stress' in sys.argv:
        # A 120+ MB uncompressed NSE derivative master used to exhaust the
        # hosted Java -Xmx192m heap or trip the old 110 MB whole-file guard.
        # It contains NO exchange quotes and NO credentials.
        import gc
        derivatives=[{'segment':'NSE_FO','instrument_key':'NSE_FO|'+str(i),
            'trading_symbol':'FAKE'+str(i),'name':'X'*5600} for i in range(21500)]
        originals=json.loads(gzip.decompress(MASTER['NSE']))
        MASTER['NSE']=gzip.compress(json.dumps(originals+derivatives).encode())
        del originals,derivatives
        gc.collect()
        assert len(gzip.decompress(MASTER['NSE']))>110_000_000
    broker=ThreadingHTTPServer(('127.0.0.1',PORT),Broker)
    threading.Thread(target=broker.serve_forever,daemon=True).start()
    try:
        if '--stress' in sys.argv:
            proc=serve('DEMO',18898)
            try:
                code,heat=get(18898,'/api/india-heatmap/page?exchange=NSE&limit=100&quotes=false')
                assert code==200,(code,heat)
                assert heat['catalogueCount']==233 and len(heat['items'])==100,heat
                print('PASS: 110+ MB GZIP master streamed under hosted Java heap without derivatives appearing as equities')
            finally:proc.terminate();proc.wait(timeout=6)
        elif len(sys.argv)>1 and sys.argv[1]=='--browser':
            proc=serve('DEMO',18897)
            try:check_browser(18897)
            finally:proc.terminate();proc.wait(timeout=6)
            print('PASS browser NSE/BSE heatmap, paging, previews, search, click-chart, mobile')
        else:
            for mode,port in (('DEMO',18895),('LIVE',18896)):
                proc=serve(mode,port)
                try:check_api(port,mode)
                finally:proc.terminate();proc.wait(timeout=6)
            print('PASS full NSE/BSE catalogue and honest paginated quote integration')
    finally:broker.shutdown();broker.server_close()
if __name__=='__main__':main()
