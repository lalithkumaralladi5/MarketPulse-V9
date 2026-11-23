"""Train a SEPARATE daily research classifier without overwriting the 15m model.

Reports actual historical coverage and untouched chronological test metrics.
Not a trading backtest, not historical expired-options predictions.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
import pandas as pd
from . import engine

def run(csv:str,source:str='UPSTOX_DAILY_HISTORY',output:str|None=None,require_years:int=10):
    raw=pd.read_csv(csv)
    if raw.empty:raise ValueError('Daily candle CSV is empty')
    dates=pd.to_datetime(raw.timestamp,utc=True,errors='coerce').dropna()
    if dates.empty:raise ValueError('All historical timestamps are invalid')
    first,last=dates.min(),dates.max()
    actual_years=(last-first).days/365.25
    if actual_years<require_years-.55:
        raise ValueError(f'Actual daily history is {actual_years:.2f} years, not at least {require_years}; no fake long-term accuracy claim')
    if not set(raw.instrument_key.astype(str).str.split('|').str[0]).issubset({'NSE_EQ','BSE_EQ'}):
        raise ValueError('The long-term model supports daily equities only, not expiring option contracts')
    path=Path(output) if output else Path(__file__).resolve().parent/'models'/'marketpulse_daily.joblib'
    old_path,old_meta=engine.MODEL_PATH,engine.META_PATH
    try:
        engine.MODEL_PATH=path
        engine.META_PATH=path.with_suffix('.json')
        meta=engine.train(csv,source,interval=1440)
    finally:
        engine.MODEL_PATH,engine.META_PATH=old_path,old_meta
    meta.update({
        'requestedHistoryYears':require_years,
        'actualHistoryYears':round(actual_years,2),
        'actualHistoryFrom':first.isoformat(),
        'actualHistoryThrough':last.isoformat(),
        'trainingTimeframe':'DAILY (1D) — NOT 15m options',
        'caveats':[
            'Accuracy is classification on a single chronological holdout, not a realized trading win rate.',
            'Currently listed stocks can cause survivorship bias; delisted equities are not guaranteed.',
            'Corporate actions and stock splits require verification for each security.',
            'Hypothetical event-study outcomes do not establish implementable profitability.',
            'A daily-stock model cannot be used for intraday option BUY/SELL entries.'
        ]
    })
    path.with_suffix('.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    m=meta['metrics']
    print(json.dumps({'actualHistoryYears':meta['actualHistoryYears'],
        'from':meta['actualHistoryFrom'],'to':meta['actualHistoryThrough'],
        'instruments':m['instruments'],'testRows':m['testRows'],
        'testAccuracy':m['testAccuracy'],'testBalancedAccuracy':m['testBalancedAccuracy'],
        'macroF1':m['testMacroF1'],'majorityBaseline':m['majorityClassBaseline'],
        'modelPath':str(path),'timeframe':meta['trainingTimeframe']},indent=2))
    return meta

if __name__=='__main__':
    p=argparse.ArgumentParser(description='Long-history DAILY model, independent of 15m predictions')
    p.add_argument('--csv',default='data/upstox_daily_long.csv')
    p.add_argument('--source',default='UPSTOX_DAILY_HISTORY')
    p.add_argument('--output')
    p.add_argument('--require-years',type=int,choices=[10,12,15],default=10)
    a=p.parse_args()
    run(a.csv,a.source,a.output,a.require_years)
