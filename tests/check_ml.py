"""Self-contained deterministic ML tests (SYNTHETIC TEST DATA ONLY)."""
import os,sys,tempfile
from pathlib import Path
import numpy as np,pandas as pd
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ml import engine


def run():
 rng=np.random.default_rng(170)
 bars=[]
 for idx in range(4):
  for day in pd.bdate_range('2026-07-01','2026-10-30'):
   price=100+idx*70
   for k in range(24):
    price=max(1,price*(1+rng.normal(0,.004)))
    bars.append({'instrument_key':'TEST_EQ|'+str(idx),'timestamp':str(day+pd.Timedelta(hours=9,minutes=15+15*k)),
       'open':price,'high':price*1.003,'low':price*.997,'close':price*(1+rng.normal(0,.001)),
       'volume':2000+int(rng.integers(0,3000))})
 with tempfile.TemporaryDirectory(prefix='mp_ml_') as d:
  path=Path(d)/'candles.csv';pd.DataFrame(bars).to_csv(path,index=False)
  engine.MODEL_PATH=Path(d)/'model.joblib'
  engine.META_PATH=engine.MODEL_PATH.with_suffix('.json')
  m=engine.train(path,'TEST_SYNTHETIC_NOT_MARKET',min_rows=400)
  assert m['source']=='TEST_SYNTHETIC_NOT_MARKET'
  assert m['metrics']['testRows']>100
  assert m['metrics']['uniqueDays']>=8
  assert m['metrics']['testBalancedAccuracy']<=1
  model=__import__('joblib').load(engine.MODEL_PATH)
  result=engine.infer(model,m,[x for x in bars if x['instrument_key']=='TEST_EQ|0'][-70:])
  assert result['signal'] in ('UP','DOWN','NO_EDGE')
  assert 'scores' in result and abs(sum(result['scores'].values())-1)<.01
  assert result['notProbability'] is True
  # No train/test leakage from the future into the feature for an earlier candle:
  a=pd.DataFrame([x for x in bars if x['instrument_key']=='TEST_EQ|0'][:100])
  first=engine.prepare(a,labels=False)
  altered=a.copy();altered.loc[altered.index[-1],'close']=altered.iloc[-1]['close']*20
  second=engine.prepare(altered,labels=False)
  assert np.allclose(first[engine.FEATURES].iloc[-2].to_numpy(dtype=float),second[engine.FEATURES].iloc[-2].to_numpy(dtype=float),equal_nan=True)
  print('PASS ML synthetic train/holdout/infer + lookahead regression, rows',m['metrics']['totalFeatureRows'])

if __name__=='__main__':run()
