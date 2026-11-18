# MarketPulse V8 — Engineering roadmap (work in progress)

V8 builds on the earlier 8-workspace option terminal with general NSE/BSE instrument search, generic equities/futures/indices/options charts, an adjustable chart workspace, sampled equity heatmap, and instrument news. Quote and candle APIs are polled, not streamed; model accuracy and institutional order flow are not verified. See README.md for this release’s actual implementation, test results and caveats.

# MarketPulse engineering roadmap & definition of success

## North star

Make a **fast, reproducible, explainable options research terminal**. Speed, aesthetics and intelligence all matter, but the measurable product quality bar is: every price has a source and timestamp, every signal explains its inputs, every historical claim has a dataset and evaluation rule, and no action is possible on stale or unverified data.

## Progress

- **V3:** running local Java dashboard, synthetic option chain, initial momentum/risk checks, manual paper positions.
- **V4:** Upstox Analytics Token optional read-only **REST** integration, mapping chain instrument keys, quote timestamps, five-level book, five-minute option candles, error/staleness gates. Connected live-token use still awaiting verified access.
- **V5:** research cockpit, open interest landscape, actual-lot-size risk calculator, fixed-rule replay diagnostic, local Pulse Copilot, optional opt-in cloud LLM, local JSON analyst export, tests and responsive UI.
- **V7:** separate workspaces, reference-inspired CE/PE OI-flow schematic and option contract chart.
- **V8:** provider-key-driven NSE/BSE search and option explorer, equity heatmap sample, adjustable generic chart, watchlist/drawings/alerts and instrument-specific news. Production API/browser acceptance not yet verified.

## Next milestones with objective release gates

### M1: Truthful market-data layer

- Verify real Upstox NSE NIFTY CE/PE access against an activated account and live-session recordings.
- Log data provenance per tick, contract key, exchange timestamp, receipt time and subscription state (without saving credentials).
- Implement Upstox V3 WebSocket Protobuf decoder, reconnect/backoff, session handover, dropped-message detection and idempotent updates.
- Maintain a separate clock/state machine for premarket, market hours, exchange holidays and stale/out-of-session data.
- Gate: No silent synthetic fallback, stale quote cannot generate an actionable setup, observed quote snapshots reconcile with authorized provider source.

### M2: Research data warehouse

- Versioned historical NIFTY spot/futures and full options series across many expiries/strikes, with bid/ask, volume, OI, Greeks where contract history is available.
- Corporate/exchange calendar, lot sizes, strikes, expiries, contract lifecycle, fees/slippage assumptions, missingness and corrections.
- Gate: A reproducible query replays the same timestamp-aligned sample with no forward information.

### M3: Rigorous strategy validation

- Specify prediction target: direction in next N bars, barrier hit before stop, or positive net P&L at an executable fill. Do not conflate these with signal *alignment*.
- Walk-forward, chronological, expiry-group splits with purging/embargo for overlapping horizons, strict no-leak training.
- Baselines: random, always-WAIT, simple EMA/VWAP, momentum+depth, price-only vs option-OI augmentations.
- Performance metrics: precision and recall by CE/PE, fraction of bars entering, win rate with confidence interval, net expectancy after brokerage/slippage/taxes, Sharpe and max drawdown, Brier/calibration if probabilities are output.
- Reject a 93% accuracy claim if labels, sample size, out-of-sample dates, trade ledger, cost model or drawdown are missing.
- Gate: A nontrivial edge holds across independent market regimes after costs with a reproducible test ledger. High win rate alone is insufficient.

### M4: AI assistant and operator UX

- Optional cloud LLM reads only a read-only, structured snapshot with citations/provenance and controlled tool schema; no arbitrary network/broker commands.
- Time-series anomaly explanations, key level heatmap and watchlist alerts with clear confidence calibration; A/B usability checks.
- User permission model and consent for any future data transfer or stored audit logs.
- Gate: AI outputs never invent live quotes, never output tokens, and explicitly mark uncertain or missing data.

### M5: Controlled validation in paper mode

- Record every signal timestamp and source; no hindsight changes to historical signals; evaluate theoretical vs executable prices.
- Paper ledger with recorded fees, lot size, capital allocation, liquidity and stress limits.
- Gate: 4–8+ weeks of forward paper monitoring across sessions, reviewed failures, clear risk kill-switch. This is a testing horizon, not a promise of future work performed automatically.

### M6: Production hardening (only after tests)

- Observability, CI, reproducible builds, errors and outages, hardened secrets management, audit, throttling, secure UI auth if accessible beyond localhost, threat modelling and applicable Indian regulatory/broker conditions.
- Broker order execution is **not** planned in this prototype and requires a separate, explicitly authorized safety review.

## Truth-in-advertising product rules

- No "99% accurate" or "win probability" badge without reproducible, independently evaluated evidence.
- No claim that a moving line shows *institutional liquidity* unless the data supports that precise measurement.
- No use of "AI" for a deterministic rule engine without labeling the distinction.
- If live data fails, show unavailable and stop trading setups; never substitute demo while retaining a LIVE badge.
- No credential ever entered into frontend JS, query strings, source control or chats.
