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
//
// Phase 13: a silhouette tells you where to get it (the source line, in the
// missing-cell tooltip AND its aria-label so keyboard reaches what hover
// reaches), a page tells you what it is (reliquaryPageDesc on the header and
// the shelf row), the grid is one roving tab stop instead of N, and the shelf
// list is a real ul/li. Relic names come from reliquary_labels.ts, the one
// ladder hud.ts's unlock sites share; page names still come from
// reliquaryPageName(pageId). Search and the owned/missing chips are painter
// state threaded into the pure core, which matches on LOCALIZED text this
// module injects.

import { audio } from '../game/audio';
import { MOUNTS } from '../sim/content/mounts';
import { RELIQUARY_PAGES } from '../sim/content/reliquary';
import { WEAPON_SKINS } from '../sim/content/weapon_skins';
import { ITEMS } from '../sim/data';
import type { IWorld } from '../world_api';
import { markDialogRoot } from './dialog_root';
import { esc } from './esc';
import { captureFocusKey, focusedWithin, restoreFirstEnabled } from './focus_restore';
import { formatNumber, getLanguage, languageTag, type TranslationKey, t, tPlural } from './i18n';
import { ReannounceMarker } from './live_region_reannounce';
import type { PainterHostPresentation } from './painter_host';
import { reliquaryPageDesc, reliquaryPageName } from './reliquary_i18n';
import {
  reliquaryRelicDisplayName,
  reliquaryRelicSearchText,
  reliquarySourceLineText,
} from './reliquary_labels';
import {
  buildReliquaryView,
  CURATOR_RANK_NAME_KEYS,
  curatorRankNameKey,
  isReliquaryNavId,
  isReliquaryOwnedFilter,
  RELIQUARY_NAV,
  RELIQUARY_OWNED_FILTERS,
  type ReliquaryGridCellModel,
  type ReliquaryNavId,
  type ReliquaryNearlyPageModel,
  type ReliquaryOwnedFilter,
  type ReliquaryPageDetailModel,
  type ReliquaryRecentFindModel,
  type ReliquaryViewInput,
  type ReliquaryViewModel,
  reliquaryOwnershipDigest,
  reliquaryRecentSig,
  reliquaryRefreshSig,
} from './reliquary_view';
import { rovingTarget } from './roving_index';
import { svgIcon } from './ui_icons';
import { knownItemIconHtml, unknownItemIconHtml } from './unknown_item_icon';

// Re-export pure rank chrome helpers so existing imports keep resolving.
export { CURATOR_RANK_NAME_KEYS, curatorRankNameKey };

const NAV_LABEL_KEYS: Record<ReliquaryNavId, TranslationKey> = {
  overview: 'hudChrome.reliquary.navOverview',
  conquerors: 'hudChrome.reliquary.navConquerors',
  professions: 'hudChrome.reliquary.navProfessions',
  horizons: 'hudChrome.reliquary.navHorizons',
};

// The SR-only description the relic grid points at, plus the literal key list
// aria-keyshortcuts takes (key VALUES, never localized prose). Both mirror the
// keys roving_index.ts actually owns for orientation 'both'.
const GRID_HINT_ID = 'reliquary-grid-hint';
const GRID_KEY_SHORTCUTS = 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End';

const FILTER_LABEL_KEYS: Record<ReliquaryOwnedFilter, TranslationKey> = {
  all: 'hudChrome.reliquary.filterAll',
  owned: 'hudChrome.reliquary.filterOwned',
  missing: 'hudChrome.reliquary.filterMissing',
};

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
  private search = '';
  private ownedFilter: ReliquaryOwnedFilter = 'all';
  // Roving-tabindex cursor into the CURRENT page grid: exactly one cell is a
  // tab stop, Arrow/Home/End move it. Reset whenever the painted set changes.
  private gridIndex = 0;
  /**
   * The polite region that announces how many items a search or filter left.
   * Minted ONCE and re-appended after every innerHTML write, never emitted into
   * the markup string: a live region has to be registered with the AT BEFORE
   * its text changes, and a node created and mutated inside the same task is
   * unreliable (the #crafting-live / #combat-live precedent, for exactly this
   * reason). Surviving the rebuild is what makes the announcement work at all.
   */
  private liveEl: HTMLElement | null = null;
  /** Last LOGICAL (pre-marker) announcement, so a world-driven repaint with an
   *  unchanged count never re-marks the region (see announceResults). */
  private lastAnnounced = '';
  // Forces a byte-different write when two keystrokes narrow to the SAME count,
  // so the region still re-reads (the shared DOM-free deterministic marker).
  private readonly liveReannounce = new ReannounceMarker();
  // The open render must stay silent by DESIGN, not by the accident of the
  // root still being display:none when it writes (see announceResults).
  private suppressAnnounceOnce = false;

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
    this.suppressAnnounceOnce = true;
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
    // Search is per-visit: a needle typed last session must not silently hide
    // most of the catalog on the next open. The ownership chip, shelf, and open
    // page stay put for the session (the deeds policy), because those read as
    // "where I was", not as a filter left switched on.
    this.search = '';
    this.gridIndex = 0;
    // The region must not carry a stale announcement (or a pending reannounce
    // toggle) into the next visit; the NODE persists, its state does not.
    if (this.liveEl) this.liveEl.textContent = '';
    this.lastAnnounced = '';
    this.liveReannounce.reset();
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
    // innerHTML wipes the search field, and the shared data-focus-key restore
    // only re-focuses (it cannot know about a caret). Carry the selection range
    // across the rebuild so typing mid-word does not jump to the end, the same
    // special case the Book of Deeds search field needs.
    const searchEl = el.querySelector<HTMLInputElement>('.reliquary-search');
    const caret =
      searchEl !== null && focusKey === 'search'
        ? { start: searchEl.selectionStart, end: searchEl.selectionEnd }
        : null;
    this.deps.hideTooltip();
    markDialogRoot(el, { label: t('hudChrome.reliquary.title') });
    const prevScrollTop = el.querySelector('.reliquary-scroll')?.scrollTop ?? 0;

    const input = prebuilt ?? this.buildInput();
    const model = buildReliquaryView(input);
    el.innerHTML =
      `<div class="panel-title"><span>${esc(t('hudChrome.reliquary.title'))}</span>` +
      `<input type="search" class="reliquary-search" data-focus-key="search" value="${esc(this.search)}" placeholder="${esc(t('hudChrome.reliquary.searchPlaceholder'))}" aria-label="${esc(t('hudChrome.reliquary.searchAria'))}">` +
      `<button type="button" class="x-btn" data-close data-focus-key="close" aria-label="${esc(t('hudChrome.reliquary.close'))}">${svgIcon('close')}</button></div>` +
      this.summaryHtml(model) +
      `<div class="reliquary-body">${this.railHtml(model)}<div class="reliquary-scroll">${this.contentHtml(model)}</div></div>`;

    // The innerHTML write above orphaned the region; put the SAME node back so
    // the AT keeps the registration it already has, then write into it.
    const live = this.ensureLiveRegion(el);
    el.append(live);
    this.wire(el, model);
    const scroll = el.querySelector('.reliquary-scroll');
    if (scroll) scroll.scrollTop = prevScrollTop;
    // Only refreshIfChanged passes arguments, so a prebuilt input is an exact
    // "this repaint is world-driven, not player-driven" signal.
    this.announceResults(live, model, prebuilt !== undefined);
    this.lastSig = prebuiltSig ?? this.sigFromInput(input);
    if (caret !== null) {
      const fresh = el.querySelector<HTMLInputElement>('.reliquary-search');
      if (fresh) {
        fresh.focus();
        fresh.setSelectionRange(caret.start, caret.end);
      }
    } else if (hadFocus) {
      const keyed = [...el.querySelectorAll<HTMLElement>('[data-focus-key]')];
      const exact =
        focusKey === null
          ? null
          : (keyed.find((node) => node.dataset.focusKey === focusKey) ?? null);
      restoreFirstEnabled([exact, el.querySelector<HTMLElement>('[data-close]')]);
      // A restored grid cell becomes the roving tab stop, so the one tab stop
      // follows the player's last cell instead of snapping back to the first.
      this.syncGridRoving(el, focusKey);
    }
  }

  /** The persistent polite region (see liveEl), minted once from the root's own
   *  document rather than the `document` global, which this painter must not
   *  touch (the src/ui host-classification sweep) and which would also pin the
   *  node to the wrong document in a multi-document host. */
  private ensureLiveRegion(el: HTMLElement): HTMLElement {
    const existing = this.liveEl;
    if (existing) return existing;
    const node = el.ownerDocument.createElement('span');
    node.className = 'visually-hidden';
    node.dataset.reliquaryLive = '1';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'true');
    this.liveEl = node;
    return node;
  }

  /**
   * Announce how many items survived a narrowing, then keep quiet.
   *
   * The gate is what the PAINTED SURFACE actually narrowed, never the persisted
   * chip or the mere presence of a needle: ownedFilter survives a Back click,
   * and a needle that matches everything narrows nothing. Every surface asks
   * the model's own answer about this paint: the grid through
   * pageDetail.filtered, the shelf and Overview through model.filtered.
   *
   * The render that opens the window is exempt (suppressAnnounceOnce): a
   * persisted chip or page is state the player left behind, not a narrowing
   * they just performed, and announcing it at open would read out a count
   * nobody asked for. The text still latches so the next world-driven repaint
   * with the same count stays silent.
   *
   * Cold path only (called from render), never the per-frame band.
   */
  private announceResults(
    live: HTMLElement,
    model: ReliquaryViewModel,
    worldDriven: boolean,
  ): void {
    const narrowed = model.pageDetail ? model.pageDetail.filtered : model.filtered;
    if (this.suppressAnnounceOnce) {
      this.suppressAnnounceOnce = false;
      this.lastAnnounced = narrowed
        ? tPlural('hudChrome.plurals.reliquarySearchResults', this.announceCount(model), {
            count: this.fmt(this.announceCount(model)),
          })
        : '';
      return;
    }
    if (!narrowed) {
      // Nothing is narrowed: clear the region and forget the last text, so
      // re-narrowing to the same count later still announces cleanly.
      live.textContent = '';
      this.lastAnnounced = '';
      this.liveReannounce.reset();
      return;
    }
    const count = this.announceCount(model);
    // Raw count to tPlural (it is what Intl.PluralRules selects on); the
    // VISIBLE number is the locale-formatted override.
    const text = tPlural('hudChrome.plurals.reliquarySearchResults', count, {
      count: this.fmt(count),
    });
    // A world-driven repaint (slow-band signature move: ownership, clears,
    // rank) with an UNCHANGED count must not touch the region: the marker
    // returns byte-different text for identical input on purpose, and writing
    // it would make the reader re-read "N results." the player never asked
    // about. Player-driven renders always mark, so two keystrokes landing on
    // the same count still announce.
    if (worldDriven && text === this.lastAnnounced) return;
    this.lastAnnounced = text;
    live.textContent = this.liveReannounce.mark(text);
  }

  /** The one definition of what a narrowed surface counts. */
  private announceCount(model: ReliquaryViewModel): number {
    return model.pageDetail
      ? model.pageDetail.cells.length
      : model.nav === 'overview'
        ? model.recent.length + model.nearly.length
        : model.shelfPages.length;
  }

  /** Point the roving tab stop at the grid cell the focus-key restore landed
   *  on, then re-stamp every cell's tabindex. Matching on the captured key
   *  rather than the live activeElement keeps this painter free of direct
   *  browser globals and is exact: restoreFirstEnabled may have fallen through
   *  to Close, and a Close fallback must not move the grid cursor. */
  private syncGridRoving(el: HTMLElement, focusKey: string | null): void {
    if (focusKey === null || !focusKey.startsWith('cell:')) return;
    const cells = [...el.querySelectorAll<HTMLElement>('[data-cell-id]')];
    if (cells.length === 0) return;
    const restored = cells.findIndex((node) => node.dataset.focusKey === focusKey);
    if (restored >= 0) this.gridIndex = restored;
    this.stampGridTabIndex(cells);
  }

  /** Exactly one cell is tabbable; the rest are reachable only by Arrow keys.
   *  Write-elided: only the two cells whose stop actually moved are touched. */
  private stampGridTabIndex(cells: readonly HTMLElement[]): void {
    const active = Math.min(Math.max(this.gridIndex, 0), cells.length - 1);
    this.gridIndex = active;
    cells.forEach((node, i) => {
      const want = i === active ? 0 : -1;
      if (node.tabIndex !== want) node.tabIndex = want;
    });
  }

  /** True when a real (non-whitespace) search needle is active. One definition,
   *  because buildInput trims before filtering: a site testing the untrimmed
   *  field would call a whitespace-only search "active" and swap in the
   *  no-results copy for a surface that is empty for an unrelated reason. */
  private searchActive(): boolean {
    return this.search.trim() !== '';
  }

  private buildInput(): ReliquaryViewInput {
    const world = this.deps.world();
    const tag = languageTag(getLanguage());
    // Horizons ownership: live seams only (no parallel discovery set).
    // Mounts = ownedMounts(); skins = account cosmetics (empty offline/stub);
    // titles = deedsEarned for deeds with title rewards.
    return {
      pages: RELIQUARY_PAGES,
      itemsDiscovered: world.deedStats.itemsDiscovered,
      marks: world.reliquaryMarks,
      recent: world.reliquaryRecent,
      nav: this.nav,
      pageId: this.pageId,
      // Needle and haystack fold with the SAME locale tag (the deeds_window
      // contract). Plain toLowerCase would break Turkish dotted/dotless I, so a
      // tr_TR player's own keystrokes would miss their own relic names.
      search: this.search.trim().toLocaleLowerCase(tag),
      ownedFilter: this.ownedFilter,
      // The pure core filters on LOCALIZED text it never resolves itself (the
      // deeds_view searchText contract): a player types the names their client
      // shows them, not the catalog's English. Page text is name PLUS blurb,
      // because the row now renders the blurb as its second line and a phrase a
      // player can read on the row has to be searchable.
      pageSearchText: (pageId) =>
        `${reliquaryPageName(pageId)} ${reliquaryPageDesc(pageId)}`.toLocaleLowerCase(tag),
      relicSearchText: (kind, id) => reliquaryRelicSearchText(kind, id, tag),
      clearCount: (pageId) => world.reliquaryPageClearCount(pageId),
      firstFind: world.reliquaryFirstFind,
      ownedMounts: new Set(world.ownedMounts()),
      weaponSkins: new Set(world.accountCosmetics.weaponSkinIds),
      deedsEarned: world.deedsEarned,
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
      search: input.search,
      ownedFilter: input.ownedFilter,
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
            : `<span class="reliquary-nav-count">${esc(
                t('hudChrome.reliquary.progressText', {
                  owned: this.fmt(s.owned),
                  total: this.fmt(s.total),
                }),
              )}</span>`;
        const aria =
          s.id === 'overview'
            ? label
            : t('hudChrome.reliquary.navCountAria', {
                shelf: label,
                owned: this.fmt(s.owned),
                total: this.fmt(s.total),
              });
        return (
          `<button type="button" class="reliquary-nav${on ? ' active' : ''}" data-nav="${esc(s.id)}" data-focus-key="${esc(`nav:${s.id}`)}" aria-pressed="${on}" aria-label="${esc(aria)}">` +
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
      // Under an active search the strips are empty because nothing matched,
      // not because the player has collected nothing. Two literal keys, never a
      // template-built key behind an `as TranslationKey`: the cast would let a
      // catalog rename pass tsc and throw at runtime on the first missed search.
      html += `<p class="reliquary-empty">${esc(
        this.searchActive()
          ? t('hudChrome.reliquary.searchEmpty')
          : t('hudChrome.reliquary.overviewEmpty'),
      )}</p>`;
    }
    html += `</section>`;
    return html;
  }

  private recentStripHtml(recent: readonly ReliquaryRecentFindModel[]): string {
    if (recent.length === 0) return '';
    // No title="" here: the invariant bans native title tooltips. A chip whose
    // name is CSS-truncated still reads in full through data-recent-name, which
    // wire() hands the shared HUD tooltip, and the chip carries the whole name
    // as its own accessible text either way.
    const chips = recent
      .map((r) => {
        const name = reliquaryRelicDisplayName(r.kind, r.id);
        return (
          `<span class="reliquary-recent-item" data-recent-name="${esc(name)}">` +
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
        // Page names resolve from the id at paint time (reliquary_i18n), never
        // from the model's raw catalog English.
        const name = reliquaryPageName(n.pageId);
        return (
          `<button type="button" class="reliquary-nearly-row" data-page="${esc(n.pageId)}" data-focus-key="${esc(`nearly:${n.pageId}`)}" aria-label="${esc(
            t('hudChrome.reliquary.nearlyJumpAria', {
              name,
              owned: this.fmt(n.owned),
              total: this.fmt(n.total),
            }),
          )}">` +
          `<span class="reliquary-nearly-name">${esc(name)}</span>` +
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
      return `<div class="reliquary-empty">${esc(
        this.searchActive()
          ? t('hudChrome.reliquary.searchEmpty')
          : t('hudChrome.reliquary.shelfEmpty'),
      )}</div>`;
    }
    // A real ul/li list, the professions window's structure: the row stays a
    // button (button semantics, one tab stop each) inside its own listitem, so
    // a screen reader announces "list, N items" instead of finding bare buttons
    // under a role="list" that owns no listitem children.
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
        const desc = reliquaryPageDesc(page.pageId);
        const sub = desc === '' ? '' : `<span class="reliquary-page-sub">${esc(desc)}</span>`;
        return (
          `<li class="reliquary-page-item">` +
          `<button type="button" class="reliquary-page-row" data-page="${esc(page.pageId)}" data-focus-key="${esc(`page:${page.pageId}`)}">` +
          `<span class="reliquary-page-main">` +
          `<span class="reliquary-page-name">${esc(reliquaryPageName(page.pageId))}</span>${sub}` +
          `</span>` +
          `<span class="reliquary-page-meta">` +
          `<span class="reliquary-progress-text">${esc(progress)}</span>${clears}${done}` +
          `</span></button></li>`
        );
      })
      .join('');
    return `<ul class="reliquary-page-list" role="list" aria-label="${esc(t(NAV_LABEL_KEYS[model.nav]))}">${rows}</ul>`;
  }

  private pageDetailHtml(page: ReliquaryPageDetailModel): string {
    const progress = t('hudChrome.reliquary.progressText', {
      owned: this.fmt(page.owned),
      total: this.fmt(page.total),
    });
    // Page names resolve from the id at paint time (reliquary_i18n), never from
    // the model's raw catalog English.
    const pageName = reliquaryPageName(page.pageId);
    const pct = page.total > 0 ? Math.round((page.owned / page.total) * 100) : 0;
    const clears =
      page.clears !== undefined
        ? `<p class="reliquary-page-clears">${esc(t('hudChrome.reliquary.clearsLabel', { count: this.fmt(page.clears) }))}</p>`
        : '';
    const accountScope = page.accountScoped
      ? `<p class="reliquary-account-scope" data-account-scope="1">${esc(t('hudChrome.reliquary.accountScopeNote'))}</p>`
      : '';
    const done = page.illuminated
      ? `<span class="reliquary-complete-badge reliquary-page-illuminated">${esc(t('hudChrome.reliquary.pageComplete'))}</span>`
      : '';
    // A page tells you what it is: the authored blurb, localized through the
    // reliquary_i18n channel (English fallback until the release locale fill).
    const desc = reliquaryPageDesc(page.pageId);
    const blurb = desc === '' ? '' : `<p class="reliquary-page-desc">${esc(desc)}</p>`;
    const activeCell = Math.min(Math.max(this.gridIndex, 0), Math.max(page.cells.length - 1, 0));
    // Roving tabindex on role="list" is not a composite-widget role, so nothing
    // announces the arrow-key model on its own and a sighted keyboard-only
    // player could reach one cell of N without guessing. list/listitem is still
    // the honest mapping (the cells have no row structure and no selection), so
    // the affordance is described rather than the role changed.
    const grid =
      page.cells.length === 0
        ? `<p class="reliquary-empty">${esc(this.emptyGridText(page.filtered))}</p>`
        : `<span id="${GRID_HINT_ID}" class="visually-hidden">${esc(t('hudChrome.reliquary.gridKeyboardHint'))}</span>` +
          `<div class="reliquary-grid" role="list" aria-label="${esc(t('hudChrome.reliquary.gridAria', { name: pageName }))}">${page.cells.map((c, i) => this.cellHtml(c, i, activeCell)).join('')}</div>`;
    return (
      `<section class="reliquary-page-detail${page.illuminated ? ' is-illuminated' : ''}${page.accountScoped ? ' is-account-scoped' : ''}">` +
      `<button type="button" class="reliquary-back" data-back data-focus-key="back">${esc(t('hudChrome.reliquary.backToShelf'))}</button>` +
      `<header class="reliquary-page-header">` +
      `<h3 class="reliquary-page-title">${esc(pageName)}</h3>${done}` +
      `</header>` +
      blurb +
      accountScope +
      `<div class="reliquary-page-progress-row" role="img" aria-label="${esc(
        t('hudChrome.reliquary.pageProgressAria', {
          owned: this.fmt(page.owned),
          total: this.fmt(page.total),
        }),
      )}">` +
      `<span class="reliquary-page-progress">${esc(progress)}</span>` +
      `<span class="reliquary-bar reliquary-page-bar"><span class="reliquary-bar-fill" style="width:${pct}%"></span></span>` +
      `</div>${clears}${this.filterBarHtml()}${grid}` +
      `</section>`
    );
  }

  /**
   * Which "nothing here" line an empty grid shows. Search wins when a needle is
   * live (it is the narrowing the player just performed), then the chip, then
   * the page is genuinely empty. Blaming a search a player never typed, because
   * they clicked Catalogued on a page they own nothing on, sends them looking
   * for a search box to clear.
   */
  private emptyGridText(filtered: boolean): string {
    if (this.searchActive()) return t('hudChrome.reliquary.searchEmpty');
    if (filtered || this.ownedFilter !== 'all') return t('hudChrome.reliquary.filterEmpty');
    return t('hudChrome.reliquary.shelfEmpty');
  }

  private filterBarHtml(): string {
    const chips = RELIQUARY_OWNED_FILTERS.map((filter) => {
      const on = this.ownedFilter === filter;
      return (
        `<button type="button" class="reliquary-filter-chip${on ? ' active' : ''}" ` +
        `data-filter="${esc(filter)}" data-focus-key="${esc(`filter:${filter}`)}" aria-pressed="${on}">` +
        `${esc(t(FILTER_LABEL_KEYS[filter]))}</button>`
      );
    }).join('');
    return `<div class="reliquary-filterbar" role="group" aria-label="${esc(t('hudChrome.reliquary.filterGroupAria'))}">${chips}</div>`;
  }

  private cellHtml(cell: ReliquaryGridCellModel, index: number, activeIndex: number): string {
    const name = this.cellDisplayName(cell);
    const stateClass = cell.owned ? 'owned' : 'missing';
    const quality = this.cellQuality(cell);
    const icon = this.cellIconHtml(cell, quality);
    // data-cell-id + data-cell-kind drive tooltip wiring after rebuild.
    // Roving tabindex: one tab stop per grid, Arrow/Home/End move it (wire()).
    return (
      // aria-describedby and aria-keyshortcuts ride the CELL, not the grid: a
      // description on the focused element is reliably announced, one on a
      // role="list" container is not, and the container never takes focus here.
      `<div class="reliquary-cell reliquary-cell--${stateClass} q-${esc(quality)}" role="listitem" tabindex="${index === activeIndex ? '0' : '-1'}" ` +
      `data-cell-id="${esc(cell.id)}" data-cell-kind="${esc(cell.kind)}" data-cell-owned="${cell.owned ? '1' : '0'}" ` +
      // data-cell-source marks cells with a resolvable source line so tooling
      // (the PR shot picker) can find one without matching English aria text.
      `${cell.sourcePlan !== undefined ? 'data-cell-source="1" ' : ''}` +
      `data-focus-key="${esc(`cell:${cell.kind}:${cell.id}`)}" ` +
      `aria-describedby="${GRID_HINT_ID}" aria-keyshortcuts="${GRID_KEY_SHORTCUTS}" ` +
      `aria-label="${esc(this.cellAria(cell, name))}">` +
      `<span class="reliquary-cell-art" aria-hidden="true">${icon}</span>` +
      `</div>`
    );
  }

  /**
   * Keyboard parity with hover: the label carries everything the tooltip shows
   * a mouse (the source line for a missing relic, the first-find clear number
   * for an owned one), so nothing actionable is hover-only.
   */
  private cellAria(cell: ReliquaryGridCellModel, name: string): string {
    if (cell.owned) {
      return cell.firstFindClears !== undefined
        ? t('hudChrome.reliquary.cellOwnedClearsAria', {
            name,
            count: this.fmt(cell.firstFindClears),
          })
        : t('hudChrome.reliquary.cellOwnedAria', { name });
    }
    const source = reliquarySourceLineText(cell.sourcePlan);
    return source === ''
      ? t('hudChrome.reliquary.cellMissingAria', { name })
      : t('hudChrome.reliquary.cellMissingSourceAria', { name, source });
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
    // Profession marks: masterworks read as epic; rare field notes as rare.
    if (cell.kind === 'mark') {
      if (cell.id.startsWith('masterwork:')) return 'epic';
      if (cell.id.startsWith('gather_event:')) return 'rare';
    }
    if (cell.kind === 'mount') {
      const def = MOUNTS[cell.id as keyof typeof MOUNTS];
      if (def?.rarity) return def.rarity;
    }
    if (cell.kind === 'weapon_skin') {
      const def = WEAPON_SKINS[cell.id];
      if (def?.rarity) return def.rarity;
    }
    if (cell.kind === 'title') return 'epic';
    return 'common';
  }

  // Both name ladders below are one-line consumers of the shared resolver
  // (reliquary_labels.ts), which hud.ts's two unlock ladders also call: the
  // humanized `id.replace(/_/g, ' ')` fallback each of the four used to carry
  // is gone, so a namespaced id can no longer render four different ways.
  private cellDisplayName(cell: ReliquaryGridCellModel): string {
    return reliquaryRelicDisplayName(cell.kind, cell.id);
  }

  private cellTooltipHtml(cell: ReliquaryGridCellModel): string {
    const name = this.cellDisplayName(cell);
    const status = cell.owned
      ? t('hudChrome.reliquary.ownedTooltipStatus')
      : t('hudChrome.reliquary.missingTooltipStatus');
    let body = `<div class="tt-name q-${esc(this.cellQuality(cell))}">${esc(name)}</div>`;
    body += `<div class="tt-line">${esc(status)}</div>`;
    // A silhouette tells you where to get it. Missing cells only: an owned item
    // relic returns the full item tooltip below, and a player who already has it
    // does not need the hunting directions.
    if (!cell.owned) {
      const source = reliquarySourceLineText(cell.sourcePlan);
      if (source !== '') body += `<div class="tt-line">${esc(source)}</div>`;
    }
    if (cell.kind === 'weapon_skin') {
      body += `<div class="tt-line">${esc(t('hudChrome.reliquary.accountScopeBadge'))}</div>`;
    }
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

  private wire(el: HTMLElement, model: ReliquaryViewModel): void {
    el.querySelector('[data-close]')?.addEventListener('click', () => {
      this.close();
      audio.click();
    });
    const search = el.querySelector<HTMLInputElement>('.reliquary-search');
    const applySearch = (): void => {
      this.search = search?.value ?? '';
      // A narrowed grid renumbers, so the roving cursor goes back to the front.
      this.gridIndex = 0;
      this.render();
    };
    search?.addEventListener('input', (e) => {
      // Mid-composition input events (a CJK IME assembling a candidate) must
      // not rebuild: innerHTML would destroy the composition session under the
      // player. The final input event after compositionend carries
      // isComposing false and lands in applySearch normally; the
      // compositionend listener below covers hosts that order those two the
      // other way around.
      if ((e as InputEvent).isComposing) return;
      applySearch();
    });
    search?.addEventListener('compositionend', () => {
      if (this.search === search.value) return;
      applySearch();
    });
    for (const btn of el.querySelectorAll<HTMLElement>('[data-nav]')) {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav ?? '';
        if (!isReliquaryNavId(nav)) return;
        this.nav = nav;
        this.pageId = null;
        this.gridIndex = 0;
        audio.click();
        this.render();
      });
    }
    for (const btn of el.querySelectorAll<HTMLElement>('[data-filter]')) {
      btn.addEventListener('click', () => {
        // Re-validate the attribute before the cast: the DOM is the untrusted
        // half of this round trip (the deeds filter chip contract).
        const filter = btn.dataset.filter ?? '';
        this.ownedFilter = isReliquaryOwnedFilter(filter) ? filter : 'all';
        this.gridIndex = 0;
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
        this.gridIndex = 0;
        audio.click();
        this.render();
      });
    }
    el.querySelector('[data-back]')?.addEventListener('click', () => {
      this.pageId = null;
      this.gridIndex = 0;
      audio.click();
      this.render();
    });
    // Recent chips: the full name through the shared HUD tooltip, so a chip the
    // CSS truncates is still readable without a native title attribute.
    for (const chip of el.querySelectorAll<HTMLElement>('[data-recent-name]')) {
      const name = chip.dataset.recentName ?? '';
      if (name === '') continue;
      this.deps.attachTooltip(chip, () => `<div class="tt-name">${esc(name)}</div>`);
    }
    // Grid cell tooltips: owned vs missing copy, full item tip when catalogued.
    if (model.pageDetail) {
      const byKey = new Map<string, ReliquaryGridCellModel>();
      for (const cell of model.pageDetail.cells) {
        byKey.set(`${cell.kind}:${cell.id}`, cell);
      }
      const cells = [...el.querySelectorAll<HTMLElement>('[data-cell-id]')];
      cells.forEach((node, i) => {
        const id = node.dataset.cellId;
        const kind = node.dataset.cellKind;
        if (id && kind) {
          const cell = byKey.get(`${kind}:${id}`);
          if (cell) this.deps.attachTooltip(node, () => this.cellTooltipHtml(cell));
        }
        node.addEventListener('keydown', (e) => {
          const ke = e as KeyboardEvent;
          const next = rovingTarget(ke.key, i, cells.length, 'both');
          if (next === null) return;
          ke.preventDefault();
          this.gridIndex = next;
          this.stampGridTabIndex(cells);
          cells[next]?.focus();
        });
      });
    }
  }

  private fmt(n: number): string {
    return formatNumber(n, { maximumFractionDigits: 0 });
  }
}

export type { ReliquaryNavId };
// Re-export nav helpers so callers (and tests) need only one import surface.
export { isReliquaryNavId, RELIQUARY_NAV };
