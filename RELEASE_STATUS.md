# Release audit — 18 November 2026

**Working in local tests:** Java 21 compilation; demo and Upstox-mock option contracts; generic NSE/BSE instrument lookup; candles/quotes/depth/news mapping; synthetic/demo safeguards; risk and Copilot guardrails; locally trained sklearn ML model; held-out metrics; ML API; guarded Java ML proxy; container launcher and health endpoint.

**Not verified yet:** production Upstox REST using the user's real token; production Docker build/Render deployment; click-by-click browser QA (managed Chromium blocks localhost); actual ML accuracy on real historical data; any profitable trading performance; live WebSocket V3 streaming; any real-money order capability.

**Data rule:** no actual historical or live market data was provided to this build environment. Synthetic fixtures used in tests were **not** included as a trained model. `ml/models/` intentionally contains no model artifact; the first real model must be trained by the user using their authorized data.

**Deployment rule:** `render.yaml` is a deployable configuration; the service has NOT been created on Render in this session. Public deploy defaults to SYNTHETIC DEMO. Authorized live hosting must remain private and password-protected, subject to broker/exchange terms.
