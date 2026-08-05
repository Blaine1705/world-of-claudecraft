// The Reliquary window painter (#reliquary-window): a cold, event-driven
// collection browser over IWorldReliquary + the static RELIQUARY_PAGES catalog,
// the Book of Deeds / Professions family exactly. Full innerHTML rebuild on
// open, on a real data change (refreshIfChanged diffs reliquaryRefreshSig),
// and on language switch; scroll offset of the body survives rebuilds; nothing
// here runs on the per-frame hot path. The pure model lives in
// reliquary_view.ts; this module only paints and wires callbacks through
// injected deps (it never imports Hud and never hardcodes the window id).
//
// Phase 5: page grids (owned art vs quality silhouettes), clear count, live
// signature including ownershipDigest, tooltips that distinguish owned vs
// missing. Unlock toast / Illumination celebration are planned pure in
// reliquary_view and applied by a thin Hud arm.

import { audio } from '../game/audio';
import { RELIQUARY_PAGES } from '../sim/content/reliquary';
import { ITEMS } from '../sim/data';
import type { IWorld } from '../world_api';
import { markDialogRoot } from './dialog_root';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import { captureFocusKey, focusedWithin, restoreFirstEnabled } from './focus_restore';
import { formatNumber, type TranslationKey, t } from './i18n';
import type { PainterHostPresentation } from './painter_host';
import {
  buildReliquaryView,
  isReliquaryNavId,
  RELIQUARY_NAV,
  type ReliquaryGridCellModel,
  type ReliquaryNavId,
  type ReliquaryNearlyPageModel,
  type ReliquaryPageDetailModel,
  type ReliquaryRecentFindModel,
  type ReliquaryViewInput,
  type ReliquaryViewModel,
  reliquaryOwnershipDigest,
  reliquaryRecentSig,
  reliquaryRefreshSig,
} from './reliquary_view';
import { svgIcon } from './ui_icons';
import { knownItemIconHtml, unknownItemIconHtml } from './unknown_item_icon';

const NAV_LABEL_KEYS: Record<ReliquaryNavId, TranslationKey> = {
  overview: 'hudChrome.reliquary.navOverview',
  conquerors: 'hudChrome.reliquary.navConquerors',
  professions: 'hudChrome.reliquary.navProfessions',
  horizons: 'hudChrome.reliquary.navHorizons',
};

/** Named Curator rank chrome keys (Phase 6). Falls back to numeric rank label. */
export const CURATOR_RANK_NAME_KEYS: readonly TranslationKey[] = [
  'hudChrome.reliquary.curatorRankName1',
  'hudChrome.reliquary.curatorRankName2',
  'hudChrome.reliquary.curatorRankName3',
  'hudChrome.reliquary.curatorRankName4',
  'hudChrome.reliquary.curatorRankName5',
];

/** Shared key picker for Overview seal chrome and Hud rank-up toast/banner. */
export function curatorRankNameKey(rank: number): TranslationKey {
  if (rank >= 1 && rank <= CURATOR_RANK_NAME_KEYS.length) {
    return CURATOR_RANK_NAME_KEYS[rank - 1]!;
  }
  return 'hudChrome.reliquary.curatorRank';
}

/**
 * Hud-supplied glue: shared presentation bag plus the window surface (world
 * reads, focus capture/return, close chrome).
 */
export interface ReliquaryWindowDeps extends PainterHostPresentation {
  /** The #reliquary-window root (Hud owns the id). */
  root(): HTMLElement;
  /** The live world (offline Sim or online ClientWorld mirror). */
  world(): IWorld;
  closeOthers(): void;
  hideTooltip(): void;
  /** Shared Hud TouchPeekGuard (wired for parity with peek cards). */
  consumePeek(): boolean;
  captureFocus(): HTMLElement | null;
  restoreFocus(target: HTMLElement | null): void;
}

export class ReliquaryWindow {
  private opened = false;
  private lastSig = '';
  private openerFocus: HTMLElement | null = null;
  private nav: ReliquaryNavId = 'overview';
  private pageId: string | null = null;

  constructor(private readonly deps: ReliquaryWindowDeps) {}

  get isOpen(): boolean {
    return this.opened;
  }

  open(nav?: ReliquaryNavId): void {
    if (nav !== undefined) this.nav = nav;
    if (this.opened) {
      this.render();
      return;
    }
    this.deps.closeOthers();
    this.openerFocus = this.deps.captureFocus();
    this.opened = true;
    this.lastSig = '';
    this.render();
    this.deps.root().style.display = 'flex';
    (this.deps.root().querySelector('[data-close]') as HTMLElement | null)?.focus();
    audio.click();
  }

  close(): void {
    if (!this.opened) return;
    const el = this.deps.root();
    el.style.display = 'none';
    this.opened = false;
    this.deps.hideTooltip();
    this.deps.restoreFocus(this.openerFocus);
    this.openerFocus = null;
  }

  toggle(): void {
    if (this.opened) {
      this.close();
      audio.click();
    } else {
      this.open();
    }
  }

  /** Slow-band refresh: repaint only when the compact signature moves. */
  refreshIfChanged(): void {
    if (!this.opened) return;
    const input = this.buildInput();
    const sig = this.sigFromInput(input);
    if (sig === this.lastSig) return;
    this.render(input, sig);
  }

  render(prebuilt?: ReliquaryViewInput, prebuiltSig?: string): void {
    const el = this.deps.root();
    if (!this.opened) return;
    const focusKey = captureFocusKey(el);
    const hadFocus = focusedWithin(el) !== null;
    this.deps.hideTooltip();
    markDialogRoot(el, { label: t('hudChrome.reliquary.title') });
    const prevScrollTop = el.querySelector('.reliquary-scroll')?.scrollTop ?? 0;

    const input = prebuilt ?? this.buildInput();
    const model = buildReliquaryView(input);
    el.innerHTML =
      `<div class="panel-title"><span>${esc(t('hudChrome.reliquary.title'))}</span>` +
      `<button type="button" class="x-btn" data-close data-focus-key="close" aria-label="${esc(t('hudChrome.reliquary.close'))}">${svgIcon('close')}</button></div>` +
      this.summaryHtml(model) +
      `<div class="reliquary-body">${this.railHtml(model)}<div class="reliquary-scroll">${this.contentHtml(model)}</div></div>`;

    this.wire(el, model);
    const scroll = el.querySelector('.reliquary-scroll');
    if (scroll) scroll.scrollTop = prevScrollTop;
    this.lastSig = prebuiltSig ?? this.sigFromInput(input);
    if (hadFocus) {
      const keyed = [...el.querySelectorAll<HTMLElement>('[data-focus-key]')];
      const exact =
        focusKey === null
          ? null
          : (keyed.find((node) => node.dataset.focusKey === focusKey) ?? null);
      restoreFirstEnabled([exact, el.querySelector<HTMLElement>('[data-close]')]);
    }
  }

  private buildInput(): ReliquaryViewInput {
    const world = this.deps.world();
    return {
      pages: RELIQUARY_PAGES,
      itemsDiscovered: world.deedStats.itemsDiscovered,
      marks: world.reliquaryMarks,
      recent: world.reliquaryRecent,
      nav: this.nav,
      pageId: this.pageId,
      clearCount: (pageId) => world.reliquaryPageClearCount(pageId),
      firstFind: world.reliquaryFirstFind,
    };
  }

  private sigFromInput(input: ReliquaryViewInput): string {
    const world = this.deps.world();
    const catalog = world.reliquaryCatalogCompletion();
    // Clear meters paint on shelf/page; digest so a pure clear bump
    // (no ownership change) still refreshes an open window.
    let clearsDigest = 0;
    for (const page of input.pages) {
      const n = input.clearCount?.(page.id);
      if (n !== undefined) clearsDigest = (clearsDigest * 31 + (n + 1)) | 0;
    }
    const firstFindCount = Object.keys(world.reliquaryFirstFind).length;
    const pageOwned =
      input.pageId !== null ? (world.reliquaryPageCompletion(input.pageId)?.owned ?? 0) : 0;
    const ownershipDigest = reliquaryOwnershipDigest({
      discoveredSize: world.deedStats.itemsDiscovered.size,
      marksSize: world.reliquaryMarks.size,
      firstFindCount,
      pageOwned,
    });
    return reliquaryRefreshSig({
      owned: catalog.owned,
      total: catalog.total,
      curatorRank: world.reliquaryCuratorRank(),
      recentSig: reliquaryRecentSig(input.recent),
      marksSize: world.reliquaryMarks.size,
      nav: input.nav,
      pageId: input.pageId,
      clearsDigest,
      ownershipDigest,
    });
  }

  private summaryHtml(model: ReliquaryViewModel): string {
    const p = model.progress;
    const owned = this.fmt(p.owned);
    const total = this.fmt(p.total);
    const pctText = formatNumber(p.fraction, { style: 'percent', maximumFractionDigits: 0 });
    const pct = Math.round(p.fraction * 100);
    const rankLabel =
      p.curatorRank > 0
        ? t(curatorRankNameKey(p.curatorRank), { rank: this.fmt(p.curatorRank) })
        : t('hudChrome.reliquary.curatorUnranked');
    const sealAttr = p.curatorSealId ? ` data-seal="${esc(p.curatorSealId)}"` : '';
    const sealClass = p.curatorSealId ? ' has-seal' : '';
    return (
      `<div class="reliquary-summary${sealClass}"${sealAttr}>` +
      `<span class="reliquary-count">${esc(t('hudChrome.reliquary.countLabel', { owned, total }))}</span>` +
      `<span class="reliquary-rank" data-rank="${p.curatorRank}">` +
      `<span class="reliquary-rank-seal" aria-hidden="true"></span>` +
      `${esc(rankLabel)}</span>` +
      `<span class="reliquary-pct" role="img" aria-label="${esc(t('hudChrome.reliquary.completionAria', { owned, total }))}">` +
      `<span class="reliquary-bar"><span class="reliquary-bar-fill" style="width:${pct}%"></span></span> ${esc(pctText)}</span>` +
      `</div>`
    );
  }

  private railHtml(model: ReliquaryViewModel): string {
    const rows = model.shelves
      .map((s) => {
        const label = t(NAV_LABEL_KEYS[s.id]);
        const on = this.nav === s.id;
        const count =
          s.id === 'overview'
            ? ''
            : `<span class="reliquary-nav-count">${esc(`${this.fmt(s.owned)}/${this.fmt(s.total)}`)}</span>`;
        const aria =
          s.id === 'overview'
            ? label
            : t('hudChrome.reliquary.navCountAria', {
                shelf: label,
                owned: this.fmt(s.owned),
                total: this.fmt(s.total),
              });
        return (
          `<button type="button" class="reliquary-nav${on ? ' active' : ''}" data-nav="${s.id}" data-focus-key="nav:${s.id}" aria-pressed="${on}" aria-label="${esc(aria)}">` +
          `<span class="reliquary-nav-name">${esc(label)}</span>${count}</button>`
        );
      })
      .join('');
    return `<nav class="reliquary-rail" aria-label="${esc(t('hudChrome.reliquary.shelvesAria'))}">${rows}</nav>`;
  }

  private contentHtml(model: ReliquaryViewModel): string {
    if (model.nav === 'overview') return this.overviewHtml(model);
    if (model.pageDetail) return this.pageDetailHtml(model.pageDetail);
    return this.shelfListHtml(model);
  }

  private overviewHtml(model: ReliquaryViewModel): string {
    let html = `<section class="reliquary-overview">`;
    html += this.recentStripHtml(model.recent);
    html += this.nearlyStripHtml(model.nearly);
    if (model.recent.length === 0 && model.nearly.length === 0) {
      html += `<p class="reliquary-empty">${esc(t('hudChrome.reliquary.overviewEmpty'))}</p>`;
    }
    html += `</section>`;
    return html;
  }

  private recentStripHtml(recent: readonly ReliquaryRecentFindModel[]): string {
    if (recent.length === 0) return '';
    const chips = recent
      .map((r) => {
        const name = this.findDisplayName(r);
        return (
          `<span class="reliquary-recent-item" title="${esc(name)}">` +
          `<span class="reliquary-recent-name">${esc(name)}</span></span>`
        );
      })
      .join('');
    return (
      `<div class="reliquary-recent">` +
      `<span class="reliquary-strip-label">${esc(t('hudChrome.reliquary.recentLabel'))}</span>` +
      chips +
      `</div>`
    );
  }

  private nearlyStripHtml(nearly: readonly ReliquaryNearlyPageModel[]): string {
    if (nearly.length === 0) return '';
    const rows = nearly
      .map((n) => {
        const progress = t('hudChrome.reliquary.progressText', {
          owned: this.fmt(n.owned),
          total: this.fmt(n.total),
        });
        return (
          `<button type="button" class="reliquary-nearly-row" data-page="${esc(n.pageId)}" data-focus-key="nearly:${n.pageId}" aria-label="${esc(
            t('hudChrome.reliquary.nearlyJumpAria', {
              name: n.name,
              owned: this.fmt(n.owned),
              total: this.fmt(n.total),
            }),
          )}">` +
          `<span class="reliquary-nearly-name">${esc(n.name)}</span>` +
          `<span class="reliquary-progress-text">${esc(progress)}</span></button>`
        );
      })
      .join('');
    return (
      `<div class="reliquary-nearly">` +
      `<span class="reliquary-strip-label">${esc(t('hudChrome.reliquary.nearlyLabel'))}</span>` +
      rows +
      `</div>`
    );
  }

  private shelfListHtml(model: ReliquaryViewModel): string {
    if (model.shelfPages.length === 0) {
      return `<div class="reliquary-empty">${esc(t('hudChrome.reliquary.shelfEmpty'))}</div>`;
    }
    const rows = model.shelfPages
      .map((page) => {
        const progress = t('hudChrome.reliquary.progressText', {
          owned: this.fmt(page.owned),
          total: this.fmt(page.total),
        });
        const clears =
          page.clears !== undefined
            ? `<span class="reliquary-clears">${esc(t('hudChrome.reliquary.clearsLabel', { count: this.fmt(page.clears) }))}</span>`
            : '';
        const done = page.complete
          ? `<span class="reliquary-complete-badge">${esc(t('hudChrome.reliquary.pageComplete'))}</span>`
          : '';
        return (
          `<button type="button" class="reliquary-page-row" data-page="${esc(page.pageId)}" data-focus-key="page:${page.pageId}">` +
          `<span class="reliquary-page-name">${esc(page.name)}</span>` +
          `<span class="reliquary-page-meta">` +
          `<span class="reliquary-progress-text">${esc(progress)}</span>${clears}${done}` +
          `</span></button>`
        );
      })
      .join('');
    return `<div class="reliquary-page-list" role="list" aria-label="${esc(t(NAV_LABEL_KEYS[model.nav]))}">${rows}</div>`;
  }

  private pageDetailHtml(page: ReliquaryPageDetailModel): string {
    const progress = t('hudChrome.reliquary.progressText', {
      owned: this.fmt(page.owned),
      total: this.fmt(page.total),
    });
    const pct = page.total > 0 ? Math.round((page.owned / page.total) * 100) : 0;
    const clears =
      page.clears !== undefined
        ? `<p class="reliquary-page-clears">${esc(t('hudChrome.reliquary.clearsLabel', { count: this.fmt(page.clears) }))}</p>`
        : '';
    const done = page.illuminated
      ? `<span class="reliquary-complete-badge reliquary-page-illuminated">${esc(t('hudChrome.reliquary.pageComplete'))}</span>`
      : '';
    const grid =
      page.cells.length === 0
        ? `<p class="reliquary-empty">${esc(t('hudChrome.reliquary.shelfEmpty'))}</p>`
        : `<div class="reliquary-grid" role="list" aria-label="${esc(t('hudChrome.reliquary.gridAria', { name: page.name }))}">${page.cells.map((c) => this.cellHtml(c)).join('')}</div>`;
    return (
      `<section class="reliquary-page-detail${page.illuminated ? ' is-illuminated' : ''}">` +
      `<button type="button" class="reliquary-back" data-back data-focus-key="back">${esc(t('hudChrome.reliquary.backToShelf'))}</button>` +
      `<header class="reliquary-page-header">` +
      `<h3 class="reliquary-page-title">${esc(page.name)}</h3>${done}` +
      `</header>` +
      `<div class="reliquary-page-progress-row" role="img" aria-label="${esc(
        t('hudChrome.reliquary.pageProgressAria', {
          owned: this.fmt(page.owned),
          total: this.fmt(page.total),
        }),
      )}">` +
      `<span class="reliquary-page-progress">${esc(progress)}</span>` +
      `<span class="reliquary-bar reliquary-page-bar"><span class="reliquary-bar-fill" style="width:${pct}%"></span></span>` +
      `</div>${clears}${grid}` +
      `</section>`
    );
  }

  private cellHtml(cell: ReliquaryGridCellModel): string {
    const name = this.cellDisplayName(cell);
    const stateClass = cell.owned ? 'owned' : 'missing';
    const quality = this.cellQuality(cell);
    const aria = cell.owned
      ? t('hudChrome.reliquary.cellOwnedAria', { name })
      : t('hudChrome.reliquary.cellMissingAria', { name });
    const icon = this.cellIconHtml(cell, quality);
    // data-cell-id + data-cell-kind drive tooltip wiring after rebuild.
    return (
      `<div class="reliquary-cell reliquary-cell--${stateClass} q-${esc(quality)}" role="listitem" tabindex="0" ` +
      `data-cell-id="${esc(cell.id)}" data-cell-kind="${esc(cell.kind)}" data-cell-owned="${cell.owned ? '1' : '0'}" ` +
      `data-focus-key="cell:${cell.kind}:${cell.id}" aria-label="${esc(aria)}">` +
      `<span class="reliquary-cell-art" aria-hidden="true">${icon}</span>` +
      `</div>`
    );
  }

  private cellIconHtml(cell: ReliquaryGridCellModel, quality: string): string {
    if (cell.kind === 'item') {
      const def = ITEMS[cell.id];
      if (def) return this.deps.itemIcon(def);
      return unknownItemIconHtml(cell.id, quality);
    }
    // Non-item slots (marks / mounts / skins / titles): quality ghost until
    // dedicated art lands with those shelves. Still readable as a silhouette.
    return knownItemIconHtml({ id: cell.id, quality });
  }

  private cellQuality(cell: ReliquaryGridCellModel): string {
    if (cell.kind === 'item') {
      const def = ITEMS[cell.id];
      if (def?.quality) return def.quality;
    }
    return 'common';
  }

  private cellDisplayName(cell: ReliquaryGridCellModel): string {
    if (cell.kind === 'item') {
      const def = ITEMS[cell.id];
      if (def) return itemDisplayName(def);
    }
    const bare = cell.id.includes(':') ? cell.id.slice(cell.id.lastIndexOf(':') + 1) : cell.id;
    return bare.replace(/_/g, ' ');
  }

  private cellTooltipHtml(cell: ReliquaryGridCellModel): string {
    const name = this.cellDisplayName(cell);
    const status = cell.owned
      ? t('hudChrome.reliquary.ownedTooltipStatus')
      : t('hudChrome.reliquary.missingTooltipStatus');
    let body = `<div class="tt-name q-${esc(this.cellQuality(cell))}">${esc(name)}</div>`;
    body += `<div class="tt-line">${esc(status)}</div>`;
    if (cell.owned && cell.firstFindClears !== undefined) {
      body += `<div class="tt-line">${esc(
        t('hudChrome.reliquary.firstFindClears', {
          count: this.fmt(cell.firstFindClears),
        }),
      )}</div>`;
    }
    // Owned item relics also get the full item tooltip body (stats are catalog
    // truth, not invented power) so the museum reads like other item surfaces.
    // Append first-find clear# when present (live obtain only; never invented).
    if (cell.owned && cell.kind === 'item') {
      const def = ITEMS[cell.id];
      if (def) {
        let html = this.deps.itemTooltip(def);
        if (cell.firstFindClears !== undefined) {
          html += `<div class="tt-line">${esc(
            t('hudChrome.reliquary.firstFindClears', {
              count: this.fmt(cell.firstFindClears),
            }),
          )}</div>`;
        }
        return html;
      }
    }
    return body;
  }

  private findDisplayName(find: ReliquaryRecentFindModel): string {
    if (find.kind === 'item' || find.kind === 'unknown') {
      const def = ITEMS[find.id];
      if (def) return itemDisplayName(def);
    }
    // Mark ids and unknown ids: show the raw id as a last resort until
    // profession mark i18n lands (Phase 7). Prefer a short trailing segment.
    const bare = find.id.includes(':') ? find.id.slice(find.id.lastIndexOf(':') + 1) : find.id;
    return bare.replace(/_/g, ' ');
  }

  private wire(el: HTMLElement, model: ReliquaryViewModel): void {
    el.querySelector('[data-close]')?.addEventListener('click', () => {
      this.close();
      audio.click();
    });
    for (const btn of el.querySelectorAll<HTMLElement>('[data-nav]')) {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav ?? '';
        if (!isReliquaryNavId(nav)) return;
        this.nav = nav;
        this.pageId = null;
        audio.click();
        this.render();
      });
    }
    for (const btn of el.querySelectorAll<HTMLElement>('[data-page]')) {
      btn.addEventListener('click', () => {
        const pageId = btn.dataset.page;
        if (!pageId) return;
        const page = RELIQUARY_PAGES.find((p) => p.id === pageId);
        if (page) {
          this.nav = page.shelf;
          this.pageId = page.id;
        }
        audio.click();
        this.render();
      });
    }
    el.querySelector('[data-back]')?.addEventListener('click', () => {
      this.pageId = null;
      audio.click();
      this.render();
    });
    // Grid cell tooltips: owned vs missing copy, full item tip when catalogued.
    if (model.pageDetail) {
      const byKey = new Map<string, ReliquaryGridCellModel>();
      for (const cell of model.pageDetail.cells) {
        byKey.set(`${cell.kind}:${cell.id}`, cell);
      }
      for (const node of el.querySelectorAll<HTMLElement>('[data-cell-id]')) {
        const id = node.dataset.cellId;
        const kind = node.dataset.cellKind;
        if (!id || !kind) continue;
        const cell = byKey.get(`${kind}:${id}`);
        if (!cell) continue;
        this.deps.attachTooltip(node, () => this.cellTooltipHtml(cell));
      }
    }
  }

  private fmt(n: number): string {
    return formatNumber(n, { maximumFractionDigits: 0 });
  }
}

export type { ReliquaryNavId };
// Re-export nav helpers so callers (and tests) need only one import surface.
export { isReliquaryNavId, RELIQUARY_NAV };
