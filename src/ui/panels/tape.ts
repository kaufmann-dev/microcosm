import type { WorldSnapshot } from "../../shared/protocol";
import { fmtPrice } from "../format";
import { DOWN, UP } from "../theme";

/** Rolling trade tape, newest first. Aggressor side colors the price. */
export class TapePanel {
  constructor(private readonly el: HTMLElement) {}

  render(snap: WorldSnapshot): void {
    const rows = [...snap.tape].reverse();
    this.el.innerHTML = rows
      .map(
        (t) =>
          `<div class="tape-row"><span style="color:var(--muted)">t ${t.tick.toLocaleString()}</span>` +
          `<span style="color:${t.aggressor === "buy" ? UP : DOWN}">${fmtPrice(t.price)}</span>` +
          `<span>×${t.qty}</span></div>`,
      )
      .join("");
  }
}
