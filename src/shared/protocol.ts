import type { WorldConfig } from "../sim/config";
import type { GNode } from "../sim/gp/nodes";
import type { StylizedFacts } from "../sim/stats";
import type { AgentKind, BookLevel, Candle, Trade } from "../sim/types";

export interface AgentRow {
  id: number;
  name: string;
  kind: AgentKind;
  equity: number;
  cash: number;
  pos: number;
  volume: number;
  blowups: number;
  /** Evolved-only extras. */
  fitness?: number;
  generationBorn?: number;
  lineage?: number;
}

export interface GenStat {
  gen: number;
  best: number;
  mean: number;
  meanNodes: number;
  bestName: string;
}

export interface HallOfFameEntry {
  name: string;
  gen: number;
  fitness: number;
  formula: string;
  tree: GNode;
}

export interface EventMsg {
  tick: number;
  kind: "shock" | "bankruptcy" | "generation" | "info";
  text: string;
}

export interface GenomeDetail {
  tree: GNode;
  formula: string;
  buyThr: number;
  sellThr: number;
  sizeFrac: number;
  offsetTicks: number;
  aggression: number;
  cadence: number;
  lineage: number;
  fitness: number;
  generationBorn: number;
}

export interface SelectedDetail {
  id: number;
  name: string;
  kind: AgentKind;
  equity: number;
  cash: number;
  pos: number;
  volume: number;
  blowups: number;
  genome: GenomeDetail | null;
}

export interface KindEquityPoint {
  tick: number;
  maker: number;
  fundamentalist: number;
  momentum: number;
  noise: number;
  evolved: number;
}

export interface WorldSnapshot {
  tick: number;
  running: boolean;
  /** Measured simulation throughput, ticks per second. */
  tps: number;
  generation: number;
  fundamental: number;
  last: number;
  bestBid: number | undefined;
  bestAsk: number | undefined;
  candles: Candle[];
  bids: BookLevel[];
  asks: BookLevel[];
  tape: Trade[];
  agents: AgentRow[];
  genStats: GenStat[];
  hallOfFame: HallOfFameEntry[];
  facts: StylizedFacts | null;
  kindEquity: KindEquityPoint[];
  events: EventMsg[];
  selected: SelectedDetail | null;
}

export type ToWorker =
  | { type: "init"; cfg: WorldConfig }
  | { type: "speed"; ticksPerFrame: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "shock"; direction: 1 | -1 }
  | { type: "select"; agentId: number | null }
  | { type: "reset"; seed: number };

export type FromWorker = { type: "snapshot"; snap: WorldSnapshot };
