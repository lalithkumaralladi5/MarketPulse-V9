#!/usr/bin/env sh
set -eu
if [ -n "${UPSTOX_ACCESS_TOKEN:-}" ] && [ "$(printf %s "${MARKETPULSE_ACCESS_PASSWORD:-}" | wc -c)" -lt 16 ]; then
 echo 'SECURITY: Do not expose live Upstox data to the public. Set a 16+ character MARKETPULSE_ACCESS_PASSWORD and private HTTPS access.' >&2
 exit 1
fi
python -m uvicorn ml.service:app --host 127.0.0.1 --port 8766 >/tmp/marketpulse_ml.log 2>&1 &
exec java -Xmx192m -cp backend/classes MarketPulseServer
