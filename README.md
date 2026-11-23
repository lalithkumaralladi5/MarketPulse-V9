# MarketPulse V9 — Hackathon ML Research Terminal

[![MarketPulse CI](https://github.com/lalithkumaralladi5/MarketPulse-V9/actions/workflows/ci.yml/badge.svg)](https://github.com/lalithkumaralladi5/MarketPulse-V9/actions/workflows/ci.yml)

**Hosted public showcase:** [marketpulse-hackathon.onrender.com](https://marketpulse-hackathon.onrender.com/) · [Health endpoint](https://marketpulse-hackathon.onrender.com/api/health)

**Important:** The public site is a **synthetic-data research showcase**, not live exchange data. Its ML predictor remains **NOT TRAINED** until a genuine authorized historical model is trained and privately deployed. Do not upload account credentials or market datasets to GitHub. The automated GitHub Actions checks cover Java, Python training, mock Upstox integration, the browser UI, and the public deployment status.



**Status: integrated runnable research application, not an exchange-certified trading platform.**

Built from the user's V8 Java project. Java serves the existing read-only Upstox instrument search, multi-page NSE/BSE market workspace, charting, options explorer, liquidity-flow schematic, heatmap, news, risk calculator, paper positions and Pulse Copilot. V9 adds a separate **ML Prediction Lab**, a real Python scikit-learn training pipeline with chronological holdout, and guarded inference through the Java backend.

No code in this project places broker orders. ML directional scores are **uncalibrated classification scores**, not verified trading-win probabilities. There is no claim of 93%/99% accuracy.

## Why public charts show DEMO instead of Upstox LIVE

The **public Render site intentionally has NO `UPSTOX_ACCESS_TOKEN`**. Its synthetic candles and BUY/SELL/EXIT annotations demonstrate interaction only. Never paste an Analytics Token into GitHub, frontend JavaScript, a public URL or a browser.

For your **private, real-data Windows session**:
1. Stop other MarketPulse servers using Ctrl+C. Port 8765 must be free.
2. Pull the latest source (`git pull`) and double-click **`run-upstox-windows.bat`**. This *Upstox-only* launcher requires the Analytics Token in a masked prompt and will not silently fall back to demo mode.
3. Open `http://127.0.0.1:8765/api/status`. Expect `"provider":"Upstox"`, `"mode":"LIVE"`, and `"upstoxTokenConfigured":true`. These indicators mean only that the token was supplied, not that it is valid.
4. Double-click **`verify-upstox-windows.bat`** to test an actual Upstox instrument search and read-only equity quote without displaying any credential.
5. Open `http://127.0.0.1:8765/#chart` and choose an NSE/BSE instrument. The chart labels should say `UPSTOX HISTORICAL`, never `SYNTHETIC`; quote freshness may correctly report STALE outside trading hours.

The Upstox **Analytics Token** (Bearer token) is different from your developer app's OAuth API key/client ID. This Java connector reads its **Analytics Token from a process-only environment variable**; there is no credential pasted into Java code. Historical chart annotations can be calculated from genuine completed candles even when markets are closed, but an actionable BUY/SELL recommendation stays blocked when freshness/market-session checks fail. Upstox WebSocket streaming is a separate future feature.

## One-click PRIVATE genuine-data ML training + Upstox charts

After **revoking any token exposed in a chat** and generating a fresh Analytics Token, install Java 21, Python 3.11+ and run `setup-ml-windows.bat` once.

For one continuous local run, double-click **`train-and-run-upstox-windows.bat`**. Supply 2–8 genuine NSE/BSE equity instrument keys (from Markets & Search) and enter the replacement token **only into the masked Windows prompt**. The launcher:
1. Refuses to overwrite an already-running server on port 8765.
2. Downloads genuine 15-minute history into ignored local `data/upstox_15m.csv`.
3. Trains the sklearn model and prints chronological untouched-holdout metrics. It does not claim a profitable edge.
4. Starts ML inference on private loopback without forwarding your broker token, then starts the Java dashboard with Upstox access in process memory.
5. Cleans the token environment variable when the Java session closes.

The inference bridge now excludes **incomplete candles** and rejects mismatched ML training/chart intervals. Outside market hours, historical chart markers may appear, but fresh actionable signals are gated. If the broker API denies access or has insufficient history, the workflow fails honestly; no fake-trained model is substituted.

The public Render URL **must remain DEMO**. Do **not** upload any Analytics Token to GitHub code, workflow artifacts or public hosting.

## One-click PRIVATE Upstox history + ML training (new)

**Revoke and replace the Analytics Token previously pasted into chat. Never commit tokens, model files or historical data. The public Render service is intentionally DEMO.**

On Windows, install Java JDK 21 and Python 3.11+, then run **setup-ml-windows.bat** once. Close older MarketPulse processes. Double-click **run-live-ml-windows.bat**, enter the *new* token in its masked local prompt, and the tool automatically:

1. Resolves genuine listed NSE equity instrument keys for RELIANCE, HDFCBANK, ICICIBANK, INFY, TCS, SBIN through Upstox instrument search.
2. Collects 100 days of real 15-minute OHLCV in permitted date chunks and saves it to the Git-ignored data folder. No synthetic fallback exists in this workflow.
3. Trains a locally stored sklearn model and shows chronological held-out metrics, including accuracy, balanced accuracy, macro F1 and majority baseline. These are NOT trading-profit estimates.
4. Starts the Python inference service on localhost:8766 **without the broker token in its environment**, then starts Java's read-only Upstox terminal on localhost:8765.
5. Opens **ML Prediction Lab**: choose a provider-listed NSE equity and the **15-minute** interval. The model can still report WAIT if the exchange is closed or the quote is stale.

If any real provider request fails, the script stops and explains the error; it never silently substitutes demo candles or a fake model. Trained models and private historical data remain on your PC and are excluded by Git. They do not automatically appear on the public Render site.

If you already have a locally trained model, **run-upstox-windows.bat** now starts Java and the Python ML service together; **verify-upstox-windows.bat** checks a real provider quote without displaying your token.

## Three-minute quick start — Windows

**Required:** Java JDK 21, Python 3.11+, Internet access for installing Python packages and provider feeds, modern Chrome/Edge.

1. Extract this ZIP, and open the inner `marketpulse_v9` folder.
2. Double-click `setup-ml-windows.bat` **once**. Wait for Python packages to install.
3. Double-click **`run-hackathon-windows.bat`**. Paste your read-only Upstox Analytics Token into the *masked local PowerShell prompt* (or press Enter for clearly labelled synthetic demo mode).
4. Open **http://127.0.0.1:8765**. Visit *Markets & Search* → search **RELIANCE** → click the equity → *Pro Chart* → *ML Prediction Lab*.
5. Until you train an ML model, the Lab must show **NOT TRAINED**. This is deliberate; there is no pretend prediction.

**Keep the Java and Python processes running while presenting.** Normal cash trading hours are approximately 09:15–15:30 IST on exchange trading days. After the close, actual candles can remain available but actionable live signals correctly switch to WAIT/STALE.

## 10–15 year DAILY history model + password-protected Render instructions

- Read [Private Render + long-history setup](PRIVATE_RENDER_AND_LONG_HISTORY.md) to learn where to paste a **replacement** Upstox token without exposing it in GitHub.
- Double-click **`train-long-history-windows.bat`** for genuine NSE/BSE equity **DAILY** candle collection over 10, 12 or 15 years and a separate chronological holdout ML evaluation.
- Actual history coverage is checked and displayed; no misleading 15-year model is claimed if the data span is shorter.
- Results remain on your computer in `ml/models/marketpulse_daily.json` and are exposed under a distinct **Long-Term Daily Study** label by the local ML Lab; the 15m predictor is separate.
- Public CI uses synthetic deterministic training **only**, never the credential posted in chat.

## Train the ML model on actual Upstox data

1. In Markets & Search, search for at least two actively traded NSE/BSE equities; copy the exact **instrument keys** from the search results, e.g. `NSE_EQ|INE002A01018` (example only; confirm from provider).
2. Double-click **`collect-and-train-windows.bat`**, enter 2–8 of those keys separated by commas, and paste the Analytics Token into its **masked** prompt.
3. The collector downloads up to 100 days of 15-minute provider candles into `data/upstox_15m.csv`. It requests 14-day chunks, deduplicates and does not persist the token. Respect provider rate limits, market-data entitlements and request errors.
4. The trainer computes **lagged-only** EMA gap, returns, RSI, ATR, relative volume, bar-body/range, rolling volatility, and rolling VWAP deviations. Target is **UP / FLAT / DOWN**, based on price movement across the next three 15-minute bars with a ±0.3% class boundary. That class boundary is **not** a guaranteed profitable threshold.
5. The model uses **65% chronological training, 17% validation, 18% untouched holdout testing** with a three-bar purge at the boundaries. It reports test accuracy, balanced accuracy, macro-F1, majority-class baseline, signal count and high-score classification precision.
6. Restart the launcher if needed; return to **ML Prediction Lab**, click *Check model*, select an actual exchange instrument and click **Analyze selected contract**. The inference model is **trained on equities** in this recommended flow. Applying it to options is an experimental out-of-distribution use; train on relevant historical option contracts and validate across expiries before trusting such results.

### Command-line training (advanced)

Run from the project folder, with the Upstox token supplied securely as `UPSTOX_ACCESS_TOKEN` only when collecting:

```sh
python -m pip install -r ml/requirements.txt
python -m ml.collect_upstox --keys 'NSE_EQ|INE002A01018' 'NSE_EQ|INE040A01034' --days 100 --interval 15 --out data/upstox_15m.csv
python -m ml.train --csv data/upstox_15m.csv --source UPSTOX_HISTORY --interval 15
python -m uvicorn ml.service:app --host 127.0.0.1 --port 8766
```

The exact trading symbols and example keys must be verified through the provider directory. **Never store your Analytics Token in source code, CSVs, screenshots, or chat messages.**

Model files are stored under `ml/models/`. Generated CSVs, model files and credentials are excluded by `.gitignore`; trained model source and test metrics can be discussed but should not be called validated profitability.

## Architecture

```
 Browser / separate workspaces
         │ HTTPS only when deployed
         ▼
 Java 21 HTTP server (:8765 locally)
    ├── Upstox REST adapter (instrument, option chain, candle, depth, news)
    ├── Guarded signal/risk/paper tools (NO broker orders)
    ├── ML proxy /api/ml/{status,predict} ───> Python FastAPI (:8766 LOOPBACK ONLY)
    │                                         └── Trained sklearn model + held-out metrics
    └── HTML/CSS/JavaScript charting and ML explanation UI
```

*Upstox V3 WebSocket/Protobuf streaming is **not yet implemented**; V9 live feeds use REST snapshots.* The current heatmap is a sample basket, not every NSE/BSE listing. The original canvas chart is interactive but not yet TradingView-equivalent. The liquidity-flow lines visualize **OI and resting order relationships**, not proven money transfers. AI news impact prediction is not yet implemented.

### Health and JSON endpoints

| Endpoint | Response |
|---|---|
| `/api/health` | Liveness for Docker/Render |
| `/api/status` | Broker connector/mode |
| `/api/ml/status` | ML availability, source and honest held-out evaluation |
| `/api/ml/predict?key=NSE_EQ%7C...&interval=15` | Guarded prediction using actual candles and **fresh quote gate** |
| `/api/universe/search?query=RELIANCE` | Upstox instrument directory |
| `/api/universe/chart?key=...&interval=15` | Instrument candles |
| `/api/universe/news?key=...` | Provider instrument news |

## Deploy to Render (public showcase / private live)

**Deployment files are included, but this ZIP is NOT an already deployed public website.** A Git repository and hosting account are required to create a genuine public URL.

1. Create a **private** GitHub repository and upload the inner `marketpulse_v9/` contents at the **repository root**, including `Dockerfile`, `render.yaml`, `start-cloud.sh`, and source files. Don't upload token files, history CSVs, or private trained model files accidentally.
2. Open https://dashboard.render.com/ → **New → Blueprint** and connect the repository. Render recognizes the included `render.yaml`. Alternatively create a Docker Web Service and set health check path to `/api/health`.
3. Wait for the build/health check. The resulting `*.onrender.com` HTTPS URL will show **DEMO / SYNTHETIC** by default, not false live prices. The Free tier may sleep after idle periods, causing cold starts.
4. For a **private** personal live-data session only, set `UPSTOX_ACCESS_TOKEN` as a secret environment variable in Render and a long random `MARKETPULSE_ACCESS_PASSWORD` (at least 16 characters), and confirm any Upstox/exchange redistribution, licensing and data-protection restrictions. The app refuses publicly bound live mode without that password. Browser HTTP Basic login user is `marketpulse`, password is the `MARKETPULSE_ACCESS_PASSWORD` secret. Use Render HTTPS, never plain HTTP. Do **not** share that private live-data URL or password with judges.
5. Deploying a **trained ML model** also requires placing the **trusted locally trained** model artifact under `ml/models/` in a controlled private deployment or providing a trusted persistent path (default model files are excluded from Git). Public untrained instances correctly show **NOT TRAINED**. Do not ship a synthetic test model as if it were an exchange-trained model.

To show judges live exchange data without redistribution, present the **private local Windows screen** with your own authorized feed and keep the public URL as a separate clearly marked functional showcase. The dashboard itself is read-only and does not execute trades.

**Safety:** Authenticated exchange subscriptions, platform terms, historical entitlements, request quotas and market hours are controlled by the provider. Never advertise support beyond actual returned instruments. The auth guard protects the whole UI and API when password is configured; `/api/health` remains unauthenticated for hosting probes.

## Testing

```sh
javac --release 21 -d backend/classes backend/*.java
node --check frontend/app.js && node --check frontend/terminal.js && node --check frontend/ml-panel.js
python tests/check_ml.py
python tests/check_demo.py
python tests/check_v8_services.py
python tests/check_copilot.py
```

The ML test **only** trains on synthetic fixtures and deletes that model afterwards; it proves pipeline execution, not financial performance. Tests use mocked provider responses, not production Upstox access. This environment blocks automated browser navigation, so full UI click-by-click testing must be completed on Windows before presentation.

## Remaining work before trading or claiming superior performance

Real Upstox end-to-end verification with your account, reliable stream/reconnect and subscriptions, full market-universe filtering, professional charting library integration, news-event ML with timestamps, option-specific cross-expiry datasets, walk-forward multiple folds, model score calibration, realistic fee/slippage/tax backtesting, model monitoring and a substantial forward paper-trading study. **Never risk your hackathon prize on this model until those tests establish a reliable edge.**
