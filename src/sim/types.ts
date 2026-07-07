/** Prices are integer ticks (1 tick = $0.01). Quantities are integer shares. */

export type Side = "buy" | "sell";

export type OrderType = "limit" | "market";

export interface Order {
  id: number;
  agentId: number;
  side: Side;
  type: OrderType;
  /** Limit price in ticks. Ignored for market orders. */
  price: number;
  /** Remaining unfilled quantity. */
  qty: number;
  /** Submission sequence number for time priority. */
  seq: number;
}

export interface Trade {
  tick: number;
  price: number;
  qty: number;
  /** Side of the aggressor (incoming order). */
  aggressor: Side;
  buyerId: number;
  sellerId: number;
}

export interface Fill {
  orderId: number;
  agentId: number;
  side: Side;
  price: number;
  qty: number;
  /** True if this fill belongs to the incoming (aggressor) order. */
  taker: boolean;
}

export interface BookLevel {
  price: number;
  qty: number;
  orders: number;
}

export interface Candle {
  tick: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Fundamental value (ticks) at candle close, for overlay + divergence metrics. */
  fundamental: number;
}

export type AgentKind = "maker" | "fundamentalist" | "momentum" | "noise" | "evolved";

export const AGENT_KINDS: readonly AgentKind[] = [
  "maker",
  "fundamentalist",
  "momentum",
  "noise",
  "evolved",
];
