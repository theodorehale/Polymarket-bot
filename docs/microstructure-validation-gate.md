# Microstructure validation gate

This branch is **paper/read-only**. Before merge:

1. GitHub Actions must execute `.github/workflows/microstructure-validation.yml`.
2. `npm ci` must succeed.
3. `npm run build` must succeed.
4. `npx vitest run src/microstructure` must succeed.
5. A real-feed smoke run must confirm the Binance public trade stream and Polymarket RTDS payload/subscription semantics.
6. No synthetic placeholder book may enter observations, fills, markouts, or P&L.
7. No wallet, signing, broadcasting, or live-order path is permitted.

If CI does not start, treat validation as **UNVERIFIED**, not PASS.

Local fallback:
```bash
npm ci
npm run microstructure:validate
```
