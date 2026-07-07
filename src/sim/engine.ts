import type {
  AgentRow,
  EventMsg,
  GenStat,
  HallOfFameEntry,
  KindEquityPoint,
  SelectedDetail,
  WorldSnapshot,
} from "../shared/protocol";
import type { Agent, AgentContext } from "./agents/base";
import { EvolvedTrader } from "./agents/evolved";
import { Fundamentalist } from "./agents/fundamentalist";
import { MarketMaker } from "./agents/maker";
import { Momentum } from "./agents/momentum";
import { NoiseTrader } from "./agents/noise";
import type { WorldConfig } from "./config";
import { fitnessOf, type RankedIndividual, selectAndBreed } from "./gp/evolve";
import { randomGenome } from "./gp/genome";
import { cloneTree, countNodes, formatTree } from "./gp/nodes";
import { Market } from "./market";
import { Rng } from "./rng";
import { computeStylizedFacts, type StylizedFacts } from "./stats";

interface Scheduled {
  agent: Agent;
  nextAct: number;
  rng: Rng;
  /** Whether the agent went bankrupt during the current evaluation window. */
  bankrupted: boolean;
}

/** The whole artificial economy: market, agents, evolution, event history. */
export class World {
  readonly market: Market;
  private readonly rng: Rng;
  private readonly slots: Scheduled[] = [];
  private readonly byId = new Map<number, Scheduled>();
  private readonly endowEquity: number;

  generation = 0;
  private gpSerial = 0;
  private readonly genStats: GenStat[] = [];
  private readonly hallOfFame: HallOfFameEntry[] = [];
  private readonly events: EventMsg[] = [];
  private readonly kindEquity: KindEquityPoint[] = [];
  private facts: StylizedFacts | null = null;
  selectedAgentId: number | null = null;

  constructor(readonly cfg: WorldConfig) {
    this.rng = new Rng(cfg.seed);
    this.market = new Market(cfg, this.rng.fork());
    this.endowEquity = cfg.endowCash + cfg.endowShares * cfg.fundamental0;

    let id = 0;
    const add = (agent: Agent, maxShort: number): void => {
      this.market.registerAgent(agent.id, maxShort);
      const slot: Scheduled = {
        agent,
        nextAct: this.rng.int(0, Math.max(1, agent.cadence)),
        rng: this.rng.fork(),
        bankrupted: false,
      };
      this.slots.push(slot);
      this.byId.set(agent.id, slot);
    };

    for (let i = 0; i < cfg.nMakers; i++) {
      add(new MarketMaker(++id, i, this.rng, this.endowEquity), Math.round(cfg.maxShort * 1.8));
    }
    for (let i = 0; i < cfg.nFundamentalists; i++) {
      add(new Fundamentalist(++id, i, this.rng, this.endowEquity), cfg.maxShort);
    }
    for (let i = 0; i < cfg.nMomentum; i++) {
      add(new Momentum(++id, i, this.rng, this.endowEquity), cfg.maxShort);
    }
    for (let i = 0; i < cfg.nNoise; i++) {
      add(new NoiseTrader(++id, i, this.rng, this.endowEquity), Math.round(cfg.maxShort / 3));
    }
    for (let i = 0; i < cfg.nEvolved; i++) {
      add(this.newEvolved(++id, randomGenome(this.rng, cfg.maxDepth, i + 1)), cfg.maxShort);
    }

    this.pushEvent("info", `world created: ${this.slots.length} agents, seed ${cfg.seed}`);
  }

  private newEvolved(id: number, genome: ReturnType<typeof randomGenome>): EvolvedTrader {
    const trader = new EvolvedTrader(
      id,
      ++this.gpSerial,
      genome,
      this.generation,
      this.rng,
      this.endowEquity,
      this.cfg.maxOrderQty,
    );
    trader.beginWindow(this.endowEquity);
    return trader;
  }

  private pushEvent(kind: EventMsg["kind"], text: string): void {
    this.events.push({ tick: this.market.tick, kind, text });
    if (this.events.length > 60) this.events.splice(0, this.events.length - 60);
  }

  private buildContext(slot: Scheduled): AgentContext {
    const m = this.market;
    const id = slot.agent.id;
    const acct = m.accounts.get(id)!;
    return {
      tick: m.tick,
      f: m.features,
      fundamental: m.fundamental,
      cash: acct.cash,
      pos: acct.pos,
      equity: m.equity(id),
      bestBid: m.book.bestBid(),
      bestAsk: m.book.bestAsk(),
      last: m.last,
      rng: slot.rng,
      submit: (side, type, price, qty) => void m.submit(id, side, type, price, qty),
      cancelAll: () => void m.book.cancelAll(id),
    };
  }

  /** Advance the world by one tick. */
  step(): void {
    const m = this.market;
    m.tick++;

    if (m.stepFundamental().jumped) {
      this.pushEvent("shock", `news shock: fundamental now ${(m.fundamental / 100).toFixed(2)}`);
    }
    m.refreshFeatures();

    // Wake due agents in random order.
    const due: Scheduled[] = [];
    for (const slot of this.slots) {
      if (slot.nextAct <= m.tick) due.push(slot);
    }
    this.rng.shuffle(due);
    for (const slot of due) {
      slot.agent.act(this.buildContext(slot));
      slot.nextAct = m.tick + slot.agent.cadence + this.rng.int(0, 2);
    }

    if (m.maybeCloseCandle()) this.sampleKindEquity();

    if (m.tick % this.cfg.divInterval === 0) m.payDividends();
    if (m.tick % 25 === 0) this.checkBankruptcies();
    if (m.tick % 40 === 0) {
      for (const slot of this.slots) {
        const agent = slot.agent;
        if (agent instanceof EvolvedTrader) agent.sampleEquity(m.equity(agent.id));
      }
    }
    if (m.tick % 200 === 0) this.refreshFacts();
    if (m.tick % this.cfg.genTicks === 0 && m.tick > 0) this.runGeneration();
  }

  private checkBankruptcies(): void {
    const m = this.market;
    for (const slot of this.slots) {
      const id = slot.agent.id;
      if (m.equity(id) > 0) continue;
      m.liquidate(id);
      const acct = m.accounts.get(id)!;
      acct.cash = this.cfg.endowCash;
      acct.pos = 0;
      acct.blowups++;
      slot.bankrupted = true;
      this.pushEvent("bankruptcy", `${slot.agent.name} went bankrupt and was re-endowed`);
    }
  }

  private runGeneration(): void {
    const m = this.market;
    this.generation++;

    const evolvedSlots = this.slots.filter((s) => s.agent instanceof EvolvedTrader);
    const ranked: RankedIndividual[] = evolvedSlots.map((slot, index) => {
      const trader = slot.agent as EvolvedTrader;
      const equity = m.equity(trader.id);
      trader.sampleEquity(equity);
      let fitness = fitnessOf(
        trader.startEquity,
        equity,
        trader.maxDrawdown,
        trader.genome,
        this.cfg,
      );
      if (slot.bankrupted) fitness = Math.min(fitness, -1.5);
      trader.fitness = fitness;
      return { index, name: trader.name, genome: trader.genome, fitness };
    });

    if (ranked.length < 4) return;

    const best = ranked.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    const mean = ranked.reduce((s, r) => s + r.fitness, 0) / ranked.length;
    const meanNodes = ranked.reduce((s, r) => s + countNodes(r.genome.tree), 0) / ranked.length;
    // Generation 1 is the warm-up window: the market starts cold, so its
    // fitness numbers are outliers. Breed from it, but keep it out of the record.
    if (this.generation > 1) {
      this.genStats.push({
        gen: this.generation,
        best: best.fitness,
        mean,
        meanNodes,
        bestName: best.name,
      });
      if (this.genStats.length > 400) this.genStats.splice(0, this.genStats.length - 400);

      this.hallOfFame.push({
        name: best.name,
        gen: this.generation,
        fitness: best.fitness,
        formula: formatTree(best.genome.tree),
        tree: cloneTree(best.genome.tree),
      });
      this.hallOfFame.sort((a, b) => b.fitness - a.fitness);
      this.hallOfFame.splice(6);
    }

    const breed = selectAndBreed(ranked, this.cfg, this.rng);
    for (let i = 0; i < breed.replacedIndices.length; i++) {
      const slot = evolvedSlots[breed.replacedIndices[i]!]!;
      const oldId = slot.agent.id;
      // The loser's book is dumped into the market (fire sale), then the seat
      // is handed to the offspring with a standard cash endowment.
      m.liquidate(oldId);
      const acct = m.accounts.get(oldId)!;
      acct.cash = this.cfg.endowCash + this.cfg.endowShares * m.mark();
      acct.pos = 0;
      slot.agent = this.newEvolved(oldId, breed.offspring[i]!);
      slot.nextAct = m.tick + this.rng.int(1, 6);
      slot.bankrupted = false;
    }

    // Survivors start a fresh evaluation window from their current equity.
    for (const slot of evolvedSlots) {
      const trader = slot.agent as EvolvedTrader;
      trader.beginWindow(m.equity(trader.id));
      slot.bankrupted = false;
    }

    this.pushEvent(
      "generation",
      `gen ${this.generation}: best ${best.name} fitness ${best.fitness.toFixed(3)}, ` +
        `${breed.replacedIndices.length} strategies replaced`,
    );
  }

  private sampleKindEquity(): void {
    const m = this.market;
    const point: KindEquityPoint = {
      tick: m.tick,
      maker: 0,
      fundamentalist: 0,
      momentum: 0,
      noise: 0,
      evolved: 0,
    };
    for (const slot of this.slots) {
      point[slot.agent.kind] += m.equity(slot.agent.id);
    }
    this.kindEquity.push(point);
    if (this.kindEquity.length > 2400) this.kindEquity.splice(0, this.kindEquity.length - 2400);
  }

  private refreshFacts(): void {
    // Sample every 4th candle (64 ticks) so tick-quantization noise (runs of
    // exactly-zero returns) doesn't swamp the distributional statistics.
    const candles = this.market.candles;
    if (candles.length < 240) return;
    const returns: number[] = [];
    for (let i = 4; i < candles.length; i += 4) {
      const prev = candles[i - 4]!.close;
      if (prev > 0) returns.push(Math.log(candles[i]!.close / prev));
    }
    this.facts = computeStylizedFacts(returns);
  }

  private selectedDetail(): SelectedDetail | null {
    if (this.selectedAgentId === null) return null;
    const slot = this.byId.get(this.selectedAgentId);
    if (!slot) return null;
    const m = this.market;
    const acct = m.accounts.get(slot.agent.id)!;
    const agent = slot.agent;
    return {
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      equity: m.equity(agent.id),
      cash: acct.cash,
      pos: acct.pos,
      volume: acct.volume,
      blowups: acct.blowups,
      genome:
        agent instanceof EvolvedTrader
          ? {
              tree: cloneTree(agent.genome.tree),
              formula: formatTree(agent.genome.tree),
              buyThr: agent.genome.buyThr,
              sellThr: agent.genome.sellThr,
              sizeFrac: agent.genome.sizeFrac,
              offsetTicks: agent.genome.offsetTicks,
              aggression: agent.genome.aggression,
              cadence: agent.genome.cadence,
              lineage: agent.genome.lineage,
              fitness: agent.fitness,
              generationBorn: agent.generationBorn,
            }
          : null,
    };
  }

  snapshot(running: boolean, tps: number): WorldSnapshot {
    const m = this.market;
    const agents: AgentRow[] = this.slots.map((slot) => {
      const acct = m.accounts.get(slot.agent.id)!;
      const row: AgentRow = {
        id: slot.agent.id,
        name: slot.agent.name,
        kind: slot.agent.kind,
        equity: m.equity(slot.agent.id),
        cash: acct.cash,
        pos: acct.pos,
        volume: acct.volume,
        blowups: acct.blowups,
      };
      if (slot.agent instanceof EvolvedTrader) {
        row.fitness = slot.agent.fitness;
        row.generationBorn = slot.agent.generationBorn;
        row.lineage = slot.agent.genome.lineage;
      }
      return row;
    });

    return {
      tick: m.tick,
      running,
      tps,
      generation: this.generation,
      fundamental: m.fundamental,
      last: m.last,
      bestBid: m.book.bestBid(),
      bestAsk: m.book.bestAsk(),
      candles: m.candles.slice(-260),
      bids: m.book.depth("buy", 14),
      asks: m.book.depth("sell", 14),
      tape: m.tape.slice(-42),
      agents,
      genStats: [...this.genStats],
      hallOfFame: this.hallOfFame.map((h) => ({ ...h, tree: cloneTree(h.tree) })),
      facts: this.facts,
      kindEquity: this.kindEquity.slice(-500),
      events: [...this.events],
      selected: this.selectedDetail(),
    };
  }
}
