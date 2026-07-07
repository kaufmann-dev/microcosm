/** Prices/cash are integer ticks: 1 tick = $0.01. */

export function fmtPrice(ticks: number): string {
  return (ticks / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtMoney(ticks: number): string {
  const dollars = ticks / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

export function fmtSigned(ticks: number): string {
  const s = fmtMoney(Math.abs(ticks));
  return ticks >= 0 ? `+${s}` : `-${s}`;
}

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtInt(x: number): string {
  return Math.round(x).toLocaleString("en-US");
}

export function fmtCompact(x: number): string {
  const abs = Math.abs(x);
  if (abs >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(x / 1_000).toFixed(1)}k`;
  return `${Math.round(x)}`;
}
