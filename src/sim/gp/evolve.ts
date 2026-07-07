import type { WorldConfig } from "../config";
import type { Rng } from "../rng";
import { countNodes } from "./nodes";
import { crossover, type Genome, mutate } from "./genome";

export interface RankedIndividual {
  index: number;
  name: string;
  genome: Genome;
  fitness: number;
}

export interface BreedResult {
  /** Population indices (into the ranked input) that die this generation. */
  replacedIndices: number[];
  /** One offspring genome per replaced index, in the same order. */
  offspring: Genome[];
}

/**
 * Steady-state generational replacement: rank by fitness, kill the bottom
 * `replaceFrac`, breed replacements from tournament-selected survivors.
 * Survivors keep their capital and open positions — the market never resets.
 */
export function selectAndBreed(pop: RankedIndividual[], cfg: WorldConfig, rng: Rng): BreedResult {
  const ranked = [...pop].sort((a, b) => b.fitness - a.fitness);
  const nReplace = Math.max(1, Math.round(ranked.length * cfg.replaceFrac));
  const survivors = ranked.slice(0, ranked.length - nReplace);
  const dying = ranked.slice(ranked.length - nReplace);

  const pickParent = (): Genome => {
    let best = rng.pick(survivors);
    for (let i = 1; i < cfg.tournament; i++) {
      const challenger = rng.pick(survivors);
      if (challenger.fitness > best.fitness) best = challenger;
    }
    return best.genome;
  };

  const offspring: Genome[] = [];
  for (let i = 0; i < dying.length; i++) {
    if (rng.bool(cfg.crossoverProb)) {
      offspring.push(crossover(pickParent(), pickParent(), rng, cfg.maxDepth));
    } else {
      offspring.push(mutate(pickParent(), rng, cfg.maxDepth));
    }
  }

  return { replacedIndices: dying.map((d) => d.index), offspring };
}

/** Fitness: window log-return, penalized for drawdown and program size. */
export function fitnessOf(
  startEquity: number,
  endEquity: number,
  maxDrawdown: number,
  genome: Genome,
  cfg: WorldConfig,
): number {
  const logRet = Math.log(Math.max(1, endEquity) / Math.max(1, startEquity));
  return logRet - 0.5 * maxDrawdown - cfg.bloatPenalty * countNodes(genome.tree);
}
