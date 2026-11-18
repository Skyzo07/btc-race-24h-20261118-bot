// Dip-Bounce Rider — btc-race-24h-20261118-1444
//
// Strategy reasoning (why this shape, not a tuned curve-fit):
// - A full round trip here costs ~26 bps in fees, slippage and price impact,
//   while one-minute noise is only ~6 bps. Chasing every wiggle pays the
//   round-trip cost many times over and loses. So this bot trades rarely:
//   a handful of full-size entries, each held until a clear exit.
// - The dev window falls ~2.8% peak-to-trough with two sharp legs down and a
//   choppy recovery in between, so blind buy-and-hold loses. The bot therefore
//   only buys AFTER a dip has happened AND price has started bouncing back
//   (close back above its trailing 30-bar low), never while it is still
//   falling. It never buys the top of a range: entry needs the close at least
//   1.2% below the trailing 240-bar high.
// - Exits are mechanical and need no prediction: take profit at +1.5% over the
//   true average cost (fees included), stop at -1.0%, or a trailing exit 0.8%
//   below the best close since entry, so a winning trade is not given back
//   when the window turns down again. No new entries after bar 1200, so every
//   trade has time to develop an exit before the harness flattens at the end.
// - Long only, one position, at most one order per batch, all comparisons in
//   integer bigint arithmetic (no floats, no clock, no randomness), so the two
//   graded runs are byte-identical.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Entry: close >= 1.2% below the trailing 240-bar high, and >= 0.2% above
// the trailing 30-bar low (the bounce confirmation).
const DIP_BPS = 120;
const BOUNCE_BPS = 20;
const HIGH_LOOKBACK = 240;
const LOW_LOOKBACK = 30;
// Exits, measured against the true average cost price (fees included).
const TAKE_PROFIT_BPS = 150;
const STOP_BPS = 100;
// Trailing exit: sell when the close falls 0.8% below the best close seen
// since this position was entered.
const TRAIL_BPS = 80;
// No new entries after this batch index (0-based): leaves room for an exit.
const NO_NEW_AFTER = 1200;
// Slippage guard: a fill more than 1% away from the latest close is refused
// by the market; 1% is far above the ~0.26% round-trip cost, so it only
// blocks genuine gaps, never normal fills.
const MAX_SLIPPAGE_BPS = 100;

const BPS = 10000n;

// All closes seen so far for CBBTC, as raw price bigints (price_scale 8).
const closes: bigint[] = [];
// Best close since the current position was entered (null while flat).
let peakSinceEntry: bigint | null = null;

/** Average cost price of the open position, in raw price units, or null. */
function avgCostPrice(state: BarsState): bigint | null {
  const pos = state.positions.get(SYMBOL);
  if (pos === undefined || pos.qty === 0n) return null;
  const sym = state.symbols.get(SYMBOL);
  if (sym === undefined) return null;
  const scale = BigInt(sym.qty_scale + sym.price_scale - state.hello.capital.quote_scale);
  return (pos.cost * 10n ** scale) / pos.qty;
}

function trailingHigh(n: number): bigint {
  let hi = 0n;
  for (let i = Math.max(0, closes.length - n); i < closes.length; i++) {
    if (closes[i]! > hi) hi = closes[i]!;
  }
  return hi;
}

function trailingLow(n: number): bigint {
  let lo = 0n;
  for (let i = Math.max(0, closes.length - n); i < closes.length; i++) {
    if (lo === 0n || closes[i]! < lo) lo = closes[i]!;
  }
  return lo;
}

await runBars({
  onBatch(state): OrderInput[] {
    // Orders decided on a warm-up batch are rejected by the market: never
    // send them. (An order on the very last batch is likewise rejected by
    // the harness, harmlessly, so no end-of-window special case is needed.)
    if (state.warmingUp) return [];
    const batch = state.latest.get(SYMBOL);
    // No fresh bar for CBBTC this minute: act on nothing stale.
    if (batch === undefined || batch.t !== state.t) return [];
    const close = BigInt(batch.c);
    closes.push(close);

    const pos = state.positions.get(SYMBOL);
    const qty = pos === undefined ? 0n : pos.qty;

    if (qty > 0n) {
      // Holding: maintain the trailing peak and check the three exits.
      if (peakSinceEntry === null || close > peakSinceEntry) peakSinceEntry = close;
      const cost = avgCostPrice(state);
      if (cost === null || peakSinceEntry === null) return [];
      const takeProfit = (cost * (BPS + BigInt(TAKE_PROFIT_BPS))) / BPS;
      const stop = (cost * (BPS - BigInt(STOP_BPS))) / BPS;
      const trail = (peakSinceEntry * (BPS - BigInt(TRAIL_BPS))) / BPS;
      if (close >= takeProfit || close <= stop || close <= trail) {
        peakSinceEntry = null;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: only a confirmed dip-bounce entry, with enough history and time.
    peakSinceEntry = null;
    if (closes.length < HIGH_LOOKBACK || state.seq > NO_NEW_AFTER) return [];
    const high = trailingHigh(HIGH_LOOKBACK);
    const low = trailingLow(LOW_LOOKBACK);
    const dipped = close * BPS <= high * (BPS - BigInt(DIP_BPS));
    const bouncing = close * BPS >= low * (BPS + BigInt(BOUNCE_BPS));
    if (!dipped || !bouncing) return [];

    const room = state.weightRoom(SYMBOL);
    const spend = state.cash < room ? state.cash : room;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    peakSinceEntry = close;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
