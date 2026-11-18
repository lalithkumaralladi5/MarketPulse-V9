"""MarketPulse ML - honest, time-ordered movement classification on real OHLCV data.
No future rows enter features; holdout is chronological and purged by forecast horizon.
"""
from __future__ import annotations
import json
import math
import os
from pathlib import Path
from datetime import datetime, timezone
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import balanced_accuracy_score, f1_score, confusion_matrix, accuracy_score

HORIZON=3
RETURN_BAND=0.003
FEATURES=['r1','r3','r6','ema_gap','rsi','atr_pct','relative_volume','bar_body','bar_range','volatility','vwap_gap']
LABEL_NAMES={-1:'DOWN',0:'FLAT',1:'UP'}
BASE=Path(__file__).resolve().parent
MODEL_PATH=Path(os.getenv('MARKETPULSE_MODEL_PATH',str(BASE/'models'/'marketpulse.joblib')))
META_PATH=MODEL_PATH.with_suffix('.json')


def indicators(x:pd.DataFrame)->pd.DataFrame:
    x=x.sort_values('timestamp').copy()
    for c in ['open','high','low','close','volume']:
        x[c]=pd.to_numeric(x[c],errors='coerce')
    close=x.close.replace(0,np.nan)
    p=close.pct_change(fill_method=None)
    x['r1']=p
    x['r3']=close.pct_change(3,fill_method=None)
    x['r6']=close.pct_change(6,fill_method=None)
    e9=close.ewm(span=9,adjust=False).mean()
    e21=close.ewm(span=21,adjust=False).mean()
    x['ema_gap']=(e9-e21)/close
    diff=close.diff(); gains=diff.clip(lower=0).ewm(alpha=1/14,adjust=False,min_periods=14).mean()
    losses=(-diff.clip(upper=0)).ewm(alpha=1/14,adjust=False,min_periods=14).mean()
    x['rsi']=(100-100/(1+gains/(losses+1e-12)))/100
    tr=pd.concat([x.high-x.low,(x.high-close.shift()).abs(),(x.low-close.shift()).abs()],axis=1).max(axis=1)
    x['atr_pct']=tr.rolling(14,min_periods=14).mean()/close
    v=x.volume.clip(lower=0)
    x['relative_volume']=v/(v.rolling(20,min_periods=20).mean()+1e-9)
    x['bar_body']=(x.close-x.open)/(close+1e-9)
    x['bar_range']=(x.high-x.low)/(close+1e-9)
    x['volatility']=p.rolling(12,min_periods=12).std()
    tp=(x.high+x.low+x.close)/3
    pv=(tp*v).rolling(25,min_periods=25).sum(); cv=v.rolling(25,min_periods=25).sum()
    x['vwap_gap']=(close-pv/(cv+1e-9))/close
    x[FEATURES]=x[FEATURES].replace([np.inf,-np.inf],np.nan)
    return x


def prepare(df:pd.DataFrame, horizon=HORIZON, band=RETURN_BAND, labels=True)->pd.DataFrame:
    required={'timestamp','instrument_key','open','high','low','close','volume'}
    missing=required-set(df.columns)
    if missing: raise ValueError('Missing columns: '+', '.join(sorted(missing)))
    df=df.copy();df['timestamp']=pd.to_datetime(df.timestamp,utc=True,errors='coerce')
    df=df.dropna(subset=['timestamp','instrument_key'])
    df=df.drop_duplicates(['instrument_key','timestamp']).sort_values(['instrument_key','timestamp'])
    parts=[]
    for key,group in df.groupby('instrument_key',sort=False):
        group=indicators(group)
        if labels:
            forward=group.close.shift(-horizon)/group.close-1
            group['future_return']=forward
            group['target']=np.select([forward>band,forward<-band],[1,-1],default=0)
            group=group.iloc[:-horizon]
        group=group.dropna(subset=FEATURES)
        parts.append(group)
    if not parts:raise ValueError('No sufficient series with valid feature windows')
    all_df=pd.concat(parts,ignore_index=True).sort_values('timestamp')
    return all_df.reset_index(drop=True)


def train(csv_path:Path, source_label='USER_CSV_UNVERIFIED', min_rows=400, interval=15):
    csv_path=Path(csv_path)
    data=pd.read_csv(csv_path)
    df=prepare(data)
    if len(df)<min_rows:raise ValueError(f'Only {len(df)} feature rows: need at least {min_rows} historical rows')
    days=int(df.timestamp.dt.date.nunique())
    if days<8:raise ValueError('Need candles across at least 8 distinct dates to limit one-session overfitting')
    # Time cutoffs calculated from actual sorted timestamps. Purge 3 observations per
    # instrument at both split boundaries to prevent target lookahead across partitions.
    t1=df.timestamp.quantile(.65); t2=df.timestamp.quantile(.82)
    train=df[df.timestamp<t1].copy()
    val=df[(df.timestamp>=t1)&(df.timestamp<t2)].copy()
    test=df[df.timestamp>=t2].copy()
    for frame, boundary in [(train,t1),(val,t2)]:
        drop_index=frame.groupby('instrument_key').tail(HORIZON).index
        frame.drop(index=drop_index,inplace=True)
    if min(len(train),len(val),len(test))<70: raise ValueError('Time split too small to train and evaluate')
    if len(set(train.target))<2:raise ValueError('Training sample has fewer than two movement classes')
    model=HistGradientBoostingClassifier(max_iter=100,max_leaf_nodes=12,learning_rate=.045,l2_regularization=2.0,random_state=47)
    model.fit(train[FEATURES],train.target.astype(int))
    pval=model.predict_proba(val[FEATURES]); preds=model.classes_[pval.argmax(axis=1)]
    ptest=model.predict_proba(test[FEATURES]); predt=model.classes_[ptest.argmax(axis=1)]
    # Validation-based abstention threshold, not tuned on the test set.
    choices=[]
    for threshold in [.52,.57,.62,.67]:
        edge=np.max(pval,axis=1)
        mask=(edge>=threshold)&(preds!=0)
        n=int(mask.sum())
        precision=float((preds[mask]==val.target.to_numpy()[mask]).mean()) if n else 0.0
        if n>=15:choices.append((precision,threshold,n))
    # Prefer no signal to overclaiming. Never expose a >99% as guaranteed accuracy.
    threshold=max(choices,key=lambda x:(x[0],x[2]))[1] if choices else .67
    mask=(ptest.max(axis=1)>=threshold)&(predt!=0)
    signal_n=int(mask.sum()); correct=int((predt[mask]==test.target.to_numpy()[mask]).sum())
    baseline=float(test.target.value_counts(normalize=True).max())
    metrics={
        'totalFeatureRows':len(df),'trainRows':len(train),'validationRows':len(val),'testRows':len(test),
        'uniqueDays':days,'instruments':int(df.instrument_key.nunique()),'forecastBars':HORIZON,'movementBandPct':round(RETURN_BAND*100,3),
        'testAccuracy':round(float(accuracy_score(test.target,predt)),4),
        'testBalancedAccuracy':round(float(balanced_accuracy_score(test.target,predt)),4),
        'testMacroF1':round(float(f1_score(test.target,predt,average='macro',zero_division=0)),4),
        'majorityClassBaseline':round(baseline,4),'highScoreSignals':signal_n,
        'highScoreClassificationPrecision':round(correct/signal_n,4) if signal_n else None,
        'confusionMatrix':confusion_matrix(test.target,predt,labels=[-1,0,1]).tolist(),
        'testFrom':str(test.timestamp.min()),'testTo':str(test.timestamp.max()),
        'notice':'Classification metrics on held-out bars, NOT realized trading win rate. No fees/slippage/fills or walk-forward folds included.'
    }
    metadata={'schema':1,'features':FEATURES,'classes':[int(x) for x in model.classes_], 'threshold':threshold,
              'source':source_label,'trainedAt':datetime.now(timezone.utc).isoformat(), 'metrics':metrics,
              'trainingFile':csv_path.name,'intervalMinutes':interval,
              'trainingSegments':sorted(set(str(k).split('|')[0] for k in df.instrument_key.unique())),
              'warning':'Predictions are uncalibrated directional scores and are not trade recommendations. Not 93% or 99% accuracy.'}
    MODEL_PATH.parent.mkdir(parents=True,exist_ok=True)
    joblib.dump(model,MODEL_PATH)
    META_PATH.write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    return metadata


def infer(model,meta,bars):
    if len(bars)<35:raise ValueError('Need at least 35 completed candles for indicator features')
    df=pd.DataFrame([{**b,'instrument_key':'SELECTED'} for b in bars])
    # Some exchanges return latest-first. Sort consistently and remove duplicates.
    rows=prepare(df,labels=False)
    if rows.empty:raise ValueError('Not enough valid candles')
    last=rows.iloc[-1]
    proba=model.predict_proba(pd.DataFrame([last[FEATURES].to_dict()]))[0]
    scores={LABEL_NAMES[int(c)]:round(float(v),4) for c,v in zip(model.classes_,proba)}
    for k in ['UP','DOWN','FLAT']:scores.setdefault(k,0.)
    best=max(scores,key=scores.get)
    signal=best if best!='FLAT' and scores[best]>=meta['threshold'] else 'NO_EDGE'
    return {'signal':signal,'scores':scores,'highScoreThreshold':meta['threshold'],'barsUsed':len(rows),
            'latestCandle':str(last.timestamp),'latestClose':round(float(last.close),4),
            'features':{k:round(float(last[k]),5) for k in FEATURES},
            'source':meta['source'],'trainedAt':meta['trainedAt'],'heldoutMetrics':meta['metrics'],
            'notProbability':True,'meaning':'Model class scores (not calibrated win probabilities); directional research only, not a BUY/SELL order.'}
