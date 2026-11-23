"""Offline only: exact Upstox instrument resolution without any real credential."""
import os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from ml.live_bootstrap import discover_keys, run
class Response:
 def __init__(self,data,status_code=200):self.data=data;self.status_code=status_code
 def json(self):return {'status':'success','data':self.data}
class FakeSession:
 def __init__(self):self.headers={};self.calls=[]
 def get(self,url,params,timeout):
  assert url=='https://api.upstox.com/v2/instruments/search'
  assert params['segments']=='EQ' and params['exchanges']=='NSE'
  assert 'token' not in str(params).lower()
  assert timeout>=10
  assert self.headers['Authorization']=='Bearer TEST_MOCK_ONLY'
  self.calls.append(params['query'])
  sym=params['query']
  return Response([{'trading_symbol':sym,'exchange':'NSE','segment':'NSE_EQ',
                    'instrument_key':'NSE_EQ|TEST_'+sym},
                   {'trading_symbol':sym,'exchange':'BSE','instrument_key':'BSE_EQ|SHOULD_IGNORE'}])
if __name__=='__main__':
 original=os.environ.get('UPSTOX_ACCESS_TOKEN')
 try:
  os.environ['UPSTOX_ACCESS_TOKEN']='TEST_MOCK_ONLY'
  fake=FakeSession();keys=discover_keys(['RELIANCE','HDFCBANK','INFY'],fake)
  assert keys==['NSE_EQ|TEST_RELIANCE','NSE_EQ|TEST_HDFCBANK','NSE_EQ|TEST_INFY'],keys
  assert fake.calls==['RELIANCE','HDFCBANK','INFY']
  try: discover_keys(['RELIANCE','RELIANCE'],FakeSession())
  except ValueError: pass
  else:raise AssertionError('Duplicate symbols must be rejected')
  try: run(['RELIANCE','HDFCBANK'],days=2,session=FakeSession())
  except ValueError: pass
  else: raise AssertionError('Insufficient history must not train')
  script=(Path(__file__).resolve().parents[1]/'run-live-ml-windows.ps1').read_text(encoding='utf-8')
  assert script.index('Remove-Item Env:UPSTOX_ACCESS_TOKEN')<script.index('Start-Process -FilePath')
  assert 'python -m ml.live_bootstrap' in script and 'run-windows.bat' in script
  print('PASS: mock key discovery, token isolated from URLs, private ML launch, no synthetic fallback')
 finally:
  if original is None:os.environ.pop('UPSTOX_ACCESS_TOKEN',None)
  else:os.environ['UPSTOX_ACCESS_TOKEN']=original
