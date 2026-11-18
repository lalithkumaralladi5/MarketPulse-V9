# MarketPulse V9 — Hackathon ML Research Terminal

**Status:** Repository initialized. Full application source upload is pending; see the [V9 release archive](https://chatgpt.com/) shared in our ChatGPT conversation. **This repository is not yet a deployed application.**

MarketPulse is a Java 21 + browser-based Indian equities/options research terminal, with a Python scikit-learn ML service and an optional read-only Upstox data adapter. It does **not** submit trades.

## Repository setup

The intended source root contains `Dockerfile`, `render.yaml`, `start-cloud.sh`, `backend/`, `frontend/`, `ml/`, and `tests/`. Once uploaded, read the included `README.md` for full Windows setup, data permissions, ML training, and deployment.

For local Windows development you need Java JDK 21, Python 3.11+, and Git. The live API token must be entered **only in a masked local prompt**; it must never be committed.

## Hackathon requirements

- Preserve the distinction between synthetic demo data and authorized live Upstox market data.
- ML is **untrained** by default. Train only using historical market data and report untouched holdout metrics. Do not claim trading profitability from classification accuracy.
- Public hosting may use only the clearly labeled demo mode unless exchange licensing and secure access controls permit otherwise.
- Never commit `.env`, API tokens, downloaded private market history, or generated ML model artifacts.
- The project is a research and paper-testing tool, not investment advice or an exchange-certified trading platform.

## Deployment

After the full source is committed: connect this repo to [Render](https://dashboard.render.com/) and use its included `render.yaml` Blueprint configuration. Confirm the public demo's health endpoint is `/api/health`. Public demo mode should not have an Upstox token configured.

**Full source still needs to be pushed into this repository; the presence of this README alone does not mean deployment is complete.**
