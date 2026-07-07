import { BASELINE, FONT, GRID, MUTED } from "./theme";

/** A canvas sized to its CSS box at devicePixelRatio, with a 2D context. */
export interface Panel {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** (Re)fit the canvas backing store to its CSS size. Returns false if hidden. */
export function fitCanvas(p: Panel): boolean {
  const rect = p.canvas.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return false;
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(rect.width * dpr);
  const bh = Math.round(rect.height * dpr);
  if (p.canvas.width !== bw || p.canvas.height !== bh) {
    p.canvas.width = bw;
    p.canvas.height = bh;
  }
  p.w = rect.width;
  p.h = rect.height;
  p.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

export function makePanel(canvas: HTMLCanvasElement): Panel {
  return { canvas, g: canvas.getContext("2d")!, w: 0, h: 0 };
}

/** Linear scale factory. */
export function scale(d0: number, d1: number, r0: number, r1: number): (x: number) => number {
  const dd = d1 - d0 || 1;
  return (x: number) => r0 + ((x - d0) / dd) * (r1 - r0);
}

/** Nice round tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return [lo];
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  let step = mag;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (mag * m >= step0) {
      step = mag * m;
      break;
    }
  }
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

export function gridLines(
  g: CanvasRenderingContext2D,
  ticks: number[],
  y: (v: number) => number,
  x0: number,
  x1: number,
): void {
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  g.beginPath();
  for (const t of ticks) {
    const yy = Math.round(y(t)) + 0.5;
    g.moveTo(x0, yy);
    g.lineTo(x1, yy);
  }
  g.stroke();
}

export function axisLabel(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign = "left",
  color = MUTED,
  size = 10,
): void {
  g.fillStyle = color;
  g.font = `${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(text, x, y);
}

export function strokePath(
  g: CanvasRenderingContext2D,
  pts: [number, number][],
  color: string,
  width = 2,
  dash: number[] = [],
): void {
  if (pts.length < 2) return;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash(dash);
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.stroke();
  g.setLineDash([]);
}

export function baseline(g: CanvasRenderingContext2D, y: number, x0: number, x1: number): void {
  g.strokeStyle = BASELINE;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x0, Math.round(y) + 0.5);
  g.lineTo(x1, Math.round(y) + 0.5);
  g.stroke();
}

/** Rounded-top bar anchored to a baseline (per mark spec: 4px radius max). */
export function bar(
  g: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  w: number,
  yBase: number,
  color: string,
): void {
  const r = Math.min(2, w / 2, Math.abs(yBase - yTop));
  g.fillStyle = color;
  g.beginPath();
  if (yTop <= yBase) {
    g.moveTo(x, yBase);
    g.lineTo(x, yTop + r);
    g.arcTo(x, yTop, x + r, yTop, r);
    g.lineTo(x + w - r, yTop);
    g.arcTo(x + w, yTop, x + w, yTop + r, r);
    g.lineTo(x + w, yBase);
  } else {
    g.moveTo(x, yBase);
    g.lineTo(x, yTop - r);
    g.arcTo(x, yTop, x + r, yTop, r);
    g.lineTo(x + w - r, yTop);
    g.arcTo(x + w, yTop, x + w, yTop - r, r);
    g.lineTo(x + w, yBase);
  }
  g.closePath();
  g.fill();
}
