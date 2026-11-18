"""Local-only ML inference service. Java proxy is the browser-facing endpoint."""
from __future__ import annotations
import os
import json
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

def current():
    global _cached,_cached_mtime
    if not MODEL_PATH.exists() or not META_PATH.exists():return None
    mt=MODEL_PATH.stat().st_mtime
    if _cached is None or mt!=_cached_mtime:
        _cached=(joblib.load(MODEL_PATH),json.loads(META_PATH.read_text(encoding='utf-8')))
        _cached_mtime=mt
    return _cached

@app.get('/health')
def health():
    loaded=current()
    return {'service':'MarketPulse ML','ready':bool(loaded),'modelSource':loaded[1]['source'] if loaded else None,
            'metadata':loaded[1] if loaded else None,
            'reason':None if loaded else 'No trained model. Collect historical candles and run train.py first.',
            'ordersEnabled':False}

@app.post('/predict')
def predict(payload:Prediction):
    loaded=current()
    if not loaded: raise HTTPException(409,detail='No trained model; prediction unavailable.')
    segment=payload.instrumentKey.split('|')[0]
    if segment not in loaded[1].get('trainingSegments',[]):
        raise HTTPException(409,detail='Model not trained for '+segment+' instruments. Train with matching historical market data first.')
    try:return infer(*loaded,payload.candles)
    except (ValueError,KeyError,TypeError) as e:raise HTTPException(400,detail=str(e)) from e
