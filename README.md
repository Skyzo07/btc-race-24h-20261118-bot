# Dip-Bounce Rider — BTC trading bot

Entry for [make.fun btc-race-24h-20261118-1444](https://make.fun/bounty/btc-race-24h-20261118-1444)
— "Race a BTC trading bot live for 24 hours".

[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/skyzo07/btc-race-24h-20261118-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/skyzo07/btc-race-24h-20261118-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

## Strategy

A long-only, few-trades bot for cbBTC/USDC on the `agent-fun/bars-replay/v1`
protocol (`main.ts`, Node 22, TypeScript with erasable syntax only).

A full round trip costs ~26 bps in fees, slippage and price impact, while
one-minute noise is only ~6 bps — so the bot trades rarely and never chases
wiggles:

- **Entry (dip-bounce):** only when the close is at least 1.2% below the
  trailing 240-bar high **and** at least 0.2% above the trailing 30-bar low —
  i.e. after a dip has happened and price has started bouncing back, never
  while it is still falling. Buys 100% of cash.
- **Exits (mechanical):** take profit at +1.5% over the true average cost
  (fees included), stop at −1.0%, or a trailing exit 0.8% below the best
  close since entry.
- **Discipline:** no new entries after bar 1200, so every trade has time to
  develop an exit before the harness flattens at the end. One position, at
  most one order per batch, all comparisons in integer bigint arithmetic —
  no floats, no clock, no randomness, fully deterministic.

## Dev grade (kit's dev window, `grade-local`, process driver)

- **Net PnL: +$10.15 USDC** (return +1.01%), fees $1.62
- 4 trades, win rate 50%, max drawdown 1.02%, Sharpe 0.020
- Guardrails met; L1 regrade reproduced byte for byte

The dev gate requires net PnL above $0; this entry clears it with margin
while staying far under the 25% drawdown guardrail.

## Layout

- `main.ts` — the bot (entrypoint, run with `node /bot/main.ts`)
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's SDK shim
- `LICENSE` — MIT
