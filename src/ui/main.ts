import type { FromWorker, ToWorker, WorldSnapshot } from "../shared/protocol";
import { defaultConfig } from "../sim/config";
import { fmtInt, fmtPct, fmtPrice } from "./format";
import { BoardPanel } from "./panels/board";
import { ChartPanel } from "./panels/chart";
import { DepthPanel } from "./panels/depth";
import { EventsPanel } from "./panels/events";
import { EvolutionPanel } from "./panels/evolution";
import { FactsPanel } from "./panels/facts";
import { GenomePanel } from "./panels/genome";
import { TapePanel } from "./panels/tape";
import { DOWN, UP } from "./theme";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const worker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
const send = (msg: ToWorker): void => worker.postMessage(msg);

const cfg = defaultConfig();
const endowEquity = cfg.endowCash + cfg.endowShares * cfg.fundamental0;

let latest: WorldSnapshot | null = null;
let snapDirty = false;
let paused = false;
let selectedId: number | null = null;

const chart = new ChartPanel($("cv-chart"), $("chart-tip"), $("chart-sub"));
const depth = new DepthPanel($("cv-depth"), $("depth-tip"), $("depth-sub"));
const tape = new TapePanel($("tape"));
const evolution = new EvolutionPanel($("cv-evo"), $("evo-sub"));
const genome = new GenomePanel($("cv-genome"), $("genome-head"), $("genome-formula"), $("genome-sub"));
const facts = new FactsPanel($("cv-facts"), $("facts-sub"));
const board = new BoardPanel($("board"), $("board-sub"), endowEquity, (id) => {
  selectedId = selectedId === id ? null : id;
  send({ type: "select", agentId: selectedId });
});
const events = new EventsPanel($("events"));

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  if (e.data.type === "snapshot") {
    latest = e.data.snap;
    snapDirty = true;
  }
};

// ---- controls ----

const pauseBtn = $("btn-pause");
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  send({ type: paused ? "pause" : "resume" });
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});

const speed = $<HTMLInputElement>("speed");
const speedLabel = $("speed-label");
function applySpeed(): void {
  // Exponential mapping: slider 0..100 → 1..400 ticks per frame (30fps).
  const tpf = Math.max(1, Math.round(400 ** (Number(speed.value) / 100)));
  send({ type: "speed", ticksPerFrame: tpf });
  speedLabel.textContent = `${fmtInt(tpf * 30)} t/s`;
}
speed.addEventListener("input", applySpeed);
applySpeed();

$("btn-crash").addEventListener("click", () => send({ type: "shock", direction: -1 }));
$("btn-boom").addEventListener("click", () => send({ type: "shock", direction: 1 }));
$("btn-reset").addEventListener("click", () => {
  selectedId = null;
  send({ type: "reset", seed: Math.floor(Math.random() * 2 ** 31) });
  send({ type: "select", agentId: null });
});

// ---- render loop ----

const hPrice = $("h-price");
const hFund = $("h-fund");
const hPrem = $("h-prem");
const hTick = $("h-tick");
const hGen = $("h-gen");
const hTps = $("h-tps");

let lastSlowRender = 0;

function renderHeader(snap: WorldSnapshot): void {
  hPrice.textContent = fmtPrice(snap.last);
  hFund.textContent = fmtPrice(snap.fundamental);
  const prem = snap.last / snap.fundamental - 1;
  hPrem.textContent = fmtPct(prem);
  hPrem.style.color = prem >= 0 ? UP : DOWN;
  hTick.textContent = snap.tick.toLocaleString();
  hGen.textContent = String(snap.generation);
  hTps.textContent = fmtInt(snap.tps);
}

function frame(now: number): void {
  if (latest && snapDirty) {
    snapDirty = false;
    renderHeader(latest);
    chart.render(latest);
    depth.render(latest);
    evolution.render(latest);
    facts.render(latest);
    genome.render(latest);
    // DOM-heavy panels: throttle to ~3Hz.
    if (now - lastSlowRender > 320) {
      lastSlowRender = now;
      tape.render(latest);
      board.render(latest, selectedId);
      events.render(latest);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
