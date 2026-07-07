import type { WorldSnapshot } from "../../shared/protocol";
import {
  axisLabel,
  baseline,
  fitCanvas,
  makePanel,
  niceTicks,
  type Panel,
  scale,
  strokePath,
} from "../draw";
import { fmtCompact } from "../format";
import { AGENT_KINDS } from "../../sim/types";
import { GRID, INK_2, KIND_COLORS, MUTED } from "../theme";

/**
 * Top half: best/mean GP fitness per generation.
 * Bottom half: share of total wealth held by each agent kind over time.
 */
export class EvolutionPanel {
  private readonly p: Panel;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sub: HTMLElement,
  ) {
    this.p = makePanel(canvas);
  }

  render(snap: WorldSnapshot): void {
    if (!fitCanvas(this.p)) return;
    const { g, w, h } = this.p;
    g.clearRect(0, 0, w, h);

    const half = Math.round(h * 0.48);
    this.renderFitness(snap, 4, 4, w - 8, half - 8);
    this.renderWealthShare(snap, 4, half + 4, w - 8, h - half - 10);

    const lastGen = snap.genStats[snap.genStats.length - 1];
    this.sub.textContent = lastGen
      ? `gen ${lastGen.gen} · best ${lastGen.bestName} · avg tree ${lastGen.meanNodes.toFixed(1)} nodes`
      : "first generation still trading";
  }

  private renderFitness(snap: WorldSnapshot, x0: number, y0: number, w: number, h: number): void {
    const { g } = this.p;
    const stats = snap.genStats;
    const padR = 40;
    if (stats.length < 2) {
      axisLabel(g, "fitness by generation — waiting for gen 2", x0 + 4, y0 + h / 2, "left", MUTED);
      return;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of stats) {
      lo = Math.min(lo, s.mean, s.best);
      hi = Math.max(hi, s.mean, s.best);
    }
    const pad = (hi - lo) * 0.15 || 0.01;
    lo -= pad;
    hi += pad;
    const xs = scale(0, stats.length - 1, x0, x0 + w - padR);
    const ys = scale(lo, hi, y0 + h, y0 + 8);

    for (const t of niceTicks(lo, hi, 3)) {
      g.strokeStyle = GRID;
      g.beginPath();
      g.moveTo(x0, Math.round(ys(t)) + 0.5);
      g.lineTo(x0 + w - padR, Math.round(ys(t)) + 0.5);
      g.stroke();
      axisLabel(g, t.toFixed(2), x0 + w - padR + 4, ys(t));
    }
    if (lo < 0 && hi > 0) {
      g.strokeStyle = MUTED;
      g.setLineDash([2, 3]);
      g.beginPath();
      g.moveTo(x0, ys(0));
      g.lineTo(x0 + w - padR, ys(0));
      g.stroke();
      g.setLineDash([]);
    }

    strokePath(g, stats.map((s, i) => [xs(i), ys(s.mean)] as [number, number]), MUTED, 1.5);
    strokePath(
      g,
      stats.map((s, i) => [xs(i), ys(s.best)] as [number, number]),
      KIND_COLORS.evolved,
      2,
    );

    // Direct labels at line ends (selective, not every point), pushed apart
    // when the two series converge.
    const last = stats[stats.length - 1]!;
    let yBest = ys(last.best) - 7;
    let yMean = ys(last.mean) + 8;
    if (yMean - yBest < 14) {
      const mid = (yBest + yMean) / 2;
      yBest = mid - 7;
      yMean = mid + 7;
    }
    axisLabel(g, "best", xs(stats.length - 1) + 3, yBest, "left", KIND_COLORS.evolved);
    axisLabel(g, "mean", xs(stats.length - 1) + 3, yMean, "left", MUTED);
  }

  private renderWealthShare(
    snap: WorldSnapshot,
    x0: number,
    y0: number,
    w: number,
    h: number,
  ): void {
    const { g } = this.p;
    const pts = snap.kindEquity;
    if (pts.length < 2) return;
    const xs = scale(0, pts.length - 1, x0, x0 + w);
    const plotH = h - 14;

    // Stacked shares, bottom-up in fixed kind order.
    let prevTops: number[] = new Array<number>(pts.length).fill(y0 + 14 + plotH);
    for (const kind of AGENT_KINDS) {
      const tops: number[] = [];
      g.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const total = p.maker + p.fundamentalist + p.momentum + p.noise + p.evolved || 1;
        const share = p[kind] / total;
        const top = prevTops[i]! - share * plotH;
        tops.push(top);
        if (i === 0) g.moveTo(xs(0), top);
        else g.lineTo(xs(i), top);
      }
      for (let i = pts.length - 1; i >= 0; i--) g.lineTo(xs(i), prevTops[i]!);
      g.closePath();
      g.globalAlpha = 0.75;
      g.fillStyle = KIND_COLORS[kind];
      g.fill();
      g.globalAlpha = 1;
      prevTops = tops;
    }
    baseline(g, y0 + 14 + plotH, x0, x0 + w);
    axisLabel(g, "wealth share by kind", x0, y0 + 6, "left", INK_2);
    axisLabel(
      g,
      `t ${fmtCompact(pts[0]!.tick)} → ${fmtCompact(pts[pts.length - 1]!.tick)}`,
      x0 + w,
      y0 + 6,
      "right",
      MUTED,
    );
  }
}
