"""Offline end-to-end: Upstox-shaped search/history fixture -> ML training.
No production token, private data, or persistent model artifacts are used.
"""
import datetime as dt
import math
import os
from pathlib import Path
import tempfile
from urllib.parse import unquote, urlparse
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from ml import live_bootstrap, engine
import requests

class Resp:
 status_code=200
 def __init__(self,data):self._data=data
 def json(self):return {'status':'success','data':self._data}
 def raise_for_status(self):assert self.status_code==200

class Provider:
 def __init__(self):self.headers={};self.query_count=0;self.history_count=0
 def get(self,url,params=None,timeout=None):
  assert timeout and timeout>=10
  assert self.headers['Authorization']=='Bearer TEST_TOKEN_ONLY'
  assert 'TEST_TOKEN_ONLY' not in url
  if url.endswith('/v2/instruments/search'):
   self.query_count+=1
   sym=params['query'];assert params['exchanges']=='NSE' and params['segments']=='EQ'
   return Resp([{'trading_symbol':sym,'exchange':'NSE','segment':'NSE_EQ','instrument_key':'NSE_EQ|'+sym},
                {'trading_symbol':sym,'exchange':'BSE','instrument_key':'BSE_EQ|BOGUS'}])
  assert '/v3/historical-candle/' in url,url
  self.history_count+=1
  parts=unquote(urlparse(url).path).split('/')
  symbol=parts[-5].split('|')[1];interval=int(parts[-3]);end=dt.date.fromisoformat(parts[-2]);start=dt.date.fromisoformat(parts[-1])
  assert interval==15 and end>=start
  idx=['RELIANCE','INFY','SBIN'].index(symbol)
  candles=[]
  for j in range((end-start).days+1):
   day=start+dt.timedelta(days=j)
   if day.weekday()>=5:continue
   for t in range(25):
    timestamp=dt.datetime.combine(day,dt.time(9,15,tzinfo=dt.timezone(dt.timedelta(hours=5,minutes=30))))+dt.timedelta(minutes=15*t)
    x=day.toordinal()*0.23+t*0.53+idx*1.1
    op=90+idx*140+12*math.sin(x)+3*math.cos(x/4)
    close=op*(1+0.004*math.sin(x*1.21))
    candles.append([timestamp.isoformat(),round(op,4),round(max(op,close)+0.8,4),
                    round(min(op,close)-0.7,4),round(close,4),2000+t*113,0])
  return Resp({'candles':list(reversed(candles))})

def run():
 old_token=os.environ.get('UPSTOX_ACCESS_TOKEN')
 old_session=requests.Session
 old_model,old_meta=engine.MODEL_PATH,engine.META_PATH
 try:
  os.environ['UPSTOX_ACCESS_TOKEN']='TEST_TOKEN_ONLY'
  provider=Provider();requests.Session=lambda:provider
  with tempfile.TemporaryDirectory() as d:
   engine.MODEL_PATH=Path(d)/'model.joblib';engine.META_PATH=Path(d)/'model.json'
   m=live_bootstrap.run(symbols=['RELIANCE','INFY','SBIN'],days=70,
     output=str(Path(d)/'private.csv'),session=provider,source_label='SYNTHETIC_MOCK_TEST')
   assert m['source']=='SYNTHETIC_MOCK_TEST'
   assert m['metrics']['testRows']>=100
   assert m['metrics']['uniqueDays']>=8
   assert engine.MODEL_PATH.exists() and engine.META_PATH.exists()
   assert provider.query_count==3 and provider.history_count>=12
  print('PASS: mock Upstox search -> OHLCV history -> local model train -> heldout; SYNTHETIC TEST ONLY')
 finally:
  requests.Session=old_session
  engine.MODEL_PATH=old_model;engine.META_PATH=old_meta
  if old_token is None:os.environ.pop('UPSTOX_ACCESS_TOKEN',None)
  else:os.environ['UPSTOX_ACCESS_TOKEN']=old_token
if __name__=='__main__':run()
