import type { WorldSnapshot } from "../../shared/protocol";
import { DOWN, FUNDAMENTAL, KIND_COLORS, MUTED } from "../theme";

const ICONS: Record<string, [string, string]> = {
  shock: ["⚡", FUNDAMENTAL],
  bankruptcy: ["†", DOWN],
  generation: ["§", KIND_COLORS.evolved],
  info: ["·", MUTED],
};

/** World event log, newest first. */
export class EventsPanel {
  constructor(private readonly el: HTMLElement) {}

  render(snap: WorldSnapshot): void {
    this.el.innerHTML = [...snap.events]
      .reverse()
      .map((e) => {
        const [icon, color] = ICONS[e.kind] ?? ICONS["info"]!;
        return `<div class="event-row"><span class="t">t ${e.tick.toLocaleString()}</span><span style="color:${color};flex:none">${icon}</span><span>${e.text}</span></div>`;
      })
      .join("");
  }
}
