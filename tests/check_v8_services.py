"""V8 local mock integration tests; never contacts production Upstox."""
import json,time,urllib.parse,threading
from http.server import ThreadingHTTPServer
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from check_upstox_mock import FakeUpstox,start,get,EXP

class Provider(FakeUpstox):
    def do_GET(self):
        p=urllib.parse.urlparse(self.path);path=urllib.parse.unquote(p.path);qs=urllib.parse.parse_qs(p.query)
        if path=='/v2/instruments/search':
            symbol=qs.get('query',[''])[0].upper();exchange=qs.get('exchanges',['NSE'])[0]
            if symbol not in ['RELIANCE','HDFCBANK','ICICIBANK','TCS','INFY','SBIN','ITC','BHARTIARTL','AXISBANK','LT','MARUTI','KOTAKBANK']:
                data=[]
            else:
                data=[{'trading_symbol':symbol,'name':symbol+' INDUSTRIES','instrument_key':exchange+'_EQ|'+symbol,'exchange':exchange,'segment':exchange+'_EQ','instrument_type':'EQ','lot_size':1}]
        elif path=='/v3/market-quote/quotes' and 'EQ|' in qs.get('instrument_key',[''])[0]:
            keys=qs.get('instrument_key',[''])[0].split(',');now=datetime.now(ZoneInfo('Asia/Kolkata'))
            buys=[{'price':99.5-i*.1,'quantity':500+i*10} for i in range(5)]
            sells=[{'price':100.5+i*.1,'quantity':530+i*10} for i in range(5)]
            data={k.replace('|',':'):{'instrument_token':k,'last_price':100.0,'cp':98.0,'timestamp':now.isoformat(),'last_trade_time':str(int(now.timestamp()*1000)),'depth':{'buy':buys,'sell':sells},'volume':100000,'oi':35000} for k in keys}
        elif path=='/v2/news':
            k=qs.get('instrument_keys',[''])[0];data={k:[{'heading':'Local provider fixture headline','summary':'Mock news with safe text','article_link':'https://upstox.com/news/test-article/','published_time':int(time.time()*1000)}]}
        elif path=='/v2/option/contract' and 'EQ|' in qs.get('instrument_key',[''])[0]:
            data=[{'expiry':EXP,'instrument_key':'NSE_FO|777','strike_price':100,'instrument_type':'CE'}]
        elif path=='/v2/option/chain' and 'EQ|' in qs.get('instrument_key',[''])[0]:
            data=[{'strike_price':100,'underlying_spot_price':100,
                'call_options':{'instrument_key':'NSE_FO|777','market_data':{'ltp':7,'oi':550,'volume':1000},'option_greeks':{'iv':14,'delta':.5}},
                'put_options':{'instrument_key':'NSE_FO|778','market_data':{'ltp':8,'oi':650,'volume':1100},'option_greeks':{'iv':15,'delta':-.5}}}]
        elif path.startswith('/v3/historical-candle/') and 'EQ|' in path:
            if '/intraday/' not in path:data={'candles':[]}
            else:
                base=datetime.now(ZoneInfo('Asia/Kolkata')).replace(hour=9,minute=15,second=0,microsecond=0)
                mins=int(path.rsplit('/',1)[-1]);data={'candles':[[ (base+timedelta(minutes=mins*i)).isoformat(),100+i*.1,101+i*.1,99+i*.1,100.5+i*.1,200+i*3,0] for i in range(65)]}
        else:
            return super().do_GET()
        self.answer(200,{'status':'success','data':data})

def check():
    mock=ThreadingHTTPServer(('127.0.0.1',17868),Provider);th=threading.Thread(target=mock.serve_forever,daemon=True);th.start()
    try:
        proc=start('upstox',17888)
        try:
            code,s=get(17888,'/api/universe/search?query=RELIANCE&exchange=NSE&segment=EQ');assert code==200 and s['instruments'][0]['key']=='NSE_EQ|RELIANCE',s
            code,ch=get(17888,'/api/universe/chart?key=NSE_EQ%7CRELIANCE&interval=5');assert code==200 and len(ch['candles'])>=60 and ch['mode']=='LIVE',ch
            code,ch60=get(17888,'/api/universe/chart?key=NSE_EQ%7CRELIANCE&interval=60');assert code==200 and len(ch60['candles'])>=60,ch60
            code,q=get(17888,'/api/universe/quote?key=NSE_EQ%7CRELIANCE');assert code==200 and len(q['depthBuy'])==5 and q['ltp']==100,q
            code,n=get(17888,'/api/universe/news?key=NSE_EQ%7CRELIANCE');assert code==200 and n['headlines'][0]['headline']=='Local provider fixture headline',n
            code,ex=get(17888,'/api/universe/options?key=NSE_EQ%7CRELIANCE');assert code==200 and EXP in ex['expiries'],ex
            code,opts=get(17888,f'/api/universe/options?key=NSE_EQ%7CRELIANCE&expiry={EXP}');assert code==200 and opts['rows'][0]['CE']['key']=='NSE_FO|777',opts
            code,heat=get(17888,'/api/universe/heatmap?exchange=NSE');assert code==200 and len(heat['items'])>=8,heat
            code,bad=get(17888,'/api/universe/quote?key=https%3A%2F%2Fevil.example');assert code==400,bad
            code,bad=get(17888,'/api/universe/search?query=R&exchange=NSE');assert code==400,bad
            for obj in [s,ch,ch60,q,n,ex,opts,heat]:assert 'offline-fixture-only' not in json.dumps(obj)
            print('PASS LIVE-shaped V8 instrument search, stock chart 5m/60m, quote/depth, news, equity options, heatmap, token isolation, validation')
        finally:
            proc.terminate();proc.wait(timeout=5)
        proc=start('demo',17889)
        try:
            code,s=get(17889,'/api/universe/search?query=RELIANCE');assert code==200 and s['mode']=='DEMO',s
            code,ch=get(17889,'/api/universe/chart?key=DEMO_EQ%7CRELIANCE&interval=1');assert code==200 and ch['mode']=='DEMO',ch
            code,q=get(17889,'/api/universe/quote?key=DEMO_EQ%7CRELIANCE');assert code==200 and not q['fresh'],q
            code,n=get(17889,'/api/universe/news?key=DEMO_EQ%7CRELIANCE');assert code==200 and not n['headlines'],n
            code,h=get(17889,'/api/universe/heatmap?exchange=BSE');assert code==200 and len(h['items'])==12 and h['mode']=='DEMO',h
            print('PASS DEMO V8 search, synthetic candles, non-live quotes, no fabricated headlines, heatmap')
        finally:proc.terminate();proc.wait(timeout=5)
    finally:mock.shutdown();mock.server_close()
if __name__=='__main__':check()
