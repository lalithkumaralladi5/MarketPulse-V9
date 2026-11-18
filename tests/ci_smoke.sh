#!/usr/bin/env bash
# Offline API regression: deliberately no real brokerage or OpenAI credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
unset GROWW_ACCESS_TOKEN UPSTOX_ACCESS_TOKEN UPSTOX_TEST_BASE OPENAI_API_KEY MARKETPULSE_ACCESS_PASSWORD
export PORT=8765 MARKETPULSE_BIND=127.0.0.1 MARKETPULSE_TEST_PORT=8765
python -m uvicorn ml.service:app --host 127.0.0.1 --port 8766 >/tmp/marketpulse-ci-ml.log 2>&1 &
ml_pid=$!
java -cp backend/classes MarketPulseServer >/tmp/marketpulse-ci-server.log 2>&1 &
java_pid=$!
cleanup() { kill "$java_pid" "$ml_pid" 2>/dev/null || true; wait "$java_pid" "$ml_pid" 2>/dev/null || true; }
trap cleanup EXIT
for i in $(seq 1 45); do
  if python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8765/api/health",timeout=1)' >/dev/null 2>&1 && \
     python -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8766/health",timeout=1)' >/dev/null 2>&1; then break; fi
  sleep .3
done
python - <<'PY'
import json, urllib.request
b='http://127.0.0.1:8765'
for path in ('/api/health','/api/status','/api/ml/status','/api/ml/predict?key=NSE_EQ%7CINE002A01018&interval=15'):
    with urllib.request.urlopen(b+path,timeout=8) as r:
        d=json.load(r)
    if path=='/api/health':assert d['ok']
    if path=='/api/ml/status':assert d['ready'] is False and 'token' not in json.dumps(d).lower()
    if path.startswith('/api/ml/predict'):assert d['signal']=='NO_LIVE_PREDICTION'
print('PASS: health, ML untrained status, non-fabricated demo predictions')
PY
python tests/check_demo.py
python tests/check_copilot.py
python tests/check_upstox_mock.py
python tests/check_v8_services.py
