# MarketPulse — Hackathon Submission Notes

**Project:** MarketPulse V9 — Explainable Indian Market Intelligence Terminal

**One-line pitch:** "Explore actual NSE/BSE instruments, visualize their charts, options and market context, then apply a time-tested ML research model that shows its evidence and abstains when data is stale."

## 90-second demonstration sequence

1. **Markets & Search:** Search RELIANCE, choose the NSE equity, open interactive chart. Explain that the instrument key comes from the authorized Upstox API, not a fake ticker lookup.
2. **Chart workspace:** Toggle 1/3/5/15/30/60-minute views; draw a horizontal line; crosshair and zoom; inspect top-five bid/ask depth and age of quote.
3. **Option chain:** Open an eligible underlying expiry and a CE/PE strike; click the contract to open its own premium chart.
4. **Heatmap / Flow map:** Show clickable equity tiles and the option OI network. Be explicit that the lines are visual representations of resting interest/OI, not hidden-money transfer claims.
5. **ML Prediction Lab:** Show training source, untouched holdout results, majority baseline and guarded UP/DOWN/NO_EDGE signals (only if real data was collected and the model genuinely trained). When no model exists, point out the explicit NOT TRAINED state.
6. **Risk/Pulse Copilot:** Demonstrate read-only explanations, risk sizing and paper trading. No real-order permissions exist.

## Judge questions and accurate answers

**Is this actually live?** With an authorized Upstox token during market hours, API snapshots of actual quotes and candles are used. It is NOT yet a WebSocket-per-tick system. Cloud public preview has *synthetic demo mode* by default.

**Does ML predict with 93% accuracy?** No verified claim. The model reports chronological test metrics, a majority-class baseline and abstains without a real trained model. Actual profitability is not established.

**Can it place trades?** No. Read-only analytics and manual paper positions only.

**Can you show a deployed URL?** Only after uploading this repository to GitHub and completing the Render deployment. `render.yaml` and `Dockerfile` are included, but a URL is not automatically created by this ZIP.

**What is the novelty?** A unified, explainable workflow integrating instrument search, market microstructure proxies, technical studies, risk gating, historical evaluation and no-fabrication data states.

## Three-day focus list

- **Day 1:** Install Python/Java, launch with Upstox, choose valid NSE/BSE keys, collect historical bars, train ML, record genuine holdout results.
- **Day 2:** Verify every user interaction on the Windows system, resolve live provider edge cases, and push code to private GitHub + Render for a publicly labeled demo.
- **Day 3:** Practice the demo on actual available market data, record a backup screen walkthrough with date/source labels, rehearse precise answers to judge questions. Test offline/closed-market fallback.

**Avoid:** Fake accuracies, disclosing tokens, public redistribution of personal broker data, and promises of profitable trades.
