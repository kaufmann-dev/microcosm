import type { BookLevel, Fill, Order, OrderType, Side, Trade } from "./types";

/** One side of the book: sorted price levels, each a FIFO queue of orders. */
class BookSide {
  /** Prices sorted best-first (descending for bids, ascending for asks). */
  readonly prices: number[] = [];
  readonly levels = new Map<number, Order[]>();

  constructor(private readonly isBid: boolean) {}

  best(): number | undefined {
    return this.prices[0];
  }

  /** True if `price` is at least as aggressive as the best resting price. */
  private better(a: number, b: number): boolean {
    return this.isBid ? a > b : a < b;
  }

  insert(order: Order): void {
    let level = this.levels.get(order.price);
    if (!level) {
      level = [];
      this.levels.set(order.price, level);
      // Binary search for insertion point in best-first order.
      let lo = 0;
      let hi = this.prices.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.better(this.prices[mid]!, order.price)) lo = mid + 1;
        else hi = mid;
      }
      this.prices.splice(lo, 0, order.price);
    }
    level.push(order);
  }

  removeOrder(order: Order): boolean {
    const level = this.levels.get(order.price);
    if (!level) return false;
    const idx = level.indexOf(order);
    if (idx < 0) return false;
    level.splice(idx, 1);
    if (level.length === 0) this.dropLevel(order.price);
    return true;
  }

  dropLevel(price: number): void {
    this.levels.delete(price);
    const idx = this.prices.indexOf(price);
    if (idx >= 0) this.prices.splice(idx, 1);
  }

  depth(k: number): BookLevel[] {
    const out: BookLevel[] = [];
    for (let i = 0; i < Math.min(k, this.prices.length); i++) {
      const price = this.prices[i]!;
      const level = this.levels.get(price)!;
      let qty = 0;
      for (const o of level) qty += o.qty;
      out.push({ price, qty, orders: level.length });
    }
    return out;
  }

  totalQty(k: number): number {
    let sum = 0;
    for (let i = 0; i < Math.min(k, this.prices.length); i++) {
      const level = this.levels.get(this.prices[i]!)!;
      for (const o of level) sum += o.qty;
    }
    return sum;
  }
}

export interface SubmitResult {
  fills: Fill[];
  trades: Trade[];
  /** Id of the resting remainder, if any part of a limit order entered the book. */
  restingId: number | undefined;
  /** Resting orders of the same agent that were cancelled by self-trade prevention. */
  stpCancelled: number[];
}

/**
 * Continuous double auction with price-time priority.
 * Trades execute at the resting order's price. Self-trade prevention
 * cancels the resting order (aggressor keeps matching onward).
 */
export class OrderBook {
  private readonly bids = new BookSide(true);
  private readonly asks = new BookSide(false);
  private readonly byId = new Map<number, Order>();
  private readonly byAgent = new Map<number, Set<number>>();
  private nextId = 1;
  private seq = 0;

  bestBid(): number | undefined {
    return this.bids.best();
  }

  bestAsk(): number | undefined {
    return this.asks.best();
  }

  mid(): number | undefined {
    const b = this.bestBid();
    const a = this.bestAsk();
    if (b === undefined || a === undefined) return undefined;
    return (a + b) / 2;
  }

  spread(): number | undefined {
    const b = this.bestBid();
    const a = this.bestAsk();
    if (b === undefined || a === undefined) return undefined;
    return a - b;
  }

  depth(side: Side, k: number): BookLevel[] {
    return (side === "buy" ? this.bids : this.asks).depth(k);
  }

  totalQty(side: Side, k: number): number {
    return (side === "buy" ? this.bids : this.asks).totalQty(k);
  }

  order(id: number): Order | undefined {
    return this.byId.get(id);
  }

  openOrderIds(agentId: number): number[] {
    const set = this.byAgent.get(agentId);
    return set ? [...set] : [];
  }

  /** Sum of price*qty over an agent's open buy orders, and qty over open sells. */
  openExposure(agentId: number): { buyValue: number; sellQty: number } {
    let buyValue = 0;
    let sellQty = 0;
    for (const id of this.byAgent.get(agentId) ?? []) {
      const o = this.byId.get(id)!;
      if (o.side === "buy") buyValue += o.price * o.qty;
      else sellQty += o.qty;
    }
    return { buyValue, sellQty };
  }

  cancel(orderId: number): boolean {
    const order = this.byId.get(orderId);
    if (!order) return false;
    const side = order.side === "buy" ? this.bids : this.asks;
    side.removeOrder(order);
    this.byId.delete(orderId);
    this.byAgent.get(order.agentId)?.delete(orderId);
    return true;
  }

  cancelAll(agentId: number): number {
    const ids = this.openOrderIds(agentId);
    for (const id of ids) this.cancel(id);
    return ids.length;
  }

  submit(
    tick: number,
    agentId: number,
    side: Side,
    type: OrderType,
    price: number,
    qty: number,
  ): SubmitResult {
    const result: SubmitResult = { fills: [], trades: [], restingId: undefined, stpCancelled: [] };
    if (qty <= 0) return result;
    qty = Math.floor(qty);
    price = Math.max(1, Math.round(price));

    const incoming: Order = { id: this.nextId++, agentId, side, type, price, qty, seq: this.seq++ };
    const opposite = side === "buy" ? this.asks : this.bids;

    const crosses = (restPrice: number): boolean => {
      if (type === "market") return true;
      return side === "buy" ? restPrice <= price : restPrice >= price;
    };

    while (incoming.qty > 0) {
      const bestPrice = opposite.best();
      if (bestPrice === undefined || !crosses(bestPrice)) break;
      const level = opposite.levels.get(bestPrice)!;
      const resting = level[0]!;

      if (resting.agentId === agentId) {
        // Self-trade prevention: cancel own resting order, keep matching.
        this.cancel(resting.id);
        result.stpCancelled.push(resting.id);
        continue;
      }

      const fillQty = Math.min(incoming.qty, resting.qty);
      incoming.qty -= fillQty;
      resting.qty -= fillQty;

      result.fills.push(
        { orderId: incoming.id, agentId, side, price: bestPrice, qty: fillQty, taker: true },
        {
          orderId: resting.id,
          agentId: resting.agentId,
          side: resting.side,
          price: bestPrice,
          qty: fillQty,
          taker: false,
        },
      );
      result.trades.push({
        tick,
        price: bestPrice,
        qty: fillQty,
        aggressor: side,
        buyerId: side === "buy" ? agentId : resting.agentId,
        sellerId: side === "sell" ? agentId : resting.agentId,
      });

      if (resting.qty === 0) {
        level.shift();
        if (level.length === 0) opposite.dropLevel(bestPrice);
        this.byId.delete(resting.id);
        this.byAgent.get(resting.agentId)?.delete(resting.id);
      }
    }

    // Rest the remainder of a limit order; market-order remainders are discarded.
    if (incoming.qty > 0 && type === "limit") {
      const own = side === "buy" ? this.bids : this.asks;
      own.insert(incoming);
      this.byId.set(incoming.id, incoming);
      let set = this.byAgent.get(agentId);
      if (!set) {
        set = new Set();
        this.byAgent.set(agentId, set);
      }
      set.add(incoming.id);
      result.restingId = incoming.id;
    }

    return result;
  }
}
