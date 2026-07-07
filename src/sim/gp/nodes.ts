import type { Rng } from "../rng";

/**
 * Strategy programs are expression trees over standardized market features.
 * A tree evaluates to a real-valued trading signal; the genome's thresholds
 * turn the signal into orders.
 */

export const TERMINALS = [
  "ret1",
  "ret8",
  "ret64",
  "emaRatio",
  "vol",
  "spreadRel",
  "imbalance",
  "tapePressure",
  "valueGap",
  "inv",
  "cashFrac",
] as const;

export type TerminalOp = (typeof TERMINALS)[number];

export type UnaryOp = "neg" | "abs" | "tanh" | "sign";
export type BinaryOp = "add" | "sub" | "mul" | "div" | "min" | "max";
/** ifpos(a, b, c) = a > 0 ? b : c — gives evolution branching logic. */
export type TernaryOp = "ifpos";

export type Op = TerminalOp | "const" | UnaryOp | BinaryOp | TernaryOp;

export const UNARY: readonly UnaryOp[] = ["neg", "abs", "tanh", "sign"];
export const BINARY: readonly BinaryOp[] = ["add", "sub", "mul", "div", "min", "max"];

/** Plain-JSON tree node so genomes survive structuredClone/postMessage. */
export interface GNode {
  op: Op;
  /** Only for op === "const". */
  value?: number;
  kids: GNode[];
}

export type GpInputs = Record<TerminalOp, number>;

export function arity(op: Op): number {
  if (op === "ifpos") return 3;
  if ((BINARY as readonly string[]).includes(op)) return 2;
  if ((UNARY as readonly string[]).includes(op)) return 1;
  return 0;
}

const CLAMP = 1e6;

function clampVal(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x > CLAMP) return CLAMP;
  if (x < -CLAMP) return -CLAMP;
  return x;
}

export function evalTree(node: GNode, inputs: GpInputs): number {
  switch (node.op) {
    case "const":
      return node.value ?? 0;
    case "neg":
      return -evalTree(node.kids[0]!, inputs);
    case "abs":
      return Math.abs(evalTree(node.kids[0]!, inputs));
    case "tanh":
      return Math.tanh(evalTree(node.kids[0]!, inputs));
    case "sign":
      return Math.sign(evalTree(node.kids[0]!, inputs));
    case "add":
      return clampVal(evalTree(node.kids[0]!, inputs) + evalTree(node.kids[1]!, inputs));
    case "sub":
      return clampVal(evalTree(node.kids[0]!, inputs) - evalTree(node.kids[1]!, inputs));
    case "mul":
      return clampVal(evalTree(node.kids[0]!, inputs) * evalTree(node.kids[1]!, inputs));
    case "div": {
      const den = evalTree(node.kids[1]!, inputs);
      return clampVal(Math.abs(den) < 1e-6 ? 1 : evalTree(node.kids[0]!, inputs) / den);
    }
    case "min":
      return Math.min(evalTree(node.kids[0]!, inputs), evalTree(node.kids[1]!, inputs));
    case "max":
      return Math.max(evalTree(node.kids[0]!, inputs), evalTree(node.kids[1]!, inputs));
    case "ifpos":
      return evalTree(node.kids[0]!, inputs) > 0
        ? evalTree(node.kids[1]!, inputs)
        : evalTree(node.kids[2]!, inputs);
    default:
      // Terminal feature lookup.
      return inputs[node.op] ?? 0;
  }
}

export function countNodes(node: GNode): number {
  let n = 1;
  for (const k of node.kids) n += countNodes(k);
  return n;
}

export function treeDepth(node: GNode): number {
  let d = 0;
  for (const k of node.kids) d = Math.max(d, treeDepth(k));
  return d + 1;
}

export function cloneTree(node: GNode): GNode {
  const out: GNode = { op: node.op, kids: node.kids.map(cloneTree) };
  if (node.value !== undefined) out.value = node.value;
  return out;
}

export interface NodeRef {
  node: GNode;
  parent: GNode | null;
  childIndex: number;
}

export function collectNodes(root: GNode): NodeRef[] {
  const out: NodeRef[] = [{ node: root, parent: null, childIndex: -1 }];
  const walk = (parent: GNode): void => {
    parent.kids.forEach((kid, i) => {
      out.push({ node: kid, parent, childIndex: i });
      walk(kid);
    });
  };
  walk(root);
  return out;
}

function randomTerminal(rng: Rng): GNode {
  if (rng.bool(0.18)) {
    return { op: "const", value: Number(rng.range(-2, 2).toFixed(3)), kids: [] };
  }
  return { op: rng.pick(TERMINALS), kids: [] };
}

/**
 * Random tree via the classic grow/full methods. `full` builds function nodes
 * down to exactly `depth`; `grow` may stop early.
 */
export function randomTree(rng: Rng, depth: number, method: "grow" | "full"): GNode {
  if (depth <= 1 || (method === "grow" && rng.bool(0.3))) {
    return randomTerminal(rng);
  }
  const r = rng.next();
  let op: Op;
  if (r < 0.12) op = "ifpos";
  else if (r < 0.72) op = rng.pick(BINARY);
  else op = rng.pick(UNARY);
  const kids: GNode[] = [];
  for (let i = 0; i < arity(op); i++) kids.push(randomTree(rng, depth - 1, method));
  return { op, kids };
}

/** Compact human-readable formula for the genome inspector. */
export function formatTree(node: GNode): string {
  switch (arity(node.op)) {
    case 0:
      return node.op === "const" ? (node.value ?? 0).toFixed(2) : node.op;
    case 1:
      return `${node.op}(${formatTree(node.kids[0]!)})`;
    case 2: {
      const sym: Partial<Record<Op, string>> = { add: "+", sub: "-", mul: "*", div: "/" };
      const s = sym[node.op];
      if (s) return `(${formatTree(node.kids[0]!)} ${s} ${formatTree(node.kids[1]!)})`;
      return `${node.op}(${formatTree(node.kids[0]!)}, ${formatTree(node.kids[1]!)})`;
    }
    default:
      return `if(${formatTree(node.kids[0]!)} > 0, ${formatTree(node.kids[1]!)}, ${formatTree(node.kids[2]!)})`;
  }
}
