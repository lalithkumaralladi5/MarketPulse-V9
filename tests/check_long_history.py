"""Offline deterministic 10–15yr collector + daily model regression; NO real broker requests."""
import os,sys,tempfile,datetime as dt
from pathlib import Path
import numpy as np,pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from ml.collect_long_history import historical_window,start_years_ago,collect
from ml import train_long_history

class FakeReply:
    status_code=200
    def json(self):
        return {'status':'success','data':{'candles':[
          ['2020-01-02T00:00:00+05:30',100,103,99,102,10000],
          ['2020-01-03T00:00:00+05:30',102,104,101,103,9000]
        ]}}
class FakeSession:
    def __init__(self):self.headers={};self.requests=[]
    def get(self,url,timeout=25):
        self.requests.append(url)
        assert 'mock-token' not in url and 'Bearer' not in url
        return FakeReply()

def run():
    spans=list(historical_window(dt.date(2010,1,1),dt.date(2025,12,31)))
    assert spans[0][0]==dt.date(2010,1,1) and spans[-1][1]==dt.date(2025,12,31)
    assert all((b-a).days<365 for a,b in spans)
    assert all(a[1]+dt.timedelta(days=1)==b[0] for a,b in zip(spans,spans[1:]))
    assert start_years_ago(dt.date(2024,2,29),11)==dt.date(2013,2,28)
    with tempfile.TemporaryDirectory(prefix='mp_daily_') as directory:
        old=os.environ.get('UPSTOX_ACCESS_TOKEN')
        os.environ['UPSTOX_ACCESS_TOKEN']='mock-token-NOT_REAL'
        try:
            session=FakeSession()
            collected=collect(['NSE_EQ|INE002A01018'],years=10,
                end=dt.date(2026,11,23),out=str(Path(directory)/'history.csv'),
                session=session,sleep=0,pause=lambda _:None)
        finally:
            if old is None:os.environ.pop('UPSTOX_ACCESS_TOKEN',None)
            else:os.environ['UPSTOX_ACCESS_TOKEN']=old
        assert collected['rows']==2 and len(session.requests)>=10
        # Completely synthetic price paths across 13 years, NOT actual performance.
        rng=np.random.default_rng(807);rows=[]
        for i in range(4):
            p=100+i*100
            for day in pd.bdate_range('2013-01-01','2026-01-09'):
                p=max(3,p*(1+rng.normal(.0002,.015)))
                o=p*(1+rng.normal(0,.002))
                rows.append({'timestamp':day.isoformat(),'instrument_key':f'NSE_EQ|SYNTHETIC{i}',
                    'open':o,'high':max(o,p)*1.007,'low':min(o,p)*.993,
                    'close':p,'volume':1000+i*100+int(rng.integers(100,500))})
        path=Path(directory)/'daily_fixture.csv'
        pd.DataFrame(rows).to_csv(path,index=False)
        model=Path(directory)/'daily.joblib'
        report=train_long_history.run(str(path),source='SYNTHETIC_TEST_NOT_REAL',
                                        output=str(model),require_years=10)
        assert report['actualHistoryYears']>=10
        assert report['metrics']['testRows']>100
        assert report['metrics']['testBalancedAccuracy']>=0
        assert model.exists() and model.with_suffix('.json').exists()
        assert report['trainingTimeframe'].startswith('DAILY')
        try:train_long_history.run(str(path),output=str(model),require_years=15)
        except ValueError as e:assert 'not at least 15' in str(e)
        else:raise AssertionError('Insufficient actual coverage must prevent 15-year claim')
    print('PASS: 15-year historical pagination, token isolation, daily model training and no fake accuracy claims')
if __name__=='__main__':run()
