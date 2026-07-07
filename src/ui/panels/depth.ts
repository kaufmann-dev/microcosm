import type { WorldSnapshot } from "../../shared/protocol";
import { axisLabel, baseline, fitCanvas, makePanel, type Panel, scale } from "../draw";
import { fmtInt, fmtPrice } from "../format";
import { DOWN, INK, MUTED, UP } from "../theme";

/** Classic cumulative depth chart: bids stack leftward, asks rightward. */
export class DepthPanel {
  private readonly p: Panel;
  private hoverX: number | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly tip: HTMLElement,
    private readonly sub: HTMLElement,
  ) {
    this.p = makePanel(canvas);
    canvas.addEventListener("mousemove", (e) => {
      this.hoverX = e.clientX - canvas.getBoundingClientRect().left;
    });
    canvas.addEventListener("mouseleave", () => {
      this.hoverX = null;
      this.tip.style.display = "none";
    });
  }

  render(snap: WorldSnapshot): void {
    if (!fitCanvas(this.p)) return;
    const { g, w, h } = this.p;
    g.clearRect(0, 0, w, h);
    const { bids, asks } = snap;
    if (bids.length === 0 && asks.length === 0) return;

    const padT = 20;
    const padB = 18;
    const yBase = h - padB;

    const prices = [...bids.map((l) => l.price), ...asks.map((l) => l.price)];
    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    const mid = snap.bestBid !== undefined && snap.bestAsk !== undefined
      ? (snap.bestBid + snap.bestAsk) / 2
      : snap.last;
    // Symmetric window around mid so the two sides are visually comparable.
    const span = Math.max(hi - mid, mid - lo, 1) * 1.05;
    lo = mid - span;
    hi = mid + span;

    const xsc = scale(lo, hi, 6, w - 6);

    // Cumulative depth.
    let cum = 0;
    const bidPts: [number, number][] = bids.map((l) => {
      cum += l.qty;
      return [l.price, cum];
    });
    cum = 0;
    const askPts: [number, number][] = asks.map((l) => {
      cum += l.qty;
      return [l.price, cum];
    });
    const maxCum = Math.max(bidPts[bidPts.length - 1]?.[1] ?? 1, askPts[askPts.length - 1]?.[1] ?? 1);
    const ysc = scale(0, maxCum * 1.1, yBase, padT);

    const drawSide = (pts: [number, number][], color: string, toward: -1 | 1): void => {
      if (pts.length === 0) return;
      g.beginPath();
      const startX = xsc(pts[0]![0]);
      g.moveTo(startX, yBase);
      let prevY = ysc(pts[0]![1]);
      g.lineTo(startX, prevY);
      for (let i = 1; i < pts.length; i++) {
        const x = xsc(pts[i]![0]);
        g.lineTo(x, prevY);
        prevY = ysc(pts[i]![1]);
        g.lineTo(x, prevY);
      }
      const endX = toward === -1 ? xsc(lo) : xsc(hi);
      g.lineTo(endX, prevY);
      g.lineTo(endX, yBase);
      g.closePath();
      g.globalAlpha = 0.25;
      g.fillStyle = color;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.stroke();
    };

    drawSide(bidPts, UP, -1);
    drawSide(askPts, DOWN, 1);
    baseline(g, yBase, 0, w);

    // Mid marker.
    const xm = xsc(mid);
    g.strokeStyle = MUTED;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(xm, padT - 6);
    g.lineTo(xm, yBase);
    g.stroke();
    g.setLineDash([]);
    axisLabel(g, fmtPrice(mid), xm, 10, "center", INK, 10);

    // Price axis labels.
    axisLabel(g, fmtPrice(lo), 6, h - 7, "left");
    axisLabel(g, fmtPrice(hi), w - 6, h - 7, "right");

    const spread =
      snap.bestBid !== undefined && snap.bestAsk !== undefined ? snap.bestAsk - snap.bestBid : null;
    const bidQty = bidPts[bidPts.length - 1]?.[1] ?? 0;
    const askQty = askPts[askPts.length - 1]?.[1] ?? 0;
    this.sub.textContent =
      spread === null
        ? "one-sided book"
        : `spread ${fmtPrice(spread)} · ${fmtInt(bidQty)} bid / ${fmtInt(askQty)} ask`;

    this.renderHover(bidPts, askPts, xsc, ysc, lo, hi, mid);
  }

  private renderHover(
    bidPts: [number, number][],
    askPts: [number, number][],
    xsc: (v: number) => number,
    ysc: (v: number) => number,
    lo: number,
    hi: number,
    mid: number,
  ): void {
    if (this.hoverX === null) return;
    const { g, w, h } = this.p;
    const price = lo + ((this.hoverX - 6) / (w - 12)) * (hi - lo);
    const side = price < mid ? bidPts : askPts;
    const isBid = price < mid;
    // Find cumulative qty at this price (bids: levels ≥ price; asks: ≤ price).
    let cumQty = 0;
    let levelPrice = mid;
    for (const [p, c] of side) {
      if (isBid ? p >= price : p <= price) {
        cumQty = c;
        levelPrice = p;
      } else break;
    }
    if (cumQty === 0) {
      this.tip.style.display = "none";
      return;
    }
    const x = xsc(levelPrice);
    const y = ysc(cumQty);
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fillStyle = isBid ? UP : DOWN;
    g.fill();
    g.strokeStyle = "#14161c";
    g.lineWidth = 2;
    g.stroke();

    this.tip.innerHTML =
      `<b style="color:${isBid ? UP : DOWN}">${isBid ? "bids" : "asks"} to ${fmtPrice(levelPrice)}</b><br>` +
      `${fmtInt(cumQty)} shares`;
    this.tip.style.display = "block";
    const tw = this.tip.offsetWidth;
    this.tip.style.left = `${Math.min(w - tw - 6, Math.max(4, x - tw / 2))}px`;
    this.tip.style.top = `${Math.max(4, y - 44)}px`;
    void h;
  }
}
