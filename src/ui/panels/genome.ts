import type { GenomeDetail, WorldSnapshot } from "../../shared/protocol";
import type { GNode } from "../../sim/gp/nodes";
import { fitCanvas, makePanel, type Panel } from "../draw";
import { fmtMoney, fmtPct } from "../format";
import { BORDER, FONT, FUNDAMENTAL, INK, INK_2, KIND_COLORS, KIND_LABELS, MUTED, SURFACE_2 } from "../theme";

interface LaidNode {
  node: GNode;
  x: number;
  depth: number;
  kids: LaidNode[];
}

const KIND_BLURB: Record<string, string> = {
  maker: "Hand-coded market maker: quotes an inventory-skewed two-level ladder around mid; spread widens with volatility.",
  fundamentalist:
    "Hand-coded value trader: noisy private estimate of the fundamental, trades when price deviates beyond its entry threshold.",
  momentum:
    "Hand-coded trend follower: EMA-ratio and medium-horizon return signal, buys strength, sells weakness.",
  noise: "Hand-coded noise trader: random uninformed order flow near the touch.",
};

/** Renders the selected evolved agent's strategy program as a tree. */
export class GenomePanel {
  private readonly p: Panel;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly head: HTMLElement,
    private readonly formula: HTMLElement,
    private readonly sub: HTMLElement,
  ) {
    this.p = makePanel(canvas);
  }

  render(snap: WorldSnapshot): void {
    const sel = snap.selected;
    let genome: GenomeDetail | null = sel?.genome ?? null;
    let title = "";

    if (sel && genome) {
      title = `${sel.name} — live genome`;
      this.head.innerHTML = [
        stat(sel.name, "agent", KIND_COLORS.evolved),
        stat(fmtMoney(sel.equity), "equity"),
        stat(String(sel.pos), "position"),
        stat(genome.fitness.toFixed(3), "fitness"),
        stat(`gen ${genome.generationBorn}`, "born"),
        stat(`L${genome.lineage}`, "lineage"),
        stat(genome.buyThr.toFixed(2), "buy thr"),
        stat(genome.sellThr.toFixed(2), "sell thr"),
        stat(fmtPct(genome.sizeFrac, 0), "size"),
        stat(fmtPct(genome.aggression, 0), "aggression"),
        stat(`${genome.cadence}t`, "cadence"),
      ].join("");
    } else if (sel) {
      title = `${sel.name} — hand-coded`;
      this.head.innerHTML = [
        stat(sel.name, "agent", KIND_COLORS[sel.kind]),
        stat(KIND_LABELS[sel.kind], "type"),
        stat(fmtMoney(sel.equity), "equity"),
        stat(String(sel.pos), "position"),
        stat(String(sel.volume), "volume"),
        stat(String(sel.blowups), "blowups"),
      ].join("");
    } else if (snap.hallOfFame.length > 0) {
      const hof = snap.hallOfFame[0]!;
      title = `hall of fame #1 — ${hof.name} (gen ${hof.gen})`;
      genome = null;
      this.head.innerHTML = [
        stat(hof.name, "all-time best", KIND_COLORS.evolved),
        stat(hof.fitness.toFixed(3), "fitness"),
        stat(`gen ${hof.gen}`, "from"),
      ].join("");
      this.drawTree(hof.tree);
      this.formula.textContent = `signal = ${hof.formula}`;
      this.sub.textContent = title;
      return;
    } else {
      this.head.innerHTML = "";
      this.formula.textContent = "";
      this.sub.textContent = "click an agent below";
      this.drawEmpty("Waiting for the first generation…");
      return;
    }

    this.sub.textContent = title;
    if (genome) {
      this.drawTree(genome.tree);
      this.formula.textContent = `signal = ${genome.formula}   →   buy if signal > ${genome.buyThr.toFixed(2)}, sell if < ${genome.sellThr.toFixed(2)}`;
    } else if (sel) {
      this.formula.textContent = "";
      this.drawEmpty(KIND_BLURB[sel.kind] ?? "");
    }
  }

  private drawEmpty(text: string): void {
    if (!fitCanvas(this.p)) return;
    const { g, w, h } = this.p;
    g.clearRect(0, 0, w, h);
    g.fillStyle = MUTED;
    g.font = `11px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    // Simple word wrap.
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (g.measureText(`${line} ${word}`).width > w - 60 && line) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - lines.length / 2 + 0.5) * 16));
  }

  private drawTree(root: GNode): void {
    if (!fitCanvas(this.p)) return;
    const { g, w, h } = this.p;
    g.clearRect(0, 0, w, h);

    // Tidy-ish layout: leaves get sequential x slots, parents center over kids.
    let nextLeaf = 0;
    let maxDepth = 0;
    const layout = (node: GNode, depth: number): LaidNode => {
      maxDepth = Math.max(maxDepth, depth);
      if (node.kids.length === 0) {
        return { node, x: nextLeaf++, depth, kids: [] };
      }
      const kids = node.kids.map((k) => layout(k, depth + 1));
      const x = kids.reduce((s, k) => s + k.x, 0) / kids.length;
      return { node, x, depth, kids };
    };
    const laid = layout(root, 0);
    const nLeaves = Math.max(1, nextLeaf);

    const padX = 30;
    const padY = 16;
    const xsc = (x: number): number =>
      nLeaves === 1 ? w / 2 : padX + (x / (nLeaves - 1)) * (w - padX * 2);
    const ysc = (d: number): number =>
      maxDepth === 0 ? h / 2 : padY + (d / maxDepth) * (h - padY * 2);

    g.font = `10px ${FONT}`;
    const edges = (n: LaidNode): void => {
      for (const k of n.kids) {
        g.strokeStyle = BORDER;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(xsc(n.x), ysc(n.depth) + 8);
        g.bezierCurveTo(
          xsc(n.x),
          ysc(n.depth) + 22,
          xsc(k.x),
          ysc(k.depth) - 22,
          xsc(k.x),
          ysc(k.depth) - 8,
        );
        g.stroke();
        edges(k);
      }
    };
    edges(laid);

    const nodes = (n: LaidNode): void => {
      const label =
        n.node.op === "const" ? (n.node.value ?? 0).toFixed(2) : n.node.op;
      const isTerminal = n.node.kids.length === 0;
      const isConst = n.node.op === "const";
      const tw = g.measureText(label).width + 12;
      const x = xsc(n.x);
      const y = ysc(n.depth);
      g.fillStyle = SURFACE_2;
      g.strokeStyle = isTerminal ? (isConst ? FUNDAMENTAL : KIND_COLORS.maker) : KIND_COLORS.evolved;
      g.lineWidth = 1;
      g.beginPath();
      g.roundRect(x - tw / 2, y - 9, tw, 18, 5);
      g.fill();
      g.stroke();
      g.fillStyle = isTerminal ? (isConst ? FUNDAMENTAL : INK_2) : INK;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, x, y + 0.5);
      for (const k of n.kids) nodes(k);
    };
    nodes(laid);
  }
}

function stat(value: string, label: string, color?: string): string {
  const style = color ? ` style="color:${color}"` : "";
  return `<div class="g"><b${style}>${value}</b><span>${label}</span></div>`;
}
