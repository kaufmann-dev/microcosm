/**
 * Stylized-fact statistics over candle close returns. Real markets show
 * (1) near-zero autocorrelation of raw returns, (2) strong positive
 * autocorrelation of |returns| (volatility clustering), and (3) excess
 * kurtosis (fat tails). Agent-based markets should reproduce all three.
 */
export interface StylizedFacts {
  n: number;
  mean: number;
  std: number;
  skew: number;
  /** Excess kurtosis: 0 for a normal distribution. */
  kurtosis: number;
  /** Autocorrelation of raw returns at lags 1..maxLag. */
  acfReturns: number[];
  /** Autocorrelation of |returns| at lags 1..maxLag. */
  acfAbs: number[];
  /** Histogram of standardized returns for the fat-tail plot. */
  histogram: { edges: number[]; counts: number[] };
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function std(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** Sample autocorrelation at a given lag. */
export function acf(xs: readonly number[], lag: number): number {
  const n = xs.length;
  if (lag >= n || lag < 1) return 0;
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = xs[i]! - m;
    den += d * d;
    if (i + lag < n) num += d * (xs[i + lag]! - m);
  }
  return den > 0 ? num / den : 0;
}

function standardizedMoment(xs: readonly number[], k: number): number {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  let varSum = 0;
  for (const x of xs) varSum += (x - m) * (x - m);
  const sd = Math.sqrt(varSum / n);
  if (sd === 0) return 0;
  let s = 0;
  for (const x of xs) s += ((x - m) / sd) ** k;
  return s / n;
}

export function computeStylizedFacts(returns: readonly number[], maxLag = 20): StylizedFacts {
  const n = returns.length;
  const m = mean(returns);
  const sd = std(returns);

  const acfReturns: number[] = [];
  const acfAbs: number[] = [];
  const absR = returns.map(Math.abs);
  for (let lag = 1; lag <= maxLag; lag++) {
    acfReturns.push(acf(returns, lag));
    acfAbs.push(acf(absR, lag));
  }

  // Histogram of standardized returns over [-6σ, 6σ].
  const bins = 41;
  const lo = -6;
  const hi = 6;
  const edges: number[] = [];
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i <= bins; i++) edges.push(lo + ((hi - lo) * i) / bins);
  if (sd > 0) {
    for (const r of returns) {
      const z = (r - m) / sd;
      if (z < lo || z >= hi) continue;
      counts[Math.floor(((z - lo) / (hi - lo)) * bins)]!++;
    }
  }

  return {
    n,
    mean: m,
    std: sd,
    skew: standardizedMoment(returns, 3),
    kurtosis: standardizedMoment(returns, 4) - 3,
    acfReturns,
    acfAbs,
    histogram: { edges, counts },
  };
}

/** Standard normal pdf, used to overlay the Gaussian on the histogram. */
export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}
