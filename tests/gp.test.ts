import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/sim/config";
import { fitnessOf, selectAndBreed } from "../src/sim/gp/evolve";
import { crossover, mutate, randomGenome } from "../src/sim/gp/genome";
import {
  countNodes,
  evalTree,
  type GNode,
  type GpInputs,
  randomTree,
  treeDepth,
} from "../src/sim/gp/nodes";
import { Rng } from "../src/sim/rng";

const zeroInputs = (): GpInputs => ({
  ret1: 0,
  ret8: 0,
  ret64: 0,
  emaRatio: 0,
  vol: 0,
  spreadRel: 0,
  imbalance: 0,
  tapePressure: 0,
  valueGap: 0,
  inv: 0,
  cashFrac: 0,
});

describe("GP expression trees", () => {
  it("evaluates a hand-built tree", () => {
    // if(imbalance > 0, valueGap + 0.5, -1)
    const tree: GNode = {
      op: "ifpos",
      kids: [
        { op: "imbalance", kids: [] },
        {
          op: "add",
          kids: [
            { op: "valueGap", kids: [] },
            { op: "const", value: 0.5, kids: [] },
          ],
        },
        { op: "const", value: -1, kids: [] },
      ],
    };
    const inputs = zeroInputs();
    inputs.imbalance = 0.3;
    inputs.valueGap = 0.2;
    expect(evalTree(tree, inputs)).toBeCloseTo(0.7);
    inputs.imbalance = -0.3;
    expect(evalTree(tree, inputs)).toBe(-1);
  });

  it("protects division by zero", () => {
    const tree: GNode = {
      op: "div",
      kids: [
        { op: "const", value: 5, kids: [] },
        { op: "vol", kids: [] },
      ],
    };
    expect(evalTree(tree, zeroInputs())).toBe(1);
  });

  it("never returns NaN or Infinity on random trees", () => {
    const rng = new Rng(7);
    const inputs = zeroInputs();
    for (let i = 0; i < 300; i++) {
      const tree = randomTree(rng, 6, rng.bool() ? "grow" : "full");
      for (const key of Object.keys(inputs) as (keyof GpInputs)[]) {
        inputs[key] = rng.range(-3, 3);
      }
      const v = evalTree(tree, inputs);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("generates trees within the requested depth", () => {
    const rng = new Rng(11);
    for (let i = 0; i < 100; i++) {
      expect(treeDepth(randomTree(rng, 5, "full"))).toBeLessThanOrEqual(5);
      expect(treeDepth(randomTree(rng, 5, "grow"))).toBeLessThanOrEqual(5);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = randomGenome(new Rng(99), 7, 1);
    const b = randomGenome(new Rng(99), 7, 1);
    expect(JSON.stringify(a.tree)).toBe(JSON.stringify(b.tree));
    expect(a.buyThr).toBe(b.buyThr);
  });

  it("crossover and mutation respect maxDepth and leave parents intact", () => {
    const rng = new Rng(5);
    const maxDepth = 6;
    for (let i = 0; i < 120; i++) {
      const a = randomGenome(rng, maxDepth, 1);
      const b = randomGenome(rng, maxDepth, 1);
      const aJson = JSON.stringify(a);
      const bJson = JSON.stringify(b);
      const child = crossover(a, b, rng, maxDepth);
      const mutant = mutate(a, rng, maxDepth);
      expect(treeDepth(child.tree)).toBeLessThanOrEqual(maxDepth);
      expect(treeDepth(mutant.tree)).toBeLessThanOrEqual(maxDepth);
      expect(JSON.stringify(a)).toBe(aJson);
      expect(JSON.stringify(b)).toBe(bJson);
      expect(child.buyThr).toBeGreaterThan(0);
      expect(child.sellThr).toBeLessThan(0);
    }
  });
});

describe("selection and breeding", () => {
  it("replaces exactly the worst individuals", () => {
    const cfg = defaultConfig(1);
    cfg.replaceFrac = 0.25;
    const rng = new Rng(3);
    const pop = Array.from({ length: 8 }, (_, index) => ({
      index,
      name: `GP-${index}`,
      genome: randomGenome(rng, cfg.maxDepth, index + 1),
      fitness: index, // index 0 is worst, 7 is best
    }));
    const res = selectAndBreed(pop, cfg, rng);
    expect(res.replacedIndices.sort()).toEqual([0, 1]);
    expect(res.offspring).toHaveLength(2);
  });

  it("fitness rewards returns and punishes drawdown and bloat", () => {
    const cfg = defaultConfig(1);
    const rng = new Rng(4);
    const g = randomGenome(rng, cfg.maxDepth, 1);
    const gain = fitnessOf(100_000, 120_000, 0, g, cfg);
    const loss = fitnessOf(100_000, 80_000, 0, g, cfg);
    const gainDrawdown = fitnessOf(100_000, 120_000, 0.4, g, cfg);
    expect(gain).toBeGreaterThan(loss);
    expect(gain).toBeGreaterThan(gainDrawdown);
    expect(countNodes(g.tree)).toBeGreaterThan(0);
  });
});
