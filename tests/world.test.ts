import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/sim/config";
import { World } from "../src/sim/engine";

function smallConfig(seed: number) {
  const cfg = defaultConfig(seed);
  cfg.nMakers = 4;
  cfg.nFundamentalists = 10;
  cfg.nMomentum = 8;
  cfg.nNoise = 16;
  cfg.nEvolved = 16;
  cfg.genTicks = 1200;
  return cfg;
}

describe("World integration", () => {
  it("runs thousands of ticks with sane invariants", () => {
    const world = new World(smallConfig(42));
    for (let i = 0; i < 6000; i++) world.step();

    const m = world.market;
    expect(m.tick).toBe(6000);
    expect(Number.isFinite(m.last)).toBe(true);
    expect(m.last).toBeGreaterThan(0);
    expect(m.candles.length).toBeGreaterThan(300);

    // Trading actually happened.
    const totalVolume = m.candles.reduce((s, c) => s + c.volume, 0);
    expect(totalVolume).toBeGreaterThan(1000);

    // Book is well-formed when two-sided.
    const bid = m.book.bestBid();
    const ask = m.book.bestAsk();
    if (bid !== undefined && ask !== undefined) expect(bid).toBeLessThan(ask);

    // Evolution ran.
    expect(world.generation).toBeGreaterThanOrEqual(4);

    // All accounts stayed finite.
    for (const acct of m.accounts.values()) {
      expect(Number.isFinite(acct.cash)).toBe(true);
      expect(Number.isFinite(acct.pos)).toBe(true);
      expect(Math.abs(acct.pos)).toBeLessThan(100_000);
    }

    // Price roughly tracks the fundamental (within a loose band — bubbles allowed).
    const ratio = m.last / m.fundamental;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(2.5);
  });

  it("is deterministic for a fixed seed", () => {
    const a = new World(smallConfig(7));
    const b = new World(smallConfig(7));
    for (let i = 0; i < 2500; i++) {
      a.step();
      b.step();
    }
    expect(a.market.last).toBe(b.market.last);
    expect(a.market.fundamental).toBe(b.market.fundamental);
    expect(a.generation).toBe(b.generation);
    expect(JSON.stringify(a.snapshot(true, 0).agents)).toBe(
      JSON.stringify(b.snapshot(true, 0).agents),
    );
  });

  it("produces different worlds for different seeds", () => {
    const a = new World(smallConfig(1));
    const b = new World(smallConfig(2));
    for (let i = 0; i < 1500; i++) {
      a.step();
      b.step();
    }
    expect(a.market.last).not.toBe(b.market.last);
  });

  it("snapshots are structured-cloneable (postMessage-safe)", () => {
    const world = new World(smallConfig(3));
    for (let i = 0; i < 1500; i++) world.step();
    world.selectedAgentId = world.snapshot(true, 0).agents.find((a) => a.kind === "evolved")!.id;
    const snap = world.snapshot(true, 0);
    const cloned = structuredClone(snap);
    expect(cloned.tick).toBe(snap.tick);
    expect(cloned.selected?.genome?.formula.length).toBeGreaterThan(0);
  });
});
