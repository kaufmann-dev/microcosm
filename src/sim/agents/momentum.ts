import type { Rng } from "../rng";
import { type Agent, type AgentContext, equityScale } from "./base";

/**
 * Trend follower. Reads the EMA ratio and medium-horizon return; buys strength
 * and sells weakness with aggressiveness proportional to signal size.
 * Chartists are the market's destabilizer — they amplify moves fundamentalists
 * would otherwise dampen, and their crowding is what turns shocks into bubbles
 * and cascades.
 */
export class Momentum implements Agent {
  readonly kind = "momentum" as const;
  readonly name: string;
  readonly cadence: number;

  private readonly threshold: number;
  private readonly aggression: number;
  private readonly baseQty: number;
  private readonly horizonWeight: number;

  constructor(
    readonly id: number,
    index: number,
    rng: Rng,
    private readonly endowEquity: number,
  ) {
    this.name = `MOM-${index + 1}`;
    this.cadence = rng.int(4, 12);
    this.threshold = rng.range(0.0015, 0.008);
    this.aggression = rng.range(0.25, 0.85);
    this.baseQty = Math.round(rng.range(4, 12));
    this.horizonWeight = rng.next();
  }

  act(ctx: AgentContext): void {
    const signal = this.horizonWeight * ctx.f.emaRatio + (1 - this.horizonWeight) * ctx.f.ret64;
    ctx.cancelAll();
    if (Math.abs(signal) < this.threshold) return;

    const scale = equityScale(ctx.equity, this.endowEquity);
    const strength = Math.min(3, Math.abs(signal) / this.threshold);
    const qty = Math.max(1, Math.round(this.baseQty * strength * scale));
    const takeLiquidity = ctx.rng.bool(this.aggression);
    const mid = ctx.f.mid;

    if (signal > 0) {
      if (takeLiquidity) ctx.submit("buy", "market", 0, qty);
      else ctx.submit("buy", "limit", (ctx.bestBid ?? mid - 2) + 1, qty);
    } else {
      if (takeLiquidity) ctx.submit("sell", "market", 0, qty);
      else ctx.submit("sell", "limit", (ctx.bestAsk ?? mid + 2) - 1, qty);
    }
  }
}
