import type { WorldConfig } from "./config";
import { FeatureEngine, type Features } from "./features";
import { OrderBook, type SubmitResult } from "./orderbook";
import { Rng } from "./rng";
import type { Candle, OrderType, Side, Trade } from "./types";

export interface Account {
  cash: number;
  pos: number;
  /** Risk limit: how many shares this agent may be short. */
  maxShort: number;
  /** Lifetime traded volume in shares. */
  volume: number;
  /** Number of times this account went bankrupt and was bailed out / replaced. */
  blowups: number;
}

/**
 * The exchange: order book plus fundamental process, cash/position accounting,
 * dividends and interest, candles, and shared per-tick features.
 */
export class Market {
  readonly book = new OrderBook();
  readonly accounts = new Map<number, Account>();
  readonly candles: Candle[] = [];
  readonly tape: Trade[] = [];

  tick = 0;
  last: number;
  private logF: number;
  private logAnchor: number;
  private readonly fe: FeatureEngine;
  features: Features;

  /** Trades since the current candle opened. */
  private candleTrades: Trade[] = [];
  private candleOpen: number;
  private candleHigh: number;
  private candleLow: number;
  private candleVolume = 0;

  /** Cumulative dividend/interest flows this run (diagnostics). */
  totalDividends = 0;

  constructor(
    readonly cfg: WorldConfig,
    private readonly rng: Rng,
  ) {
    this.last = cfg.fundamental0;
    this.logF = Math.log(cfg.fundamental0);
    this.logAnchor = this.logF;
    this.fe = new FeatureEngine(cfg.fundamental0);
    this.features = this.fe.update(this.last, this.last, 0, 0, 0, this.fundamental);
    this.candleOpen = this.last;
    this.candleHigh = this.last;
    this.candleLow = this.last;
  }

  get fundamental(): number {
    return Math.exp(this.logF);
  }

  registerAgent(id: number, maxShort: number): Account {
    const acct: Account = {
      cash: this.cfg.endowCash,
      pos: this.cfg.endowShares,
      maxShort,
      volume: 0,
      blowups: 0,
    };
    this.accounts.set(id, acct);
    return acct;
  }

  mark(): number {
    return this.book.mid() ?? this.last;
  }

  equity(id: number): number {
    const a = this.accounts.get(id)!;
    return a.cash + a.pos * this.mark();
  }

  /** Advance the fundamental (OU around a drifting anchor, plus rare jumps). */
  stepFundamental(): { jumped: boolean } {
    const c = this.cfg;
    this.logAnchor += c.anchorDrift;
    this.logF +=
      c.fundamentalReversion * (this.logAnchor - this.logF) + c.fundamentalVol * this.rng.gauss();
    let jumped = false;
    if (this.rng.bool(c.jumpProb)) {
      this.logF += c.jumpVol * this.rng.gauss();
      jumped = true;
    }
    return { jumped };
  }

  /** Force a news shock of the given sign (UI button). */
  injectShock(direction: 1 | -1, magnitude = 0.06): void {
    this.logF += direction * magnitude * (0.75 + 0.5 * this.rng.next());
  }

  refreshFeatures(): void {
    const mid = this.book.mid() ?? this.last;
    this.features = this.fe.update(
      mid,
      this.last,
      this.book.spread() ?? 0,
      this.book.totalQty("buy", 5),
      this.book.totalQty("sell", 5),
      this.fundamental,
    );
  }

  /**
   * Submit an order on behalf of an agent, enforcing risk constraints:
   * buys must be fully cash-covered (including open buy orders), sells are
   * bounded by position + maxShort, limit prices must sit inside the price band.
   * Quantities are truncated to what the constraints allow.
   */
  submit(agentId: number, side: Side, type: OrderType, price: number, qty: number): SubmitResult | undefined {
    const acct = this.accounts.get(agentId)!;
    qty = Math.min(Math.floor(qty), this.cfg.maxOrderQty);
    if (qty <= 0) return undefined;

    const band = this.cfg.priceBand;
    if (type === "limit") {
      price = Math.round(price);
      if (price < this.last * (1 - band) || price > this.last * (1 + band) || price < 1) {
        return undefined;
      }
    }

    const exposure = this.book.openExposure(agentId);
    if (side === "buy") {
      const estPrice =
        type === "limit" ? price : Math.ceil((this.book.bestAsk() ?? this.last) * 1.02);
      const budget = acct.cash - exposure.buyValue;
      qty = Math.min(qty, Math.floor(budget / Math.max(1, estPrice)));
    } else {
      const allowance = acct.pos + acct.maxShort - exposure.sellQty;
      qty = Math.min(qty, allowance);
    }
    if (qty <= 0) return undefined;

    const result = this.book.submit(this.tick, agentId, side, type, price, qty);
    this.settle(result);
    return result;
  }

  private settle(result: SubmitResult): void {
    for (const fill of result.fills) {
      const acct = this.accounts.get(fill.agentId)!;
      if (fill.side === "buy") {
        acct.cash -= fill.price * fill.qty;
        acct.pos += fill.qty;
      } else {
        acct.cash += fill.price * fill.qty;
        acct.pos -= fill.qty;
      }
      acct.volume += fill.qty;
    }
    for (const trade of result.trades) {
      this.last = trade.price;
      this.fe.recordSignedVolume(trade.aggressor === "buy" ? trade.qty : -trade.qty);
      this.candleTrades.push(trade);
      this.candleHigh = Math.max(this.candleHigh, trade.price);
      this.candleLow = Math.min(this.candleLow, trade.price);
      this.candleVolume += trade.qty;
      this.tape.push(trade);
      if (this.tape.length > 120) this.tape.splice(0, this.tape.length - 120);
    }
  }

  /** Close the current candle if the boundary was reached. Returns the closed candle. */
  maybeCloseCandle(): Candle | undefined {
    if (this.tick === 0 || this.tick % this.cfg.candleTicks !== 0) return undefined;
    const candle: Candle = {
      tick: this.tick,
      open: this.candleOpen,
      high: this.candleHigh,
      low: this.candleLow,
      close: this.last,
      volume: this.candleVolume,
      fundamental: this.fundamental,
    };
    this.candles.push(candle);
    if (this.candles.length > 6000) this.candles.splice(0, this.candles.length - 6000);
    this.candleOpen = this.last;
    this.candleHigh = this.last;
    this.candleLow = this.last;
    this.candleVolume = 0;
    this.candleTrades = [];
    return candle;
  }

  /** Pay dividends on positions and interest on cash. Shorts pay dividends. */
  payDividends(): void {
    const div = this.fundamental * this.cfg.ratePerPeriod;
    const r = this.cfg.ratePerPeriod;
    for (const acct of this.accounts.values()) {
      const flow = acct.pos * div + acct.cash * r;
      acct.cash += flow;
      this.totalDividends += Math.abs(flow);
    }
  }

  /**
   * Forced liquidation of a bankrupt or replaced agent: cancel everything and
   * unwind the position with market orders (a fire sale — it moves the market).
   * Any remainder the book cannot absorb is written off.
   */
  liquidate(agentId: number): void {
    this.book.cancelAll(agentId);
    const acct = this.accounts.get(agentId)!;
    let guard = 0;
    while (acct.pos !== 0 && guard++ < 40) {
      const side: Side = acct.pos > 0 ? "sell" : "buy";
      const qty = Math.min(Math.abs(acct.pos), this.cfg.maxOrderQty);
      const opposite = side === "sell" ? this.book.bestBid() : this.book.bestAsk();
      if (opposite === undefined) break;
      const result = this.book.submit(this.tick, agentId, side, "market", 0, qty);
      this.settle(result);
      if (result.fills.length === 0) break;
    }
    acct.pos = 0;
  }
}
