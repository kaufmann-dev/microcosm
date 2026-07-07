import type { Rng } from "../rng";
import type { Genome } from "../gp/genome";
import { evalTree, type GpInputs } from "../gp/nodes";
import { type Agent, type AgentContext, equityScale } from "./base";

/**
 * A trader whose entire strategy is an evolved program. The expression tree
 * maps standardized market features to a signal; execution genes decide
 * thresholds, sizing, patience, and aggression. Fitness is measured by the
 * engine over each generation window; losers are liquidated and replaced by
 * offspring of winners.
 */
export class EvolvedTrader implements Agent {
  readonly kind = "evolved" as const;
  name: string;

  genome: Genome;
  generationBorn: number;
  /** Equity at the start of the current evaluation window (set by the engine). */
  startEquity = 0;
  peakEquity = 0;
  maxDrawdown = 0;
  fitness = 0;
  /** Private observation noise on the fundamental — evolution can't see truth. */
  private readonly obsNoise: number;

  constructor(
    readonly id: number,
    serial: number,
    genome: Genome,
    generationBorn: number,
    rng: Rng,
    private readonly endowEquity: number,
    private readonly maxOrderQty: number,
  ) {
    this.name = `GP-${serial}`;
    this.genome = genome;
    this.generationBorn = generationBorn;
    this.obsNoise = rng.range(0.006, 0.02);
  }

  get cadence(): number {
    return this.genome.cadence;
  }

  /** Standardize features to O(1) so constants and features share a scale. */
  buildInputs(ctx: AgentContext): GpInputs {
    const noisyF = ctx.fundamental * Math.exp(this.obsNoise * ctx.rng.gauss());
    const equity = Math.max(1, ctx.equity);
    return {
      ret1: Math.tanh(ctx.f.ret1 * 300),
      ret8: Math.tanh(ctx.f.ret8 * 120),
      ret64: Math.tanh(ctx.f.ret64 * 40),
      emaRatio: Math.tanh(ctx.f.emaRatio * 100),
      vol: Math.min(3, ctx.f.vol * 400),
      spreadRel: Math.min(3, ctx.f.spreadRel * 200),
      imbalance: ctx.f.imbalance,
      tapePressure: ctx.f.tapePressure,
      valueGap: Math.tanh((noisyF / Math.max(1, ctx.f.mid) - 1) * 20),
      inv: Math.max(-2, Math.min(2, ctx.pos / 150)),
      cashFrac: Math.max(-1, Math.min(1, ctx.cash / equity - 0.5)),
    };
  }

  act(ctx: AgentContext): void {
    const signal = evalTree(this.genome.tree, this.buildInputs(ctx));
    const g = this.genome;

    ctx.cancelAll();
    let side: "buy" | "sell";
    let strength: number;
    if (signal >= g.buyThr) {
      side = "buy";
      strength = Math.min(2, signal / g.buyThr);
    } else if (signal <= g.sellThr) {
      side = "sell";
      strength = Math.min(2, signal / g.sellThr);
    } else {
      return;
    }

    const scale = equityScale(ctx.equity, this.endowEquity);
    const qty = Math.max(1, Math.round(this.maxOrderQty * g.sizeFrac * strength * 0.5 * scale));
    if (ctx.rng.bool(g.aggression)) {
      ctx.submit(side, "market", 0, qty);
    } else {
      const mid = ctx.f.mid;
      const price =
        side === "buy"
          ? (ctx.bestBid ?? mid - 2) + 1 - g.offsetTicks
          : (ctx.bestAsk ?? mid + 2) - 1 + g.offsetTicks;
      ctx.submit(side, "limit", price, qty);
    }
  }

  /** Called by the engine at the start of each evaluation window. */
  beginWindow(equity: number): void {
    this.startEquity = equity;
    this.peakEquity = equity;
    this.maxDrawdown = 0;
  }

  /** Called periodically by the engine to track intra-window drawdown. */
  sampleEquity(equity: number): void {
    if (equity > this.peakEquity) this.peakEquity = equity;
    if (this.peakEquity > 0) {
      this.maxDrawdown = Math.max(this.maxDrawdown, 1 - equity / this.peakEquity);
    }
  }
}
