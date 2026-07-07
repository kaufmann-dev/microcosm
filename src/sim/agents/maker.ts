import type { Rng } from "../rng";
import { type Agent, type AgentContext, equityScale } from "./base";

/**
 * Inventory-aware market maker. Requotes a two-level ladder around the mid on
 * every wake-up. The half-spread widens with realized volatility; the quote
 * center is skewed against inventory so the maker sheds risk (a crude
 * Avellaneda–Stoikov). Makers are the market's liquidity backbone — when
 * volatility spikes they widen and thin out, which is exactly how real
 * liquidity evaporates in a crash.
 */
export class MarketMaker implements Agent {
  readonly kind = "maker" as const;
  readonly cadence = 2;
  readonly name: string;

  private readonly baseHalfSpreadBps: number;
  private readonly volMult: number;
  private readonly skew: number;
  private readonly size: number;
  private readonly maxInv: number;

  constructor(
    readonly id: number,
    index: number,
    rng: Rng,
    private readonly endowEquity: number,
  ) {
    this.name = `MM-${index + 1}`;
    this.baseHalfSpreadBps = rng.range(7, 22);
    this.volMult = rng.range(0.6, 1.8);
    this.skew = rng.range(0.4, 1.2);
    this.size = Math.round(rng.range(6, 14));
    this.maxInv = Math.round(rng.range(90, 160));
  }

  act(ctx: AgentContext): void {
    ctx.cancelAll();
    const mid = ctx.f.mid;
    if (mid <= 0) return;

    const scale = equityScale(ctx.equity, this.endowEquity);
    const halfSpread = Math.max(
      1,
      mid * (this.baseHalfSpreadBps / 10_000) * (1 + this.volMult * ctx.f.vol * 900),
    );
    // Skew the quote center against inventory: long → quote lower to sell off.
    const center = mid - this.skew * (ctx.pos / this.maxInv) * halfSpread * 2;

    const qty = Math.max(1, Math.round(this.size * scale));
    for (let level = 0; level < 2; level++) {
      const off = halfSpread * (1 + level * 0.9);
      if (ctx.pos < this.maxInv) {
        ctx.submit("buy", "limit", Math.round(center - off), qty);
      }
      if (ctx.pos > -this.maxInv) {
        ctx.submit("sell", "limit", Math.round(center + off), qty);
      }
    }
  }
}
