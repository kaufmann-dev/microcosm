import { describe, expect, it } from "vitest";
import { Rng } from "../src/sim/rng";
import { acf, computeStylizedFacts, mean, std } from "../src/sim/stats";

describe("statistics", () => {
  it("computes mean and std", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });

  it("acf of a perfectly alternating series is -1 at lag 1", () => {
    const xs = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    expect(acf(xs, 1)).toBeCloseTo(-1, 1);
    expect(acf(xs, 2)).toBeCloseTo(1, 1);
  });

  it("iid gaussian sample: near-zero excess kurtosis and acf", () => {
    const rng = new Rng(123);
    const xs = Array.from({ length: 20_000 }, () => rng.gauss());
    const facts = computeStylizedFacts(xs);
    expect(Math.abs(facts.kurtosis)).toBeLessThan(0.25);
    expect(Math.abs(facts.acfReturns[0]!)).toBeLessThan(0.05);
    expect(Math.abs(facts.skew)).toBeLessThan(0.1);
  });

  it("volatility-clustered series shows positive acf of |returns|", () => {
    // Two-regime series: calm then wild, repeated — |r| is autocorrelated.
    const rng = new Rng(7);
    const xs: number[] = [];
    for (let block = 0; block < 100; block++) {
      const sigma = block % 2 === 0 ? 0.2 : 2.0;
      for (let i = 0; i < 50; i++) xs.push(sigma * rng.gauss());
    }
    const facts = computeStylizedFacts(xs);
    expect(facts.acfAbs[0]!).toBeGreaterThan(0.2);
    expect(facts.kurtosis).toBeGreaterThan(1);
  });

  it("histogram buckets standardized returns", () => {
    const rng = new Rng(9);
    const xs = Array.from({ length: 5000 }, () => rng.gauss());
    const facts = computeStylizedFacts(xs);
    const total = facts.histogram.counts.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(4900);
    expect(facts.histogram.edges.length).toBe(facts.histogram.counts.length + 1);
  });
});
