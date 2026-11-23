"""MarketPulse private real-data ML bootstrap.

Resolve actual NSE equity instrument keys from Upstox, collect historical OHLCV,
then fit the research-only classifier. Never places bearer credentials in source,
URLs, terminal arguments, model metadata, or stdout.
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import re
import sys
import requests
from .collect_upstox import collect
from .engine import train

DEFAULT_SYMBOLS = ('RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'TCS', 'SBIN')
SYMBOL_RE = re.compile(r'^[A-Z0-9&._-]{2,24}$')
INSTRUMENT_RE = re.compile(r'^NSE_EQ\|[A-Za-z0-9._ -]{1,78}$')
UPSTOX_ORIGIN = 'https://api.upstox.com'


def discover_keys(symbols, session=None):
    """Only return exact NSE_EQ matches; never guess NSE instrument IDs."""
    symbols = [str(x).strip().upper() for x in symbols]
    if not 2 <= len(symbols) <= 8 or len(set(symbols)) != len(symbols):
        raise ValueError('Provide 2 to 8 different NSE equity symbols')
    if any(not SYMBOL_RE.fullmatch(x) for x in symbols):
        raise ValueError('Stock symbol contains invalid characters')
    if not os.getenv('UPSTOX_ACCESS_TOKEN', '').strip():
        raise RuntimeError('Missing local UPSTOX_ACCESS_TOKEN; generate a new Analytics Token in Upstox')
    session = session or requests.Session()
    session.headers.update({'Authorization': 'Bearer '+os.environ['UPSTOX_ACCESS_TOKEN'].strip(),
                            'Accept': 'application/json'})
    keys = []
    for sym in symbols:
        try:
            resp = session.get(UPSTOX_ORIGIN+'/v2/instruments/search', params={
                'query': sym, 'exchanges':'NSE','segments':'EQ','records':'20','page_number':'1'}, timeout=20)
            if resp.status_code != 200:
                raise RuntimeError('Upstox instrument search returned HTTP '+str(resp.status_code)
                                   +' for '+sym+'. Check token validity, entitlement and rate limits.')
            payload = resp.json()
        except requests.RequestException:
            raise RuntimeError('Upstox instrument search failed due to a network problem. No token logged.') from None
        if not isinstance(payload, dict) or payload.get('status') != 'success':
            raise RuntimeError('Upstox instrument search returned an unsuccessful provider response for '+sym)
        items = payload.get('data', [])
        if not isinstance(items, list):
            raise RuntimeError('Unexpected Upstox instrument search response format')
        found = next((item['instrument_key'] for item in items
                      if isinstance(item, dict)
                      and str(item.get('trading_symbol','')).upper() == sym
                      and str(item.get('exchange','')).upper() == 'NSE'
                      and INSTRUMENT_RE.fullmatch(str(item.get('instrument_key','')))), None)
        if found:
            keys.append(found)
            print('Found listed NSE equity:', sym, flush=True)
        else:
            print('Skipped unavailable exact NSE equity symbol:', sym, flush=True)
    keys = list(dict.fromkeys(keys))
    if len(keys) < 2:
        raise RuntimeError('Fewer than two real NSE equity instruments resolved; model was not trained.')
    print('Verified provider instrument keys:', len(keys), flush=True)
    return keys


def run(symbols=DEFAULT_SYMBOLS, days=100, interval=15, output='data/upstox_15m.csv', *, session=None, source_label='UPSTOX_HISTORY'):
    if not 30 <= days <= 365: raise ValueError('Choose 30 to 365 history days')
    if interval != 15: raise ValueError('This research baseline is standardized on 15-minute candles')
    keys=discover_keys(symbols, session=session)
    collect(keys, days=days, interval=interval, out=output)
    result=train(Path(output), source_label=source_label, interval=interval)
    m=result['metrics']
    print('TRAINED on '+('requested Upstox history' if source_label=='UPSTOX_HISTORY' else 'MOCK TEST HISTORY')+'. Not a profitability claim.', flush=True)
    print('Holdout rows:',m['testRows'],'| accuracy:',m['testAccuracy'],
          '| balanced accuracy:',m['testBalancedAccuracy'],
          '| majority baseline:',m['majorityClassBaseline'],
          '| macro F1:',m['testMacroF1'],flush=True)
    print('Model output stored locally; do not commit data or model artifacts.',flush=True)
    return result


def main(argv=None):
    ap=argparse.ArgumentParser(description='Resolve, collect and train with real private Upstox 15-minute candles')
    ap.add_argument('--symbols',nargs='+',default=list(DEFAULT_SYMBOLS))
    ap.add_argument('--days',type=int,default=100)
    ap.add_argument('--out',default='data/upstox_15m.csv')
    args=ap.parse_args(argv)
    try: run(args.symbols,args.days,output=args.out)
    except (RuntimeError,ValueError,requests.RequestException) as e:
        print('REAL-DATA ML BOOTSTRAP FAILED:',str(e),file=sys.stderr)
        return 1
    return 0

if __name__=='__main__':sys.exit(main())
