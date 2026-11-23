"""Local-only ML inference service. Java proxy is the browser-facing endpoint."""
from __future__ import annotations
import os
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .engine import MODEL_PATH, META_PATH, infer
import joblib

app=FastAPI(title='MarketPulse ML',docs_url=None,redoc_url=None)
_cached=None
_cached_mtime=-1
class Prediction(BaseModel):
    candles:list[dict]=Field(min_length=35,max_length=5000)
    instrumentKey:str=Field(max_length=100)
    intervalMinutes:int=Field(ge=1,le=1440)

def current():
    global _cached,_cached_mtime
    if not MODEL_PATH.exists() or not META_PATH.exists():return None
    mt=MODEL_PATH.stat().st_mtime
    if _cached is None or mt!=_cached_mtime:
        _cached=(joblib.load(MODEL_PATH),json.loads(META_PATH.read_text(encoding='utf-8')))
        _cached_mtime=mt
    return _cached

def daily_study():
    # Independent daily model — never used for 15-minute contract prediction.
    path=Path(__file__).resolve().parent/'models'/'marketpulse_daily.joblib'
    meta=path.with_suffix('.json')
    if not path.exists() or not meta.exists():return {'ready':False}
    try:
        info=json.loads(meta.read_text(encoding='utf-8'))
        m=info.get('metrics') or {}
        if info.get('intervalMinutes')!=1440:return {'ready':False}
        return {'ready':True,'modelSource':info.get('source'),
            'historyYears':info.get('actualHistoryYears'),
            'historyFrom':info.get('actualHistoryFrom'),'historyTo':info.get('actualHistoryThrough'),
            'testRows':m.get('testRows'),'testAccuracy':m.get('testAccuracy'),
            'balancedAccuracy':m.get('testBalancedAccuracy'),
            'majorityBaseline':m.get('majorityClassBaseline'),
            'researchOnly':True,'timeframe':'1D stocks; not intraday options'}
    except (ValueError,OSError,TypeError):return {'ready':False}

@app.get('/health')
def health():
    loaded=current()
    return {'service':'MarketPulse ML','ready':bool(loaded),'modelSource':loaded[1]['source'] if loaded else None,
            'metadata':loaded[1] if loaded else None,
            'reason':None if loaded else 'No trained model. Collect historical candles and run train.py first.',
            'ordersEnabled':False,'dailyStudy':daily_study()}

@app.post('/predict')
def predict(payload:Prediction):
    loaded=current()
    if not loaded: raise HTTPException(409,detail='No trained model; prediction unavailable.')
    if payload.intervalMinutes != loaded[1].get('intervalMinutes'):
        raise HTTPException(409,detail='Model training interval and requested candle interval differ. Train a matching model first.')
    segment=payload.instrumentKey.split('|')[0]
    if segment not in loaded[1].get('trainingSegments',[]):
        raise HTTPException(409,detail='Model not trained for '+segment+' instruments. Train with matching historical market data first.')
    try:return infer(*loaded,payload.candles)
    except (ValueError,KeyError,TypeError) as e:raise HTTPException(400,detail=str(e)) from e
