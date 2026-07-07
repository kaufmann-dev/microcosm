import type { Rng } from "../rng";
import {
  arity,
  BINARY,
  cloneTree,
  collectNodes,
  countNodes,
  type GNode,
  randomTree,
  TERMINALS,
  treeDepth,
  UNARY,
} from "./nodes";

/** A complete heritable strategy: signal program plus execution genes. */
export interface Genome {
  tree: GNode;
  /** Signal above this → buy. */
  buyThr: number;
  /** Signal below this → sell (negative). */
  sellThr: number;
  /** Order size as a fraction of the per-order cap. */
  sizeFrac: number;
  /** Limit-order offset from the touch, in ticks. */
  offsetTicks: number;
  /** Probability of taking liquidity with a market order. */
  aggression: number;
  /** Wake-up interval in ticks. */
  cadence: number;
  /** Lineage id, preserved through crossover/mutation for ancestry coloring. */
  lineage: number;
}

export function randomGenome(rng: Rng, maxDepth: number, lineage: number): Genome {
  const depth = rng.int(2, Math.max(2, maxDepth - 2));
  return {
    tree: randomTree(rng, depth, rng.bool() ? "grow" : "full"),
    buyThr: rng.range(0.1, 1.2),
    sellThr: -rng.range(0.1, 1.2),
    sizeFrac: rng.range(0.08, 0.5),
    offsetTicks: rng.int(0, 6),
    aggression: rng.range(0.1, 0.9),
    cadence: rng.int(2, 12),
    lineage,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Gaussian-perturb the numeric execution genes (always applied to offspring). */
function mutateGenes(g: Genome, rng: Rng): void {
  if (rng.bool(0.5)) g.buyThr = clamp(g.buyThr + rng.gauss() * 0.08, 0.02, 2.5);
  if (rng.bool(0.5)) g.sellThr = clamp(g.sellThr + rng.gauss() * 0.08, -2.5, -0.02);
  if (rng.bool(0.4)) g.sizeFrac = clamp(g.sizeFrac + rng.gauss() * 0.05, 0.03, 0.7);
  if (rng.bool(0.3)) g.offsetTicks = clamp(Math.round(g.offsetTicks + rng.gauss() * 1.5), 0, 12);
  if (rng.bool(0.4)) g.aggression = clamp(g.aggression + rng.gauss() * 0.1, 0, 1);
  if (rng.bool(0.3)) g.cadence = clamp(Math.round(g.cadence + rng.gauss() * 2), 2, 20);
}

/** Point mutation: swap an op for one of equal arity, or nudge a constant. */
function pointMutate(tree: GNode, rng: Rng): void {
  const refs = collectNodes(tree);
  const ref = rng.pick(refs);
  const node = ref.node;
  if (node.op === "const") {
    node.value = (node.value ?? 0) + rng.gauss() * 0.4;
    return;
  }
  const a = arity(node.op);
  if (a === 0) {
    if (rng.bool(0.2)) {
      node.op = "const";
      node.value = Number(rng.range(-2, 2).toFixed(3));
    } else {
      node.op = rng.pick(TERMINALS);
    }
  } else if (a === 1) {
    node.op = rng.pick(UNARY);
  } else if (a === 2) {
    node.op = rng.pick(BINARY);
  }
}

/** Replace a random subtree with a fresh random one. */
function subtreeMutate(tree: GNode, rng: Rng, maxDepth: number): GNode {
  const refs = collectNodes(tree);
  const ref = rng.pick(refs);
  const replacement = randomTree(rng, rng.int(1, 3), "grow");
  if (!ref.parent) return replacement;
  ref.parent.kids[ref.childIndex] = replacement;
  void maxDepth;
  return tree;
}

/** Hoist mutation: promote a random subtree to the root. Fights bloat. */
function hoistMutate(tree: GNode, rng: Rng): GNode {
  const refs = collectNodes(tree);
  return cloneTree(rng.pick(refs).node);
}

export function mutate(parent: Genome, rng: Rng, maxDepth: number): Genome {
  const child: Genome = { ...parent, tree: cloneTree(parent.tree) };
  const r = rng.next();
  if (r < 0.45) {
    child.tree = subtreeMutate(child.tree, rng, maxDepth);
  } else if (r < 0.8) {
    pointMutate(child.tree, rng);
  } else if (countNodes(child.tree) > 5) {
    child.tree = hoistMutate(child.tree, rng);
  } else {
    child.tree = subtreeMutate(child.tree, rng, maxDepth);
  }
  if (treeDepth(child.tree) > maxDepth) child.tree = hoistMutate(child.tree, rng);
  mutateGenes(child, rng);
  return child;
}

/**
 * Subtree crossover: child = copy of A with a random subtree replaced by a
 * random subtree of B. Numeric genes are blended, lineage follows parent A.
 */
export function crossover(a: Genome, b: Genome, rng: Rng, maxDepth: number): Genome {
  let tree = cloneTree(a.tree);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = cloneTree(a.tree);
    const refsA = collectNodes(candidate);
    const refsB = collectNodes(b.tree);
    const target = rng.pick(refsA);
    const donor = cloneTree(rng.pick(refsB).node);
    if (!target.parent) {
      if (treeDepth(donor) <= maxDepth) {
        tree = donor;
        break;
      }
      continue;
    }
    target.parent.kids[target.childIndex] = donor;
    if (treeDepth(candidate) <= maxDepth) {
      tree = candidate;
      break;
    }
  }
  const mix = rng.next();
  const child: Genome = {
    tree,
    buyThr: a.buyThr * mix + b.buyThr * (1 - mix),
    sellThr: a.sellThr * mix + b.sellThr * (1 - mix),
    sizeFrac: a.sizeFrac * mix + b.sizeFrac * (1 - mix),
    offsetTicks: rng.bool() ? a.offsetTicks : b.offsetTicks,
    aggression: a.aggression * mix + b.aggression * (1 - mix),
    cadence: rng.bool() ? a.cadence : b.cadence,
    lineage: a.lineage,
  };
  mutateGenes(child, rng);
  return child;
}
