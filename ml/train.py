"""Usage: python -m ml.train --csv data/upstox_15m.csv --source UPSTOX_HISTORY"""
import argparse
import json
from .engine import train

def main():
    p=argparse.ArgumentParser(description='Train MarketPulse research-only movement classifier')
    p.add_argument('--csv',required=True)
    p.add_argument('--source',default='USER_CSV_UNVERIFIED')
    p.add_argument('--interval',type=int,default=15)
    args=p.parse_args()
    m=train(args.csv,args.source,interval=args.interval)
    print(json.dumps({'trained':True,'modelSource':m['source'],'heldoutMetrics':m['metrics']},indent=2))
if __name__=='__main__':main()
