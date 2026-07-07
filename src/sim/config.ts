/** All tunable world parameters. Serializable so the UI can reset with overrides. */
export interface WorldConfig {
  seed: number;

  /** Starting fundamental value in ticks (1 tick = $0.01). */
  fundamental0: number;
  /** OU mean-reversion strength per tick toward the anchor. */
  fundamentalReversion: number;
  /** Per-tick volatility of log-fundamental. */
  fundamentalVol: number;
  /** Per-tick drift of the log-anchor (slow growth). */
  anchorDrift: number;
  /** Probability per tick of a news jump in the fundamental. */
  jumpProb: number;
  /** Std-dev of a news jump in log-fundamental. */
  jumpVol: number;

  /** Ticks between dividend/interest payments. */
  divInterval: number;
  /** Per-period rate: dividend per share = fundamental * rate; interest = cash * rate. */
  ratePerPeriod: number;

  /** Ticks per price candle. */
  candleTicks: number;

  /** Starting cash per agent, in ticks (1_500_000 = $15,000). */
  endowCash: number;
  /** Starting shares per agent. */
  endowShares: number;

  /** Agent counts. */
  nMakers: number;
  nFundamentalists: number;
  nMomentum: number;
  nNoise: number;
  nEvolved: number;

  /** Max shares an agent may be short. */
  maxShort: number;
  /** Hard cap on a single order's size. */
  maxOrderQty: number;
  /** Limit prices must lie within last * (1 ± band). */
  priceBand: number;

  /** Ticks per GP generation (evaluation window). */
  genTicks: number;
  /** Fraction of evolved population replaced each generation. */
  replaceFrac: number;
  /** Tournament size for parent selection. */
  tournament: number;
  /** Probability that an offspring comes from crossover (vs mutation of one parent). */
  crossoverProb: number;
  /** Fitness penalty per tree node (parsimony pressure). */
  bloatPenalty: number;
  /** Max tree depth for generated/offspring genomes. */
  maxDepth: number;
}

export function defaultConfig(seed = 42): WorldConfig {
  return {
    seed,

    fundamental0: 10_000,
    fundamentalReversion: 0.0015,
    fundamentalVol: 0.0011,
    anchorDrift: 0.0000045,
    jumpProb: 0.0011,
    jumpVol: 0.028,

    divInterval: 400,
    ratePerPeriod: 0.0015,

    candleTicks: 16,

    endowCash: 1_500_000,
    endowShares: 120,

    nMakers: 6,
    nFundamentalists: 24,
    nMomentum: 22,
    nNoise: 42,
    nEvolved: 48,

    maxShort: 150,
    maxOrderQty: 60,
    priceBand: 0.35,

    genTicks: 2_400,
    replaceFrac: 0.25,
    tournament: 4,
    crossoverProb: 0.7,
    bloatPenalty: 0.00006,
    maxDepth: 7,
  };
}
