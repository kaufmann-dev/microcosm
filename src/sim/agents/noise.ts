import type { Rng } from "../rng";
import { type Agent, type AgentContext, equityScale } from "./base";
import type { Side } from "../types";

/**
 * Noise trader: uninformed flow. Random side, mostly small passive orders near
 * the touch, occasionally a market order. Noise traders keep volume flowing,
 * feed the market makers, and give evolved strategies something to exploit.
 */
export class NoiseTrader implements Agent {
  readonly kind = "noise" as const;
  readonly name: string;
  readonly cadence: number;

  private readonly baseQty: number;
  private readonly marketOrderProb: number;

  constructor(
    readonly id: number,
    index: number,
    rng: Rng,
    private readonly endowEquity: number,
  ) {
    this.name = `NSE-${index + 1}`;
    this.cadence = rng.int(3, 8);
    this.baseQty = Math.round(rng.range(2, 8));
    this.marketOrderProb = rng.range(0.15, 0.4);
  }

  act(ctx: AgentContext): void {
    // Refresh stale resting orders occasionally.
    if (ctx.rng.bool(0.3)) ctx.cancelAll();

    const side: Side = ctx.rng.bool() ? "buy" : "sell";
    const scale = equityScale(ctx.equity, this.endowEquity);
    const qty = Math.max(1, Math.round(this.baseQty * scale * ctx.rng.range(0.5, 1.5)));
    const mid = ctx.f.mid;

    if (ctx.rng.bool(this.marketOrderProb)) {
      ctx.submit(side, "market", 0, qty);
    } else {
      const off = Math.round(mid * ctx.rng.range(0, 0.004)) + ctx.rng.int(0, 3);
      const price = side === "buy" ? (ctx.bestBid ?? mid) - off : (ctx.bestAsk ?? mid) + off;
      ctx.submit(side, "limit", price, qty);
    }
  }
}
