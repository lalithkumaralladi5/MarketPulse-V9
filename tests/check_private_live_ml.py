"""Private ML launch and provenance regression. No external broker requests or secrets."""
from pathlib import Path
from fastapi import HTTPException
from ml.service import Prediction
from ml import service
root=Path(__file__).resolve().parents[1]
ps=(root/'train-and-run-upstox-windows.ps1').read_text(encoding='utf-8')
bat=(root/'train-and-run-upstox-windows.bat').read_text(encoding='utf-8')
java=(root/'backend'/'MlBridge.java').read_text(encoding='utf-8')
render=(root/'render.yaml').read_text(encoding='utf-8')
assert 'train-and-run-upstox-windows.ps1' in bat
for fragment in ("-AsSecureString","Get-NetTCPConnection","ml.collect_upstox","ml.train","run-windows.bat","Remove-Item Env:UPSTOX_ACCESS_TOKEN"):
    assert fragment in ps,fragment
assert 'UPSTOX_ACCESS_TOKEN' not in render
assert 'start.plus(Duration.ofMinutes(interval))' in java
assert 'intervalMinutes' in java

# Interval provenance is enforced before model scores are computed.
original=service.current
try:
    service.current=lambda: (object(),{'intervalMinutes':15,'trainingSegments':['NSE_EQ']})
    sample=Prediction(instrumentKey='NSE_EQ|INE002A01018',intervalMinutes=5,candles=[{} for i in range(35)])
    try:
        service.predict(sample)
    except HTTPException as error:
        assert error.status_code==409 and 'interval' in str(error.detail)
    else:raise AssertionError('Wrong candle timeframe must not be scored')
finally:
    service.current=original
print('PASS: private one-pass Upstox launch and strict inference interval/provenance protections')
