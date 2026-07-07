import type { AgentRow, WorldSnapshot } from "../../shared/protocol";
import { fmtCompact, fmtMoney, fmtSigned } from "../format";
import { DOWN, KIND_COLORS, KIND_LABELS, UP } from "../theme";

/** Agent leaderboard table. Click a row to inspect the agent. */
export class BoardPanel {
  constructor(
    private readonly el: HTMLElement,
    private readonly sub: HTMLElement,
    private readonly endowEquity: number,
    private readonly onSelect: (id: number) => void,
  ) {
    el.addEventListener("click", (e) => {
      const row = (e.target as HTMLElement).closest("tr[data-id]");
      if (row) this.onSelect(Number((row as HTMLElement).dataset["id"]));
    });
  }

  render(snap: WorldSnapshot, selectedId: number | null): void {
    const rows = [...snap.agents].sort((a, b) => b.equity - a.equity);
    const bankrupt = snap.agents.reduce((s, a) => s + a.blowups, 0);
    this.sub.textContent = `${rows.length} agents · ${bankrupt} lifetime bankruptcies`;

    const cells = rows
      .map((a, i) => {
        const pnl = a.equity - this.endowEquity;
        return `<tr data-id="${a.id}"${a.id === selectedId ? ' class="sel"' : ""}>
<td>${i + 1}</td>
<td><span class="chip" style="background:${KIND_COLORS[a.kind]}"></span>${a.name}</td>
<td style="text-align:left;color:${KIND_COLORS[a.kind]}">${KIND_LABELS[a.kind]}</td>
<td>${fmtMoney(a.equity)}</td>
<td style="color:${pnl >= 0 ? UP : DOWN}">${fmtSigned(pnl)}</td>
<td>${a.pos}</td>
<td>${fmtCompact(a.volume)}</td>
<td>${a.fitness !== undefined ? a.fitness.toFixed(3) : "—"}</td>
<td>${a.generationBorn !== undefined ? a.generationBorn : "—"}</td>
<td>${a.blowups || ""}</td>
</tr>`;
      })
      .join("");

    this.el.innerHTML = `<table>
<thead><tr><th>#</th><th>Agent</th><th style="text-align:left">Type</th><th>Equity</th><th>P&amp;L</th><th>Pos</th><th>Vol</th><th>Fitness</th><th>Born</th><th>†</th></tr></thead>
<tbody>${cells}</tbody></table>`;
  }
}

export function agentById(snap: WorldSnapshot, id: number | null): AgentRow | undefined {
  return id === null ? undefined : snap.agents.find((a) => a.id === id);
}
