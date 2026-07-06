// Thin painter for the choice-row talents tab (talent_rows_view.ts core). A
// cold window body (repainted on open/tab-switch/pick, never per frame), so it
// builds DOM directly like its sibling talents_window sections; option
// name/description are sim content (English source) interpolated through esc().
// Chrome strings are t() keys. Owns no state; everything arrives via deps.

import { esc } from './esc';
import { t } from './i18n';
import type { TalentRowsVM } from './talent_rows_view';

export interface TalentRowsTabDeps {
  /** Send a pick (or null to clear) for a row; server/Sim re-validates. */
  pickRow(rowIndex: number, optionId: string | null): void;
  /** Repaint the window after a pick (and once more shortly after, so the
   *  online mirror's authoritative snapshot lands in the repaint). */
  rerender(): void;
}

export function paintTalentRowsTab(
  body: HTMLElement,
  vm: TalentRowsVM,
  deps: TalentRowsTabDeps,
): void {
  const wrap = document.createElement('div');
  wrap.className = 'tal-rows';
  const parts: string[] = [];
  for (const row of vm.rows) {
    const lockBadge = row.unlocked
      ? `<span class="tal-row-lv">${row.level}</span>`
      : `<span class="tal-row-lv locked">${row.level}</span><span class="tal-row-lock">${esc(
          t('hudChrome.itemTooltip.requiresLevel', { level: row.level }),
        )}</span>`;
    const opts = row.options
      .map(
        (o) =>
          `<button type="button" class="tal-row-opt${o.picked ? ' picked' : ''}"` +
          ` data-row="${row.index}" data-opt="${esc(o.id)}"` +
          ` aria-pressed="${o.picked}" ${row.unlocked ? '' : 'disabled'}>` +
          `<b>${esc(o.name)}</b><span>${esc(o.description)}</span>` +
          `</button>`,
      )
      .join('');
    parts.push(
      `<div class="tal-row${row.unlocked ? '' : ' locked'}">` +
        `<div class="tal-row-head">${lockBadge}</div>` +
        `<div class="tal-row-opts">${opts}</div>` +
        `</div>`,
    );
  }
  wrap.innerHTML = parts.join('');
  wrap.querySelectorAll<HTMLButtonElement>('.tal-row-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rowIndex = Number(btn.dataset.row);
      const optId = btn.dataset.opt ?? null;
      const wasPicked = btn.getAttribute('aria-pressed') === 'true';
      // Click a picked option to clear it; click another to swap (free respec).
      deps.pickRow(rowIndex, wasPicked ? null : optId);
      deps.rerender();
    });
  });
  body.appendChild(wrap);
}
