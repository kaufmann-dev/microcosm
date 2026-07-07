import type { Rng } from "../rng";
import { type Agent, type AgentContext, equityScale } from "./base";

/**
 * Value trader. Forms a noisy private estimate of the fundamental (persistent
 * personal bias plus fresh observation noise) and trades when price deviates
 * beyond an entry threshold. Deep discounts are hit with market orders,
 * shallow ones worked passively at the touch. Fundamentalists are the market's
 * anchor: they pull price back toward value — unless trend-followers overwhelm them.
 */
export class Fundamentalist implements Agent {
  readonly kind = "fundamentalist" as const;
  readonly name: string;
  readonly cadence: number;

  private readonly bias: number;
  private readonly obsNoise: number;
  private readonly entry: number;
  private readonly baseQty: number;

  constructor(
    readonly id: number,
    index: number,
    rng: Rng,
    private readonly endowEquity: number,
  ) {
    this.name = `VAL-${index + 1}`;
    this.cadence = rng.int(6, 16);
    this.bias = 1 + rng.gauss() * 0.012;
    this.obsNoise = rng.range(0.004, 0.015);
    this.entry = rng.range(0.006, 0.03);
    this.baseQty = Math.round(rng.range(4, 12));
  }

  act(ctx: AgentContext): void {
    const estimate = ctx.fundamental * this.bias * Math.exp(this.obsNoise * ctx.rng.gauss());
    const mid = ctx.f.mid;
    if (mid <= 0) return;
    const gap = estimate / mid - 1; // positive = market looks cheap

    ctx.cancelAll();
    if (Math.abs(gap) < this.entry) return;

    const scale = equityScale(ctx.equity, this.endowEquity);
    const conviction = Math.min(3, Math.abs(gap) / this.entry);
    const qty = Math.max(1, Math.round(this.baseQty * conviction * scale));
    const urgent = Math.abs(gap) > this.entry * 2.5;

    if (gap > 0) {
      if (urgent) ctx.submit("buy", "market", 0, qty);
      else ctx.submit("buy", "limit", (ctx.bestBid ?? mid - 2) + 1, qty);
    } else {
      if (urgent) ctx.submit("sell", "market", 0, qty);
      else ctx.submit("sell", "limit", (ctx.bestAsk ?? mid + 2) - 1, qty);
    }
  }
}
