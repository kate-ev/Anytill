# What a merchant pays: live quotes, 2026-11-13

Generated with `node scripts/merchant-quote.mjs 250`. Real 1Click API responses (`dry: true`: priced exactly like a live quote, but no deposit address is issued and no funds move). Re-run it to get today's numbers.

**How to read it.** EXACT_OUTPUT means the merchant always receives exactly 250.00 USDC. The spread is what the buyer sends above that, valued at CoinGecko mid-market. "Minimum input" is the least 1Click accepts for this quote; the "quoted input" adds a 1% slippage buffer that 1Click refunds to the buyer if it is not needed. The real cost lands between the two columns.

Live 1Click dry:true quotes for a $250.00 order (merchant receives exactly 250.00 USDC on NEAR), 2026-11-13T10:46:42.557Z.
Mid-market: CoinGecko /api/v3/simple/price, same run (USDC $0.999544, USDT $0.999243, ETH $1950.3, SOL $80.35, BTC $69264, NEAR $3.48, USDC $0.999544).

| Buyer pays with | Buyer sends (quote) | Spread at minimum input | Spread at quoted input (incl. 1% slippage buffer) | 1Click time estimate |
|---|---|---|---|---|
| USDC on Base | 252.553615 | 1 bps | 102 bps | ~35 s |
| USDT on Ethereum | 252.739747 | 5 bps | 107 bps | ~45 s |
| ETH on Arbitrum | 0.129753839750290719 | 26 bps | 127 bps | ~25 s |
| SOL on Solana | 3.148698524 | 23 bps | 125 bps | ~20 s |
| BTC on Bitcoin | 0.00365111 | 19 bps | 120 bps | ~805 s |
| NEAR on NEAR | 72.659047049210988724963591 | 18 bps | 119 bps | ~20 s |
