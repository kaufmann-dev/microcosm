import type { Features } from "../features";
import type { Rng } from "../rng";
import type { AgentKind, OrderType, Side } from "../types";

/** Everything an agent may see and do during one action slot. */
export interface AgentContext {
  tick: number;
  f: Features;
  /** True fundamental value in ticks. Strategies add their own noise. */
  fundamental: number;
  cash: number;
  pos: number;
  equity: number;
  bestBid: number | undefined;
  bestAsk: number | undefined;
  last: number;
  rng: Rng;
  submit(side: Side, type: OrderType, price: number, qty: number): void;
  cancelAll(): void;
}

export interface Agent {
  readonly id: number;
  readonly kind: AgentKind;
  readonly name: string;
  /** The engine wakes the agent roughly every `cadence` ticks. */
  readonly cadence: number;
  act(ctx: AgentContext): void;
}

/** Scale order sizes by how much equity remains vs. the starting endowment. */
export function equityScale(equity: number, endowEquity: number): number {
  if (endowEquity <= 0) return 0.1;
  return Math.min(2, Math.max(0.1, equity / endowEquity));
}
