/** Market features recomputed once per tick and shared by all agents and the GP terminals. */
export interface Features {
  mid: number;
  last: number;
  /** (ask - bid) / mid, 0 if book is one-sided. */
  spreadRel: number;
  /** Log returns of mid over 1 / 8 / 64 ticks. */
  ret1: number;
  ret8: number;
  ret64: number;
  /** EMA(20) / EMA(100) of mid, minus 1. Positive = short-term uptrend. */
  emaRatio: number;
  /** EWMA volatility of ret1. */
  vol: number;
  /** (bidQty - askQty) / (bidQty + askQty) over top 5 levels, in [-1, 1]. */
  imbalance: number;
  /** EWMA of signed aggressor volume, squashed to [-1, 1]. */
  tapePressure: number;
  /** mid / fundamental - 1. Positive = market trades above fundamental value. */
  valuePremium: number;
}

const FAST = 2 / 21;
const SLOW = 2 / 101;
const VOL_LAMBDA = 0.97;
const TAPE_LAMBDA = 0.95;

export class FeatureEngine {
  private readonly midHist: Float64Array;
  private head = 0;
  private count = 0;
  private emaFast: number;
  private emaSlow: number;
  private volVar: number;
  private tape = 0;

  constructor(
    initialMid: number,
    private readonly histLen = 128,
  ) {
    this.midHist = new Float64Array(histLen).fill(initialMid);
    this.emaFast = initialMid;
    this.emaSlow = initialMid;
    this.volVar = 0;
  }

  /** Mid `lag` ticks ago (lag 0 = most recent recorded). */
  private midAt(lag: number): number {
    const idx = (this.head - 1 - lag + this.histLen * 2) % this.histLen;
    return this.midHist[idx]!;
  }

  recordSignedVolume(signedQty: number): void {
    this.tape = TAPE_LAMBDA * this.tape + (1 - TAPE_LAMBDA) * signedQty;
  }

  update(
    mid: number,
    last: number,
    spread: number,
    bidQty: number,
    askQty: number,
    fundamental: number,
  ): Features {
    this.midHist[this.head] = mid;
    this.head = (this.head + 1) % this.histLen;
    this.count++;

    this.emaFast += FAST * (mid - this.emaFast);
    this.emaSlow += SLOW * (mid - this.emaSlow);

    const prev = this.midAt(1);
    const ret1 = prev > 0 ? Math.log(mid / prev) : 0;
    this.volVar = VOL_LAMBDA * this.volVar + (1 - VOL_LAMBDA) * ret1 * ret1;

    const m8 = this.midAt(Math.min(8, this.count));
    const m64 = this.midAt(Math.min(64, this.count));
    const depthSum = bidQty + askQty;

    return {
      mid,
      last,
      spreadRel: mid > 0 ? spread / mid : 0,
      ret1,
      ret8: m8 > 0 ? Math.log(mid / m8) : 0,
      ret64: m64 > 0 ? Math.log(mid / m64) : 0,
      emaRatio: this.emaSlow > 0 ? this.emaFast / this.emaSlow - 1 : 0,
      vol: Math.sqrt(this.volVar),
      imbalance: depthSum > 0 ? (bidQty - askQty) / depthSum : 0,
      tapePressure: Math.tanh(this.tape / 20),
      valuePremium: fundamental > 0 ? mid / fundamental - 1 : 0,
    };
  }
}
