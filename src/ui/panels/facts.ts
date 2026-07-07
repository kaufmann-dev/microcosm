import type { WorldSnapshot } from "../../shared/protocol";
import { axisLabel, bar, baseline, fitCanvas, makePanel, type Panel, scale, strokePath } from "../draw";
import { normalPdf } from "../../sim/stats";
import { FUNDAMENTAL, INK_2, KIND_COLORS, MUTED } from "../theme";

/**
 * The scientific scoreboard: does the artificial market reproduce real-market
 * statistics? Fat-tailed returns (histogram vs normal overlay), no memory in
 * raw returns but long memory in |returns| (ACF pair).
 */
export class FactsPanel {
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
    const facts = snap.facts;
    if (!facts || facts.n < 50) {
      axisLabel(g, "collecting returns…", 10, h / 2, "left", MUTED, 11);
      this.sub.textContent = "";
      return;
    }

    this.sub.textContent = `${facts.n} returns · kurtosis ${facts.kurtosis.toFixed(1)} · skew ${facts.skew.toFixed(2)}`;

    const histH = Math.round(h * 0.5);
    this.renderHistogram(snap, 8, 6, w - 16, histH - 22);
    this.renderAcf(snap, 8, histH + 6, w - 16, h - histH - 14);
  }

  private renderHistogram(snap: WorldSnapshot, x0: number, y0: number, w: number, h: number): void {
    const { g } = this.p;
    const { histogram, n, kurtosis } = snap.facts!;
    const bins = histogram.counts.length;
    const total = histogram.counts.reduce((a, b) => a + b, 0) || 1;
    const binW = (histogram.edges[1]! - histogram.edges[0]!);

    // √density scale so the tails stay visible next to the peak.
    const maxDensity = Math.max(...histogram.counts) / (total * binW);
    const ysc = scale(0, Math.sqrt(Math.max(maxDensity, normalPdf(0))) * 1.05, y0 + h, y0 + 10);
    const xsc = scale(histogram.edges[0]!, histogram.edges[bins]!, x0, x0 + w);

    const bw = Math.max(1, w / bins - 2);
    for (let i = 0; i < bins; i++) {
      const density = histogram.counts[i]! / (total * binW);
      if (density === 0) continue;
      const xm = (histogram.edges[i]! + histogram.edges[i + 1]!) / 2;
      bar(g, xsc(xm) - bw / 2, ysc(Math.sqrt(density)), bw, y0 + h, KIND_COLORS.maker);
    }
    baseline(g, y0 + h, x0, x0 + w);

    // Normal(0,1) overlay: what returns would look like without the agents.
    const pts: [number, number][] = [];
    for (let z = histogram.edges[0]!; z <= histogram.edges[bins]!; z += 0.15) {
      pts.push([xsc(z), ysc(Math.sqrt(normalPdf(z)))]);
    }
    strokePath(g, pts, FUNDAMENTAL, 1.5, [4, 3]);

    axisLabel(g, `return distribution (√density) — excess kurtosis ${kurtosis.toFixed(1)}`, x0, y0 + 3, "left", INK_2);
    axisLabel(g, "normal", xsc(2.2), ysc(Math.sqrt(normalPdf(2.2))) - 8, "left", FUNDAMENTAL);
    axisLabel(g, "-6σ", x0, y0 + h + 8, "left", MUTED, 9);
    axisLabel(g, "0", x0 + w / 2, y0 + h + 8, "center", MUTED, 9);
    axisLabel(g, "+6σ", x0 + w, y0 + h + 8, "right", MUTED, 9);
    void n;
  }

  private renderAcf(snap: WorldSnapshot, x0: number, y0: number, w: number, h: number): void {
    const { g } = this.p;
    const { acfReturns, acfAbs, n } = snap.facts!;
    const lags = acfReturns.length;
    const mid = y0 + 12 + (h - 22) * 0.62; // zero line, room for negative bars
    const ysc = scale(0, 0.5, 0, -(h - 22) * 0.62);
    const xsc = scale(0, lags, x0, x0 + w);
    const groupW = w / lags;
    const bw = Math.max(1, groupW / 2 - 1.5);

    // Significance band ±1.96/√N.
    const sig = 1.96 / Math.sqrt(n);
    g.strokeStyle = MUTED;
    g.setLineDash([2, 3]);
    for (const s of [sig, -sig]) {
      const yy = mid + ysc(s);
      g.beginPath();
      g.moveTo(x0, yy);
      g.lineTo(x0 + w, yy);
      g.stroke();
    }
    g.setLineDash([]);

    for (let i = 0; i < lags; i++) {
      const xg = xsc(i) + 1;
      const r = Math.max(-0.5, Math.min(0.5, acfReturns[i]!));
      const a = Math.max(-0.5, Math.min(0.5, acfAbs[i]!));
      bar(g, xg, mid + ysc(r), bw, mid, MUTED);
      bar(g, xg + bw + 1.5, mid + ysc(a), bw, mid, KIND_COLORS.evolved);
    }
    baseline(g, mid, x0, x0 + w);

    axisLabel(g, "autocorrelation by lag:", x0, y0 + 4, "left", INK_2);
    axisLabel(g, "returns", x0 + 122, y0 + 4, "left", MUTED);
    axisLabel(g, "|returns|", x0 + 168, y0 + 4, "left", KIND_COLORS.evolved);
    axisLabel(g, "lag 1", x0 + 2, mid + 9, "left", MUTED, 9);
    axisLabel(g, `${lags}`, x0 + w - 2, mid + 9, "right", MUTED, 9);
  }
}
