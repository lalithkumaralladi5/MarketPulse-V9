# Secure Upstox on Render — no token in GitHub

## Current hosted link
https://marketpulse-hackathon.onrender.com

The existing Render **web service** has a public URL. It currently uses **DEMO** because the public service has no `UPSTOX_ACCESS_TOKEN`. It is possible to password-protect the service, but this does **not** make it a network-private service. Only a Render *private service* removes its public endpoint; that is a different hosting mode and does not provide the existing public URL.

## If you choose a personal password-protected LIVE instance
1. Revoke the Analytics Token that was posted in chat. Generate a **new** Analytics Token in Upstox. Do not share it with ChatGPT, GitHub, your browser frontend or source code.
2. Open https://dashboard.render.com → **marketpulse-hackathon** → **Environment**.
3. Choose **Add Environment Variable** and create BOTH keys in the same save action:
   - `UPSTOX_ACCESS_TOKEN` = your **new** Analytics Token, as a secret environment value.
   - `MARKETPULSE_ACCESS_PASSWORD` = a **new unique random password 20+ characters** (16 is the enforced minimum; longer is better).
4. Choose **Save, deploy** or **Save, rebuild and deploy**. Do not add only the token without the password: `start-cloud.sh` intentionally refuses to start.
5. Open the HTTPS link. HTTP Basic Auth requests **username `marketpulse`** and your `MARKETPULSE_ACCESS_PASSWORD` (not the Upstox token).
6. After login, check `/api/status` (expect `provider:"Upstox"`, `mode:"LIVE"`, `upstoxTokenConfigured:true`) and choose a real instrument. Token configured does NOT guarantee valid quote permissions. The browser must still show genuine provider candles and a freshness/staleness timestamp.
7. If any login or API problem occurs, inspect Render **Logs** but redact secrets before sharing screenshots.

Do **not** add your token to `render.yaml`, `Dockerfile`, GitHub source, `.env` uploads, CI workflow variables, screenshots or chat history.

### Important restrictions

- Upstox Analytics Tokens are read-only and data access/redistribution entitlements still apply. Check Upstox and exchange terms before using account-linked data on a hosted server.
- Basic Auth over HTTPS is a lightweight access gate, not enterprise-grade production security or absolute privacy. The hostname remains internet-reachable; anyone without the password should receive HTTP 401 (except the intentionally unauthenticated liveness probe at `/api/health`).
- On Render Free, service disks are ephemeral. A locally trained model in `ml/models/` does not magically arrive on Render. A durable private trained model deployment needs a managed artifact path or a persistent disk/private hosting plan and explicit verification.
- To use **truly private market data** without hosting it at an internet endpoint, use the local `run-upstox-windows.bat` launcher and then `verify-upstox-windows.bat` rather than adding your token to a public Render web service.
- Even in LIVE mode, outside market hours or with stale quotes, active trading signals must remain blocked.

## 10–15 years of history and model accuracy

Run `setup-ml-windows.bat` if needed, then `train-long-history-windows.bat`. Enter 2–20 actual NSE/BSE equity instrument keys and your replacement token in the masked prompt. The scripts fetch genuine Upstox V3 **DAILY** candles and run 65% chronological training / 17% validation / 18% untouched holdout evaluation in the existing model engine. The model is saved **locally** to `ml/models/marketpulse_daily.joblib` with a separate `.json` accuracy report. The original 15-minute model is not overwritten.

Upstox V3 documents daily candles since January 2000, but actual coverage depends on each stock's listing date and data quality. It does **not** document 15 years of 5-minute candles, expired option contracts or historical full order-book depth. Models must not claim such coverage.

The reported metrics are historical research evidence; corporate-action treatment, survivorship bias, fees, position constraints, walk-forward performance and genuinely forward-live verification must still be assessed.

## Verification
- Pull request CI tests Java backend, offline broker mocks, historical-data collector/model training on synthetic fixtures, JavaScript, Chrome interactions and the public Render demo.
- Production Upstox connectivity and real 10–15yr accuracy require the fresh credential **within your private execution environment** and genuine provider data. They cannot be inferred from the CI tests.
