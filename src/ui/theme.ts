import type { AgentKind } from "../sim/types";

/**
 * Dark-only trading-terminal theme. Categorical kind colors validated with the
 * dataviz palette checker against SURFACE (worst adjacent CVD ΔE 27.6, all
 * slots ≥3:1 contrast). Up/down are status colors, reserved for polarity.
 */
export const PAGE = "#0d0f14";
export const SURFACE = "#14161c";
export const SURFACE_2 = "#191c24";
export const BORDER = "rgba(255,255,255,0.08)";
export const INK = "#f2f4f8";
export const INK_2 = "#c3c6cf";
export const MUTED = "#8b8f99";
export const GRID = "#23262e";
export const BASELINE = "#383b44";

export const UP = "#0ca30c";
export const DOWN = "#d03b3b";
export const FUNDAMENTAL = "#c9a227";

export const KIND_COLORS: Record<AgentKind, string> = {
  maker: "#3987e5",
  fundamentalist: "#199e70",
  momentum: "#d95926",
  noise: "#d55181",
  evolved: "#9085e9",
};

export const KIND_LABELS: Record<AgentKind, string> = {
  maker: "Market maker",
  fundamentalist: "Fundamentalist",
  momentum: "Momentum",
  noise: "Noise",
  evolved: "Evolved (GP)",
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO_NUM = "tabular-nums";
