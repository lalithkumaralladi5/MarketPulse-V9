"""Offline integration smoke test: Upstox-shaped responses, no production credentials or requests."""
import json, os, subprocess, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

IST=ZoneInfo('Asia/Kolkata')
NOW=datetime.now(IST)
EXP=(NOW.date()+timedelta(days=8)).isoformat()
STRIKE=26000
class FakeUpstox(BaseHTTPRequestHandler):
    fail=False
    stale=False
    def log_message(self,*args): pass
    def do_GET(self):
        path=unquote(urlparse(self.path).path)
        query=parse_qs(urlparse(self.path).query)
        if self.fail: self.answer(401, {'status':'error','errors':[{'message':'Auth required'}]});return
        if path == '/v2/option/contract':
            under=query.get('instrument_key',[''])[0]
            assert under in ('NSE_INDEX|Nifty 50','NSE_INDEX|Nifty Bank','NSE_INDEX|Nifty Fin Service','BSE_INDEX|SENSEX'),query
            segment='BSE_FO' if under.startswith('BSE_') else 'NSE_FO'
            data=[{'expiry':EXP,'instrument_key':f'{segment}|987','strike_price':81700 if segment=='BSE_FO' else STRIKE,'instrument_type':'CE'},
                  {'expiry':EXP,'instrument_key':f'{segment}|988','strike_price':81700 if segment=='BSE_FO' else STRIKE,'instrument_type':'PE'}]
        elif path == '/v2/option/chain':
            under=query.get('instrument_key',[''])[0]
            assert under in ('NSE_INDEX|Nifty 50','NSE_INDEX|Nifty Bank','NSE_INDEX|Nifty Fin Service','BSE_INDEX|SENSEX'),query
            assert query.get('expiry_date')==[EXP],query
            bse=under.startswith('BSE_')
            segment='BSE_FO' if bse else 'NSE_FO'
            data=[{'expiry':EXP,'strike_price':81700 if bse else STRIKE,'underlying_spot_price':82031.81 if bse else 25990,
                   'call_options':{'instrument_key':f'{segment}|987','market_data':{'ltp':529.65 if bse else 130,'oi':145000,'volume':100000},'option_greeks':{'delta':0.52,'iv':13.4,'theta':-7.9}},
                   'put_options':{'instrument_key':f'{segment}|988','market_data':{'ltp':155.10 if bse else 140,'oi':87000,'volume':50000},'option_greeks':{'delta':-0.48,'iv':14.5,'theta':-8.6}}}]
        elif path == '/v3/market-quote/quotes':
            key=query['instrument_key'][0]
            assert key in ('NSE_FO|987','NSE_FO|988','BSE_FO|987','BSE_FO|988'),key
            stamp=NOW-timedelta(days=1) if self.stale else datetime.now(IST)
            buy=[{'price':129.90-i*.05,'quantity':850+i*20,'orders':12} for i in range(5)]
            sell=[{'price':130.10+i*.05,'quantity':750+i*20,'orders':11} for i in range(5)]
            data={key.replace('|',':'):{'instrument_token':key,'last_price':130.0,'last_trade_time':str(int(stamp.timestamp()*1000)),
                         'timestamp':stamp.isoformat(),'depth':{'buy':buy,'sell':sell},'oi':145000,'previous_oi':140000,'volume':100000}}
        elif path.startswith('/v3/historical-candle/'):
            assert any(needle in path for needle in ('NSE_FO|987','NSE_FO|988','BSE_FO|987','BSE_FO|988','NSE_INDEX|Nifty 50','BSE_INDEX|SENSEX')),path
            if '/intraday/' not in path:
                data={'candles':[]}
            else:
                index='NSE_INDEX|' in path
                start=datetime.combine(NOW.date(),datetime.min.time(),tzinfo=IST).replace(hour=9,minute=15)
                candles=[]
                for i in range(65):
                    t=start+timedelta(minutes=int(path.rstrip("/").split("/")[-1])*i)
                    x=(25950+i*0.9) if index else (115+i*0.28)
                    candles.append([t.isoformat(),x,x+1.1,x-.9,x+.45,1000+i*12,0])
                data={'candles':list(reversed(candles))}
        else:
            self.answer(404,{'status':'error','message':'Not found'});return
        self.answer(200,{'status':'success','data':data})
    def answer(self,status,body):
        raw=json.dumps(body).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)


def get(port,path):
    req=urllib.request.Request(f'http://127.0.0.1:{port}{path}')
    try:
        with urllib.request.urlopen(req,timeout=15) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)

def start(mode,port):
    env={k:v for k,v in os.environ.items() if k not in ('GROWW_ACCESS_TOKEN','UPSTOX_ACCESS_TOKEN','UPSTOX_TEST_BASE')}
    env['PORT']=str(port)
    if mode=='upstox':env.update(UPSTOX_ACCESS_TOKEN='offline-fixture-only-do-not-use-live', UPSTOX_TEST_BASE='http://127.0.0.1:17868')
    proc=subprocess.Popen(['java','-cp','backend/classes','MarketPulseServer'],cwd=os.path.dirname(os.path.dirname(__file__)),env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    for i in range(40):
        try:
            code,_=get(port,'/api/status')
            if code==200:break
        except Exception:time.sleep(.12)
    return proc

def main():
    mock=ThreadingHTTPServer(('127.0.0.1',17868),FakeUpstox)
    thread=threading.Thread(target=mock.serve_forever,daemon=True);thread.start()
    try:
        for mode,port in [('demo',17877),('upstox',17878)]:
            proc=start(mode,port)
            try:
                assert proc.poll() is None,'Server failed to start'
                status,meta=get(port,'/api/status');assert status==200 and meta['provider']==('Upstox' if mode=='upstox' else 'Synthetic demo'),meta
                status,dates=get(port,'/api/expiries?exchange=NSE&underlying=NIFTY');assert status==200 and len(dates['expiries'])>0,dates
                date=EXP if mode=='upstox' else dates['expiries'][0]
                status,chain=get(port,f'/api/chain?exchange=NSE&underlying=NIFTY&expiry={date}')
                assert status==200 and chain['rows'],chain
                strike=STRIKE if mode=='upstox' else int(chain['rows'][12]['strike'])
                status,a=get(port,f'/api/analysis?exchange=NSE&underlying=NIFTY&expiry={date}&strike={strike}&type=CE')
                assert status==200 and a['signal'] in ['WAIT','BUY SETUP','EXIT / AVOID'],a
                for interval in (1,3,5,15):
                    status,chart=get(port,f'/api/chart?exchange=NSE&underlying=NIFTY&expiry={date}&strike={strike}&type=CE&interval={interval}')
                    assert status==200 and chart['intervalMinutes']==interval and chart['candles'],chart
                    assert chart['mode']==('LIVE' if mode=='upstox' else 'DEMO')
                    assert 'offline-fixture-only' not in json.dumps(chart)
                    assert len(chart['candles'])>=10,chart
                status,invalid=get(port,f'/api/chart?exchange=NSE&underlying=NIFTY&expiry={date}&strike={strike}&type=CE&interval=99')
                assert status==400,invalid
                if mode=='upstox':
                    assert a['provider']=='Upstox' and a['quoteAsOf'] and a['symbol']=='NSE_FO|987',a
                    assert len(a['candles'])>=32 and len(a['depth']['buy'])==5,a
                    assert a['dataQuality']['snapshotFresh'] and a['dataQuality']['fresh'],a
                    assert 'offline-fixture-only' not in json.dumps(a)
                    # Test real Upstox-shaped BSE SENSEX keys and unchanged broker premiums.
                    status,e=get(port,'/api/expiries?exchange=BSE&underlying=SENSEX')
                    assert status==200 and EXP in e['expiries'],e
                    status,bse=get(port,f'/api/chain?exchange=BSE&underlying=SENSEX&expiry={EXP}')
                    assert status==200 and bse['mode']=='LIVE' and bse['underlyingLtp']==82031.81,bse
                    assert bse['rows'][0]['CE']['ltp']==529.65 and bse['rows'][0]['PE']['ltp']==155.10,bse
                    assert bse['rows'][0]['CE']['instrumentKey']=='BSE_FO|987',bse
                    status,analysis_bse=get(port,f'/api/analysis?exchange=BSE&underlying=SENSEX&expiry={EXP}&strike=81700&type=CE')
                    assert status==200 and analysis_bse['symbol']=='BSE_FO|987',analysis_bse
                    status,bse_chart=get(port,f'/api/chart?exchange=BSE&underlying=SENSEX&expiry={EXP}&strike=81700&type=CE&interval=5')
                    assert status==200 and bse_chart['instrumentKey']=='BSE_FO|987',bse_chart
                    for symbol in ('BANKNIFTY','FINNIFTY'):
                        status,index_exp=get(port,f'/api/expiries?exchange=NSE&underlying={symbol}')
                        assert status==200 and EXP in index_exp['expiries'],index_exp
                    status,wrong=get(port,'/api/expiries?exchange=NSE&underlying=SENSEX')
                    assert status==400 and 'BSE SENSEX' in wrong['error'],wrong
                    FakeUpstox.stale=True
                    status,old=get(port,f'/api/analysis?exchange=NSE&underlying=NIFTY&expiry={date}&strike={strike}&type=PE')
                    assert status==200 and old['signal']=='WAIT' and not old['dataQuality']['snapshotFresh'],old
                    status,stale_chart=get(port,f'/api/chart?exchange=NSE&underlying=NIFTY&expiry={date}&strike={strike}&type=PE&interval=1')
                    assert status==200 and stale_chart['quoteFresh'] is False,stale_chart
                    FakeUpstox.stale=False
                    FakeUpstox.fail=True
                    new_date=(NOW.date()+timedelta(days=10)).isoformat()
                    status,e=get(port,f'/api/chain?exchange=NSE&underlying=NIFTY&expiry={new_date}')
                    assert status==502 and 'Upstox' in e['error'],e
                    FakeUpstox.fail=False
                print('PASS',mode,'expiry, chain, quote depth, 1/3/5/15m chart, 5m signals, stale guards, no token exposure')
            finally:
                proc.terminate()
                try:proc.wait(timeout=4)
                except subprocess.TimeoutExpired:proc.kill()
    finally:
        mock.shutdown();mock.server_close()
if __name__=='__main__':main()
