/// <reference lib="webworker" />
import type { FromWorker, ToWorker } from "./shared/protocol";
import { defaultConfig } from "./sim/config";
import { World } from "./sim/engine";

let world = new World(defaultConfig());
let running = true;
let ticksPerFrame = 24;

/** Measured throughput. */
let tickCount = 0;
let tpsWindowStart = performance.now();
let tps = 0;

const FRAME_MS = 33;

function post(msg: FromWorker): void {
  (self as unknown as Worker).postMessage(msg);
}

function frame(): void {
  if (running) {
    for (let i = 0; i < ticksPerFrame; i++) world.step();
    tickCount += ticksPerFrame;
  }
  const now = performance.now();
  if (now - tpsWindowStart >= 1000) {
    tps = Math.round((tickCount * 1000) / (now - tpsWindowStart));
    tickCount = 0;
    tpsWindowStart = now;
  }
  post({ type: "snapshot", snap: world.snapshot(running, tps) });
}

setInterval(frame, FRAME_MS);

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      world = new World(msg.cfg);
      break;
    case "speed":
      ticksPerFrame = Math.max(1, Math.min(400, msg.ticksPerFrame));
      break;
    case "pause":
      running = false;
      break;
    case "resume":
      running = true;
      break;
    case "shock":
      world.market.injectShock(msg.direction);
      break;
    case "select":
      world.selectedAgentId = msg.agentId;
      break;
    case "reset":
      world = new World(defaultConfig(msg.seed));
      break;
  }
};
