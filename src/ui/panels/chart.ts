import type { WorldSnapshot } from "../../shared/protocol";
import {
  axisLabel,
  baseline,
  bar,
  fitCanvas,
  gridLines,
  makePanel,
  niceTicks,
  type Panel,
  scale,
  strokePath,
} from "../draw";
import { fmtCompact, fmtPct, fmtPrice } from "../format";
import { DOWN, FUNDAMENTAL, GRID, INK, INK_2, MUTED, UP } from "../theme";

const PAD_L = 8;
const PAD_R = 56;
const PAD_T = 10;
const PAD_B = 18;
const VOL_FRAC = 0.16;

/** Candlestick chart with fundamental overlay, volume, and crosshair tooltip. */
export class ChartPanel {
  private readonly p: Panel;
  private hover: { x: number; y: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly tip: HTMLElement,
    private readonly sub: HTMLElement,
  ) {
    this.p = makePanel(canvas);
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    canvas.addEventListener("mouseleave", () => {
      this.hover = null;
      this.tip.style.display = "none";
    });
  }

  render(snap: WorldSnapshot): void {
    if (!fitCanvas(this.p)) return;
    const { g, w, h } = this.p;
    g.clearRect(0, 0, w, h);
    const candles = snap.candles;
    if (candles.length < 2) return;

    const x0 = PAD_L;
    const x1 = w - PAD_R;
    const yTop = PAD_T;
    const volTop = h - PAD_B - (h - PAD_T - PAD_B) * VOL_FRAC;
    const yBot = volTop - 6;

    let lo = Infinity;
    let hi = -Infinity;
    let maxVol = 1;
    for (const c of candles) {
      lo = Math.min(lo, c.low, c.fundamental);
      hi = Math.max(hi, c.high, c.fundamental);
      maxVol = Math.max(maxVol, c.volume);
    }
    const pad = (hi - lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;

    const xs = scale(0, candles.length - 1, x0 + 4, x1 - 4);
    const ys = scale(lo, hi, yBot, yTop);
    const yv = scale(0, maxVol, h - PAD_B, volTop);

    // Grid + y axis labels.
    const ticks = niceTicks(lo, hi, 5);
    gridLines(g, ticks, ys, x0, x1);
    for (const t of ticks) axisLabel(g, fmtPrice(t), x1 + 6, ys(t));

    // X labels every ~64 candles.
    g.textBaseline = "alphabetic";
    for (let i = 0; i < candles.length; i += 64) {
      axisLabel(g, `t ${fmtCompact(candles[i]!.tick)}`, xs(i), h - 5, "center");
    }

    const bw = Math.max(1, ((x1 - x0) / candles.length) * 0.7);

    // Volume bars (muted, behind price).
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]!;
      if (c.volume === 0) continue;
      g.globalAlpha = 0.45;
      bar(g, xs(i) - bw / 2, yv(c.volume), bw, h - PAD_B, GRID);
      g.globalAlpha = 1;
    }
    baseline(g, volTop - 3, x0, x1);

    // Fundamental overlay (dashed gold).
    strokePath(
      g,
      candles.map((c, i) => [xs(i), ys(c.fundamental)] as [number, number]),
      FUNDAMENTAL,
      1.5,
      [5, 4],
    );

    // Candles.
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i]!;
      const x = xs(i);
      const up = c.close >= c.open;
      const color = up ? UP : DOWN;
      g.strokeStyle = color;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, ys(c.high));
      g.lineTo(x, ys(c.low));
      g.stroke();
      const top = ys(Math.max(c.open, c.close));
      const bot = ys(Math.min(c.open, c.close));
      g.fillStyle = color;
      g.fillRect(x - bw / 2, top, bw, Math.max(1, bot - top));
    }

    // Legend (top-left) — series identity, text in ink.
    g.fillStyle = INK_2;
    g.font = "10px system-ui";
    g.textAlign = "left";
    g.textBaseline = "middle";
    const lastC = candles[candles.length - 1]!;
    g.fillStyle = lastC.close >= lastC.open ? UP : DOWN;
    g.fillRect(x0 + 4, yTop + 2, 8, 8);
    g.fillStyle = INK_2;
    g.fillText("price", x0 + 16, yTop + 6);
    g.strokeStyle = FUNDAMENTAL;
    g.lineWidth = 2;
    g.setLineDash([4, 3]);
    g.beginPath();
    g.moveTo(x0 + 52, yTop + 6);
    g.lineTo(x0 + 66, yTop + 6);
    g.stroke();
    g.setLineDash([]);
    g.fillText("fundamental", x0 + 70, yTop + 6);

    // Current price / fundamental markers on the right edge.
    const markRow = (value: number, color: string, textColor: string): void => {
      const y = Math.min(yBot - 7, Math.max(yTop + 7, ys(value)));
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(x1 + 2, y - 7, PAD_R - 6, 14, 3);
      g.fill();
      axisLabel(g, fmtPrice(value), x1 + PAD_R / 2 - 1, y, "center", textColor, 10);
    };
    markRow(snap.fundamental, "#3a3320", FUNDAMENTAL);
    markRow(snap.last, lastC.close >= lastC.open ? "#12330f" : "#3a1414", INK);

    this.sub.textContent = `${candles.length} × ${snap.candles.length > 0 ? "16-tick" : ""} candles`;

    this.renderHover(snap, xs, ys, x0, x1, yTop, yBot, candles.length);
  }

  private renderHover(
    snap: WorldSnapshot,
    xs: (i: number) => number,
    ys: (v: number) => number,
    x0: number,
    x1: number,
    yTop: number,
    yBot: number,
    n: number,
  ): void {
    const { g, w } = this.p;
    if (!this.hover || this.hover.x < x0 || this.hover.x > x1) {
      this.tip.style.display = "none";
      return;
    }
    const i = Math.max(0, Math.min(n - 1, Math.round(((this.hover.x - xs(0)) / (xs(n - 1) - xs(0))) * (n - 1))));
    const c = snap.candles[i]!;
    const x = xs(i);

    g.strokeStyle = MUTED;
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(x, yTop);
    g.lineTo(x, yBot);
    g.stroke();
    g.setLineDash([]);

    // Marker dots with surface ring on close + fundamental.
    for (const [v, color] of [
      [c.close, c.close >= c.open ? UP : DOWN],
      [c.fundamental, FUNDAMENTAL],
    ] as [number, string][]) {
      g.beginPath();
      g.arc(x, ys(v), 4, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.strokeStyle = "#14161c";
      g.lineWidth = 2;
      g.stroke();
    }

    const prem = c.close / c.fundamental - 1;
    this.tip.innerHTML =
      `<b style="color:${INK}">t ${c.tick.toLocaleString()}</b><br>` +
      `O ${fmtPrice(c.open)} · H ${fmtPrice(c.high)} · L ${fmtPrice(c.low)} · C <b style="color:${c.close >= c.open ? UP : DOWN}">${fmtPrice(c.close)}</b><br>` +
      `fundamental ${fmtPrice(c.fundamental)} · premium <b style="color:${prem >= 0 ? UP : DOWN}">${fmtPct(prem)}</b><br>` +
      `volume ${c.volume.toLocaleString()}`;
    this.tip.style.display = "block";
    const tw = this.tip.offsetWidth;
    this.tip.style.left = `${Math.min(w - tw - 8, Math.max(4, x - tw / 2))}px`;
    this.tip.style.top = "26px";
  }
}
