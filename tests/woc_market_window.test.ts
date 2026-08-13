import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripComments } from './helpers/strip_comments';

// The $WOC Exchange window painter is a cold DOM module; driving its live DOM
// belongs to the opt-in browser suite. This is the no-DOM source-scan
// equivalent (the tests/market_window.test.ts pattern): each pin below names
// WHY it exists, because a source regex proves discipline, not behavior.
const painter = readFileSync(new URL('../src/ui/woc_market_window.ts', import.meta.url), 'utf8');

// Slice a method body between two source anchors so an assertion about
// open()/render()/relocalize() cannot be satisfied by a token elsewhere.
const between = (start: string, end: string): string => {
  const from = painter.indexOf(start);
  expect(from, `anchor missing: ${start}`).toBeGreaterThanOrEqual(0);
  const to = painter.indexOf(end, from);
  expect(to, `anchor missing after ${start}: ${end}`).toBeGreaterThan(from);
  return painter.slice(from, to);
};

// Presence pins scan the comment-stripped text, so a commented-out
// `case 'review':` cannot satisfy them.
const code = stripComments(painter);

describe('woc_market_window: no magic color values', () => {
  it('carries no raw hex color literal (QUALITY_COLOR + var(--...) are the only channels)', () => {
    // The (?<!&) guard skips the pager's numeric HTML entities (&#8249; and
    // &#8250;), whose digits are all hex characters but are not colors.
    const hex = painter.match(/(?<!&)#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hex, `hex colors must move to tokens/CSS: ${hex.join(', ')}`).toEqual([]);
  });

  it('carries no rgb()/hsl() color literal', () => {
    expect(painter).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });

  it('routes item-name color through the shared QUALITY_COLOR map with a token fallback', () => {
    // The one color the painter writes comes from the vendor/bags convention,
    // never a per-window palette.
    expect(painter).toContain("import { iconDataUrl, QUALITY_COLOR } from './icons';");
    expect(painter).toContain("QUALITY_COLOR[quality] ?? 'var(--color-quality-default)'");
  });

  it('uses no em or en dashes (ASCII separators only)', () => {
    // Unicode escapes so this guard file itself stays free of the characters
    // it hunts (the repo-wide copy scan reads test sources too).
    expect(painter.includes('\u2014'), 'em dash found').toBe(false);
    expect(painter.includes('\u2013'), 'en dash found').toBe(false);
  });
});

describe('woc_market_window: cold-window contract', () => {
  it('arms no repeating driver of its own (Hud.update() polls refreshIfChanged instead)', () => {
    // A cold window may not self-schedule at ANY cadence; countdowns tick via
    // the second-resolution digest in wocMarketViewSig, not a timer.
    expect(painter).not.toMatch(
      /\b(?:setInterval|setTimeout|requestAnimationFrame|requestIdleCallback)\s*\(/,
    );
  });

  it('performs no forced-reflow layout read beyond the granted scroll pair', () => {
    // The layout-thrash killers the perf gate scans painters for; a cold
    // window holds this contract whatever its poll cadence. `.scrollTop` is
    // absent from this list because it is GRANTED to this file, at a count, in
    // hud_perf_budget's COLD_PAINTER_ALLOWANCES; the case below is what holds it
    // to the granted shape, so removing that case is what would weaken this.
    for (const token of [
      'getBoundingClientRect',
      'getClientRects',
      'offsetWidth',
      'offsetHeight',
      'offsetTop',
      'offsetLeft',
      'offsetParent',
      'clientWidth',
      'clientHeight',
      'scrollLeft',
      'scrollWidth',
      'scrollHeight',
    ]) {
      expect(painter.includes(token), `forced-reflow read: ${token}`).toBe(false);
    }
    // getComputedStyle is called BARE in this tree, never as a member, so the
    // scan matches the bare call form only.
    expect(painter).not.toMatch(/(?<![.\w])getComputedStyle\s*\(/);
  });

  it('preserves scroll with ONE read site and ONE write site, both inside the rebuild', () => {
    // The granted allowance is 2 occurrences for TWO containers, which only holds
    // because both go through the SCROLL_KEEPERS table. Counting here rather than
    // trusting the grant: a second hand-rolled read would still satisfy the perf
    // gate's count only by someone raising it, and would silently satisfy nothing
    // at all if this case merely asserted the tokens were present.
    const code = painter.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code.match(/\.scrollTop\b/g) ?? []).toHaveLength(2);
    // Order is the whole contract: read before innerHTML throws the container
    // away, write back after wire() has rebuilt it. Reversed, the read returns 0
    // and the restore is a no-op that looks like it works.
    const inner = between('private renderInner(', 'private usd(');
    const read = inner.indexOf('?.scrollTop ?? 0');
    const wipe = inner.indexOf('root.innerHTML =');
    const write = inner.indexOf('el.scrollTop = top');
    expect(read).toBeGreaterThanOrEqual(0);
    expect(wipe).toBeGreaterThan(read);
    expect(write).toBeGreaterThan(inner.indexOf('this.wire(root, model)'));
    // Keyed, so a tab switch or a different listing still starts at the top
    // rather than inheriting an offset into content that no longer exists.
    expect(inner).toContain('if (keys[name] !== this.renderedScrollKey[name]) continue;');
    expect(painter).toContain("return { body: this.tab, detail: `${this.tab}:${listing ?? ''}` };");
    // Both containers, named. A table of one would pass every count above.
    expect(painter).toContain("['body', '.wm-body'],");
    expect(painter).toContain("['detail', '.wm-detail'],");
  });

  it('keeps the wocMarketViewSig repaint guard the hud_update_drive registry names', () => {
    // refreshIfChanged() must bail on an unmoved digest, or the slow-band poll
    // rebuilds the whole subtree every 500 ms.
    expect(painter).toContain('if (sig === this.lastSig) return;');
    // BOTH halves. Pinning only the comparison let the assignment be deleted,
    // which leaves lastSig at '' forever so every slow-band poll rebuilds the
    // whole subtree while this guard still reported the signature present.
    expect(painter).toContain('this.lastSig = ');
  });
});

describe('woc_market_window: rebuild carries focus and typed input across', () => {
  it('imports the shared focus_restore and form_draft seams (never a hand-rolled read)', () => {
    expect(painter).toContain(
      "import { captureFocusKey, restoreFirstEnabled } from './focus_restore';",
    );
    expect(painter).toContain("import { captureFormDraft, restoreFormDraft } from './form_draft';");
  });

  it('calls all four helpers inside render(), around the innerHTML wipe', () => {
    // render() replaces the whole subtree; without capture-before / restore-
    // after, every poll rebuild would eat the focused control and typed input.
    const render = between('render(): void {', 'private usd(');
    expect(render).toContain('captureFocusKey(root)');
    expect(render).toContain('captureFormDraft(root)');
    expect(render).toContain('restoreFormDraft(root, draft)');
    expect(render).toContain('restoreFirstEnabled(');
  });
});

describe('woc_market_window: focus management and dialog chrome', () => {
  it('open() captures the opener BEFORE closeOthers() can move focus', () => {
    // closeOthers() may restore focus for the window it closes; capturing
    // after it would record the wrong opener and strand focus on close.
    const open = between('open(): void {', 'toggle(): void {');
    const capture = open.indexOf('this.deps.captureFocus()');
    const closeOthers = open.indexOf('this.deps.closeOthers()');
    expect(capture).toBeGreaterThanOrEqual(0);
    expect(closeOthers).toBeGreaterThan(capture);
  });

  it('close() returns focus to the captured opener', () => {
    const close = painter.slice(painter.indexOf('close(): void {'));
    expect(close).toContain('this.deps.restoreFocus(this.opener)');
  });

  it('marks the dialog root with the title as its one accessible name', () => {
    expect(painter).toContain("markDialogRoot(root, { labelledBy: 'woc-market-title' })");
  });
});

describe('woc_market_window: i18n and escaping discipline', () => {
  it('renders through the hudChrome.wocMarket catalog namespace', () => {
    expect(painter).toContain("t('hudChrome.wocMarket.");
  });

  it('gives the review settlement state its OWN label, never the offered default', () => {
    // The default arm renders 'Payment due': serving that for a parked
    // 'review' row would invite a second payment for money that may already
    // have landed on chain. ASSOCIATIVE: the label must sit inside the
    // review arm itself, so a mis-wired case keeping both tokens elsewhere
    // still reds.
    const arm = code.indexOf("case 'review':");
    expect(arm, "anchor missing: case 'review':").toBeGreaterThanOrEqual(0);
    expect(code.slice(arm, arm + 200)).toContain("'hudChrome.wocMarket.settlementReview'");
  });

  it('never toasts purchase-complete for a review-parked confirm outcome', () => {
    // The outcome arm can answer state 'review' on a recorded-signature
    // retry, and "purchase complete" for money awaiting an operator verdict
    // is the custody lie the row label rule bans. ASSOCIATIVE: the branch
    // must pick settlementReview, with purchaseComplete as its else.
    const arm = code.indexOf("out.state === 'review'");
    expect(arm, "anchor missing: out.state === 'review'").toBeGreaterThanOrEqual(0);
    const window = code.slice(arm, arm + 300);
    expect(window).toContain("'hudChrome.wocMarket.settlementReview'");
    expect(window).toContain("'hudChrome.wocMarket.purchaseComplete'");
  });

  it('toasts the cancel-pending outcome distinctly from a completed cancel', () => {
    // The seller's cancel on a locked window is ACCEPTED as intent; telling
    // them "Listing cancelled" while it stays live until the buyer's window
    // resolves would be a lie about custody. ASSOCIATIVE: the toast key must
    // sit inside the cancelPending branch.
    const arm = code.indexOf('out.cancelPending === true');
    expect(arm, 'anchor missing: out.cancelPending === true').toBeGreaterThanOrEqual(0);
    expect(code.slice(arm, arm + 300)).toContain("'hudChrome.wocMarket.listingCancelPending'");
  });

  it('never writes a plain string literal via textContent or setAttribute(aria-label)', () => {
    // Rendered text must come from t(); these are the two raw-write sinks a
    // template-string painter could otherwise smuggle English through.
    expect(painter).not.toMatch(/\.textContent\s*=/);
    expect(painter).not.toContain("setAttribute('aria-label'");
  });

  it('escapes every aria-label interpolation (each aria-label=" is followed by ${esc()', () => {
    // Accessible names are t() output interpolated into HTML, so each one
    // must pass through esc(); a bare English aria-label would also dodge the
    // i18n catalog entirely.
    const segments = painter.split('aria-label="').slice(1);
    // AT the real count (10), not "> 0", which one surviving attribute
    // satisfied. A floor rather than an exact count so adding a labelled
    // control does not red the suite, while deleting nine still does. It dropped
    // from 11 when the sell tab's per-item buttons became a labelled dropdown,
    // whose search box and select are named by their own <label> instead.
    expect(segments.length).toBeGreaterThanOrEqual(10);
    for (const segment of segments) {
      expect(segment.startsWith('${esc(')).toBe(true);
      // And the WHOLE value, not just its prefix: `${esc(a)} ${raw}` passed a
      // starts-with check while interpolating an unescaped tail.
      const value = segment.slice(0, segment.indexOf('"'));
      for (const hole of value.matchAll(/\$\{/g)) {
        expect(
          value.slice(hole.index).startsWith('${esc(') ||
            value.slice(hole.index).startsWith('${this.'),
          `unescaped interpolation in aria-label: ${value}`,
        ).toBe(true);
      }
    }
  });

  it('escapes player names and money before interpolating them into HTML', () => {
    // sellerName/buyerName are server-relayed player text: raw interpolation
    // is an XSS sink. The positive pins prove esc() is in use; the negative
    // regex proves no raw ${...sellerName} or ${...buyerName} slipped in.
    expect(painter).toContain('esc(r.sellerName)');
    expect(painter).toContain('esc(this.usd');
    expect(painter).not.toMatch(/\$\{(?:r|d\.row|s)\.(?:sellerName|buyerName)\}/);
  });
});

describe('woc_market_window: language fan-out', () => {
  it('relocalize() self-gates on its own open check', () => {
    // The woc:languagechange fan-out calls relocalize() unconditionally on
    // every registered window; an ungated arm would rebuild a closed window.
    const relocalize = between('relocalize(): void {', 'buildModel');
    expect(relocalize).toContain('if (!this.isOpen) return;');
    expect(relocalize).toContain('this.render();');
  });
});

describe('woc_market_window: every class it emits is actually styled', () => {
  // The bug this pins shipped and was caught only by looking at a screenshot:
  // 19 of the 42 classes the painter emitted matched no rule in any sheet, so
  // the tab strip, the primary buttons and the window header rendered as raw
  // white browser chrome on the dark panel. Nothing failed, because a missing
  // CSS rule is silent; only a human eye or this guard sees it. It also catches
  // the reverse drift (a class renamed in TS, its rule left behind).
  // Comments are STRIPPED before harvesting selectors: these sheets name plenty
  // of classes in prose, and crediting a class as styled because a comment
  // mentions it would let a rename be "verified" by documentation.
  const sheets = ['components.css', 'hud.css', 'base.css', 'layout.css', 'hud.mobile.css']
    .map((f) => readFileSync(new URL(`../src/styles/${f}`, import.meta.url), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  /**
   * Classes the painter emits: literal `class="..."` attributes, the three it
   * hands the shared tab-strip family, and the quoted class fragments inside an
   * INTERPOLATED attribute. That last source is the one this guard originally
   * missed. The first version excluded any attribute containing `${`, which
   * quietly dropped 10 of 52 classes, and two of those (the reserve badge's
   * met/not_met states) were genuinely unstyled: the guard's blind spot was
   * exactly the shape of the defect it was written to catch.
   */
  const emitted = (): string[] => {
    const found = new Set<string>();
    const add = (value: string): void => {
      for (const cls of value.split(/\s+/)) {
        // A name left dangling on a hyphen is the static PREFIX of an
        // interpolated class (`wm-reserve-${...}`), not a class anyone styles.
        // The full spellings are added by the suffix-family branch below.
        if (cls !== '' && !cls.endsWith('-')) found.add(cls);
      }
    };
    for (const m of painter.matchAll(/class="([^"]*)"/g)) {
      const raw = m[1];
      // The static half of the attribute, with every ${...} hole removed.
      add(raw.replace(/\$\{[\s\S]*?\}/g, ' '));
      // The dynamic half: a class only ever reachable inside an interpolation,
      // e.g. `wm-reserve-${r.reserveBadge}` or a ternary picking two literals.
      for (const hole of raw.matchAll(/\$\{([\s\S]*?)\}/g)) {
        for (const lit of hole[1].matchAll(/'([A-Za-z][\w-]*)'/g)) add(lit[1]);
      }
    }
    for (const key of ['stripClass', 'tabClass', 'selectedClass']) {
      for (const m of painter.matchAll(new RegExp(`${key}: '([^']+)'`, 'g'))) found.add(m[1]);
    }
    // The badge states are built by concatenating a view-model enum onto a
    // prefix, so no literal for either spelling exists in this file at all.
    // Named here because a suffix family is unreachable by any regex over the
    // painter alone, and both spellings shipped unstyled.
    if (painter.includes('wm-reserve-')) {
      add('wm-reserve-met wm-reserve-not_met');
    }
    return [...found].sort();
  };

  it('emits a substantial class set (the floor keeps this from going vacuous)', () => {
    // Near the real count (52 at the time of writing), not far under it: a floor
    // sitting well below is what let the truncated 42-class harvest look fine.
    expect(emitted().length).toBeGreaterThanOrEqual(50);
  });

  it('keeps the stateful tab and primary rules above the window-wide button rule', () => {
    // A specificity trap that already bit once. The window-wide chrome rule is
    // `#woc-market-window button:not(.x-btn)`, and :not() carries its argument's
    // specificity, making it (1,1,1). A plain `#woc-market-window .wm-tab-selected`
    // is (1,1,0), so it LOSES however late it sits, and the selected tab silently
    // stopped reading as selected: state a player navigates by, erased by a rule
    // added to fix something else. Writing them as `button.<class>` ties the
    // specificity so source order decides, and they come later.
    const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
    for (const cls of ['wm-tab', 'wm-tab-selected', 'wm-primary']) {
      expect(css, `${cls} must be scoped as button.${cls}`).toContain(
        `#woc-market-window button.${cls}`,
      );
      // And never as the bare class, which is the losing form.
      expect(css.includes(`#woc-market-window .${cls} {`), `bare .${cls} rule loses`).toBe(false);
    }
    // Order still has to hold: the generic rule must come FIRST.
    expect(css.indexOf('#woc-market-window button:not(.x-btn) {')).toBeLessThan(
      css.indexOf('#woc-market-window button.wm-tab-selected'),
    );
  });

  it('harvests the classes that exist ONLY inside an interpolated attribute', () => {
    // Pins the hole itself closed. Each of these is reachable only through a
    // `${...}` hole, so all four were invisible to the original regex.
    expect(emitted()).toEqual(
      expect.arrayContaining(['wm-reserve-met', 'wm-reserve-not_met', 'wm-row-selected']),
    );
  });

  it('has a rule in a shipped sheet for every emitted class', () => {
    // Selector position only: the name must be followed by something that can
    // continue a selector, so a bare word in a url() or a filename cannot count.
    const styled = new Set(
      Array.from(sheets.matchAll(/\.([A-Za-z][\w-]*)(?=[\s,:.#{>+~[)]|$)/g), (m) => m[1]),
    );
    const missing = emitted().filter((cls) => !styled.has(cls));
    expect(missing, `emitted but never styled: ${missing.join(', ')}`).toEqual([]);
  });

  it('builds the header from the shared window-chrome family, not a bespoke one', () => {
    // .panel-title + .x-btn + the close glyph are what every other window uses
    // and the only close markup base.css styles; the invented .window-header /
    // .window-close pair is what produced the unstyled header.
    expect(painter).toContain('<div class="panel-title">');
    expect(painter).toContain('class="x-btn" data-close');
    expect(painter).toContain("svgIcon('close')");
    // Matched as MARKUP, not as bare text: the painter's own comment names both
    // retired classes to explain why they went away.
    expect(painter).not.toContain('class="window-close"');
    expect(painter).not.toContain('class="window-header"');
  });

  it('closes on the family data-close marker, not only its own data-action', () => {
    // Switching the markup to the family without widening the delegated click
    // selector would leave a close button that renders correctly and does
    // nothing when clicked.
    expect(painter).toContain('[data-action], [data-close], .wm-row-open, .wm-row');
    expect(painter).toContain("target.hasAttribute('data-close')");
  });
});

describe('woc_market_window: both game entries carry its root element', () => {
  it('declares #woc-market-window in index.html AND play.html', () => {
    // index.html and play.html both boot src/main.ts (src/CLAUDE.md), and the
    // HUD resolves this window by id. play.html shipped without the element,
    // so the whole exchange was unreachable on /play while looking fine on /.
    for (const entry of ['index.html', 'play.html']) {
      const html = readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');
      expect(html, `${entry} is missing the window root`).toContain('id="woc-market-window"');
    }
  });
});

describe('woc_market_window: the item inspector on hover', () => {
  it('reuses the SHARED item tooltip rather than building a second one', () => {
    // The whole point of the feature is that a listing reads identically to worn
    // gear. A bespoke tooltip here would drift from the character window's the
    // first time the stat copy changed.
    expect(painter).toContain('attachTooltip(element: HTMLElement, html: () => string): void');
    expect(painter).toContain('itemTooltip(item: ItemDef, instance?: ItemInstancePayload): string');
    expect(painter).toContain(
      'this.deps.attachTooltip(el, () => this.deps.itemTooltip(def, target.instance))',
    );
    // And it does NOT reimplement stat formatting: no stat-line construction here.
    expect(painter).not.toMatch(/itemStatName|instanceBonusStatLines|instanceBadgeLines/);
  });

  it('passes the INSTANCE payload through, so rolled stats are what you see', () => {
    // A listing's value lives in its instance (rolled stats, masterwork, enchant).
    // Showing the base def would misprice every crafted or enchanted item.
    const cell = between('private itemCellHtml(', 'private attachItemTooltips(');
    expect(cell).toContain('instance?: ItemInstancePayload');
    expect(cell).toContain('this.tooltipTargets.set(key, { itemId, instance });');
  });

  it('tags every one of the five item surfaces with a namespaced, stable key', () => {
    // Namespaced so the same item on two tabs cannot collide, and carrying the
    // row's own id so the hover target survives a poll rebuild.
    for (const key of [
      '`browse:${r.id}`',
      '`detail:${d.row.id}`',
      // The sell tab keys off the CHOSEN row now, not a row in a rendered list.
      '`sell:${selected.index}`',
      // ...and off each OPTION in the open picker, which is a fifth surface
      // registered directly rather than through itemCellHtml, because an option
      // is an icon plus a name in its own layout, not a shared cell.
      '`opt:${r.index}`',
      '`activity:${l.id}`',
    ]) {
      expect(painter, `missing tooltip key ${key}`).toContain(key);
    }
    // Every itemCellHtml call passes a key: a 3-arg call would register nothing
    // and silently render an un-hoverable cell.
    const calls = painter.match(/this\.itemCellHtml\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call, `itemCellHtml without a key: ${call}`).toMatch(
        /,\s*`(browse|detail|sell|activity):/,
      );
    }
  });

  it('clears the target registry every render, so a key cannot outlive its row', () => {
    // The registry describes the CURRENT DOM. A stale entry would attach a
    // tooltip for a listing that had already been replaced.
    const html = between('private html(model: WocMarketViewModel): string {', 'if (model.kind ===');
    expect(html).toContain('this.tooltipTargets.clear()');
  });

  it('hides the shared tooltip BEFORE wiping the subtree it is anchored to', () => {
    // A removed node fires no mouseleave, so a rebuild during hover would leave
    // the tooltip box pointing at nothing.
    const render = between('render(): void {', 'private usd(');
    const hide = render.indexOf('this.deps.hideTooltip()');
    const wipe = render.indexOf('root.innerHTML = this.html(model)');
    expect(hide).toBeGreaterThanOrEqual(0);
    expect(wipe).toBeGreaterThan(hide);
  });

  it('re-attaches after every rebuild, since the nodes are new each time', () => {
    const render = between('render(): void {', 'private usd(');
    const wipe = render.indexOf('root.innerHTML = this.html(model)');
    const attach = render.indexOf('this.attachItemTooltips(root)');
    expect(attach).toBeGreaterThan(wipe);
  });

  it('skips an item id this client has no def for instead of an empty box', () => {
    const attach = between('private attachItemTooltips(', 'private html(');
    expect(attach).toContain('const def = ITEMS[target.itemId]');
    expect(attach).toContain('if (!def) continue');
  });

  it('still performs no forced-reflow read: the shared binder owns positioning', () => {
    // The reason this can be a cold window AND have hover tooltips: every layout
    // measurement lives in Hud.attachTooltip, not here.
    for (const token of ['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'clientWidth']) {
      expect(painter.includes(token), `forced-reflow read: ${token}`).toBe(false);
    }
  });
});

describe('woc_market_window: the sell tab is an ARIA combobox', () => {
  it('is a role=combobox input owning a role=listbox, not a native select', () => {
    // A native <option> cannot carry an icon, which is why this stopped being a
    // <select>. The ARIA contract is what makes the replacement usable.
    const sell = between('private sellHtml(', 'private activityHtml(');
    expect(sell).toContain('role="combobox"');
    expect(sell).toContain('aria-autocomplete="list"');
    expect(sell).toContain('aria-controls="${listId}"');
    expect(sell).toContain('aria-expanded="${open}"');
    expect(sell).toContain('role="listbox"');
    // No select and no per-item button survives.
    expect(sell).not.toContain('<select data-field="sell-item"');
    expect(sell).not.toContain('data-action="sell-select"');
  });

  it('points aria-activedescendant at the highlighted option, and only when there is one', () => {
    // The whole reason DOM focus can stay on the input: the active option is
    // announced by id rather than by moving focus.
    const sell = between('private sellHtml(', 'private activityHtml(');
    expect(sell).toContain('aria-activedescendant="${listId}-o${active}"');
    expect(sell).toContain('active >= 0 ?');
    // Two writers now point at these ids (the markup and paintSellActive), so the
    // id itself is ONE definition. Two literals would drift apart silently and the
    // only symptom would be a screen reader announcing nothing.
    expect(painter).toContain("const SELL_LISTBOX_ID = 'wm-sell-listbox';");
    expect(sell).toContain('const listId = SELL_LISTBOX_ID;');
    expect(painter).toContain('`${SELL_LISTBOX_ID}-o${this.sellActive}`');
    // The label's `for` resolves to a real id while the input exists, and drops to
    // a plain caption once the chosen cell replaces it.
    expect(sell).toContain('id="${listId}-input"');
    expect(sell).toContain('for="${listId}-input"');
  });

  it('renders options as NON-focusable divs, never buttons', () => {
    // A focusable option would be pulled into the window's focus-trap cycle and
    // fight the aria-activedescendant model (the social_window note).
    const sell = between('private sellHtml(', 'private activityHtml(');
    const options = sell.slice(sell.indexOf('wm-combo-item'));
    expect(options).toContain('role="option"');
    expect(options.slice(0, 400)).not.toContain('<button');
    expect(options).not.toContain('tabindex');
  });

  it('shows an ICON next to every option name', () => {
    const sell = between('private sellHtml(', 'private activityHtml(');
    expect(sell).toContain('wm-combo-icon');
    expect(sell).toContain("iconDataUrl('item', r.itemId, 28)");
  });

  it('renders the selected item INSIDE the control, hoverable, with a clear button', () => {
    const sell = between('private sellHtml(', 'private activityHtml(');
    expect(sell).toContain('wm-combo-chosen');
    // A real cell, so the shared stats tooltip still attaches to it.
    expect(sell).toContain('`sell:${selected.index}`');
    // The clear button reuses the shared .x-btn chrome family and its close glyph.
    expect(sell).toContain('class="x-btn wm-combo-clear"');
    expect(sell).toContain('data-action="sell-clear"');
    expect(sell).toContain("svgIcon('close')");
  });

  it('the clear button is named for the item it clears, not just "clear"', () => {
    // Several controls on this tab would otherwise share the accessible name "X".
    const sell = between('private sellHtml(', 'private activityHtml(');
    expect(sell).toContain("t('hudChrome.wocMarket.sellClear', { item:");
  });

  it('clearing returns to an EMPTY search, ready to pick again', () => {
    const onClick = between("case 'sell-clear':", "case 'place-bid':");
    expect(onClick).toContain('this.sellIndex = null');
    expect(onClick).toContain("this.sellSearch = ''");
    expect(onClick).toContain('this.sellOpen = false');
  });

  it('filters on the item NAME, case-insensitively, in one place', () => {
    // One definition shared by the markup and the key handler, so a highlight
    // index cannot mean a different row in each.
    const matches = between(
      'private sellMatches(): WocSellRowModel[] {',
      'private commitSellPick(',
    );
    expect(matches).toContain('this.sellSearch.trim().toLowerCase()');
    expect(matches).toContain('this.itemName(r.itemId).toLowerCase().includes(query)');
  });

  it('keeps the query, the open flag and the highlight in PAINTER state', () => {
    // The window rebuilds from state on the slow poll band; DOM-only state would
    // collapse the listbox mid-interaction.
    expect(painter).toContain('private sellSearch = ');
    expect(painter).toContain('private sellOpen = false');
    expect(painter).toContain('private sellActive = -1');
  });

  it('resolves the highlight against the RENDERED model, not a fresh one', () => {
    // The index must mean the row the seller can see. Rebuilding the model in the
    // key handler would resolve it against an inventory that may have moved on.
    expect(painter).toContain('private lastModel: WocMarketViewModel | null = null');
    const matches = between(
      'private sellMatches(): WocSellRowModel[] {',
      'private commitSellPick(',
    );
    expect(matches).toContain('this.lastModel');
  });

  it('reuses the shared dropdownKeyNav core rather than a second key model', () => {
    expect(painter).toContain("import { dropdownKeyNav } from './dropdown_nav'");
    expect(painter).toContain(
      'dropdownKeyNav(e.key, this.sellOpen, this.sellActive, matches.length)',
    );
    for (const kind of ['open', 'move', 'select', 'close', 'tab']) {
      expect(painter, `unhandled nav action: ${kind}`).toContain(`case '${kind}':`);
    }
  });

  it('does NOT route Space to that core: in a text field Space is content', () => {
    // dropdownKeyNav maps Space to activate, which is right for a button trigger
    // and wrong here: the space bar would select an item instead of typing.
    const keydown = between(
      'private onKeyDown(e: KeyboardEvent): void {',
      'private onComboMouseDown(',
    );
    expect(keydown).toContain("if (e.key === ' ') return;");
    const spaceGuard = keydown.indexOf("e.key === ' '");
    const navCall = keydown.indexOf('dropdownKeyNav(');
    expect(spaceGuard).toBeGreaterThanOrEqual(0);
    expect(navCall).toBeGreaterThan(spaceGuard);
  });

  it('Enter with nothing highlighted picks nothing', () => {
    // Committing the first match on a bare Enter would list an item the seller
    // never chose.
    const keydown = between(
      'private onKeyDown(e: KeyboardEvent): void {',
      'private onComboMouseDown(',
    );
    expect(keydown).toContain('if (pick) this.commitSellPick(pick.index)');
  });

  it('Tab closes the list WITHOUT preventDefault, so focus advances natively', () => {
    const keydown = between(
      'private onKeyDown(e: KeyboardEvent): void {',
      'private onComboMouseDown(',
    );
    const tabArm = keydown.slice(keydown.indexOf("case 'tab':"));
    expect(tabArm).toContain('this.sellOpen = false');
    // The CALL, not the word: the arm's comment explains why it is absent.
    expect(tabArm.slice(0, tabArm.indexOf('return'))).not.toContain('e.preventDefault()');
  });

  it('selects on mousedown, not click, so the blur cannot beat the selection', () => {
    // The options are non-focusable, so a click would blur the input first and
    // focusout would close the listbox before the pick landed.
    expect(painter).toContain("root.addEventListener('mousedown'");
    const down = between(
      'private onComboMouseDown(e: MouseEvent): void {',
      'private onComboMouseMove(',
    );
    expect(down).toContain('e.preventDefault()');
    expect(down).toContain('commitSellPick');
  });

  it('moves the hover highlight IN PLACE, and never by rebuilding', () => {
    // Not a saving: a correctness requirement. A rebuild replaces the very option
    // the pointer is resting on, and a removed node fires no mouseleave and gets
    // no fresh mouseenter while the pointer sits still, so the item stats card was
    // hidden and never came back. Repainting the highlight leaves the hovered
    // option, and its tooltip binding, alive.
    // Anchored on the next method SIGNATURE, not on a doc comment: the comment
    // above onFocusOut was rewritten and silently broke this slice.
    const move = between(
      'private onComboMouseMove(e: MouseEvent): void {',
      'private onFocusIn(e: FocusEvent): void {',
    );
    expect(move).toContain('this.paintSellActive(this.deps.root())');
    expect(move).not.toContain('this.render()');
    // And still only on a real change: mousemove fires continuously.
    expect(move).toContain('next === this.sellActive');
  });

  it('moves the keyboard highlight the same way, so there is one mechanism', () => {
    // Two mechanisms would drift: the arrow keys would rebuild (losing the card
    // the pointer had opened) while the pointer did not.
    const keys = between(
      'private onKeyDown(e: KeyboardEvent): void {',
      'private onComboMouseDown(',
    );
    const move = keys.slice(keys.indexOf("case 'move':"), keys.indexOf("case 'select':"));
    expect(move).toContain('this.paintSellActive(this.deps.root())');
    expect(move).not.toContain('this.render()');
    // 'open' is the exception and must stay a rebuild: a hidden listbox has no
    // options to repaint, so painting in place there would highlight nothing.
    const open = keys.slice(keys.indexOf("case 'open':"), keys.indexOf("case 'move':"));
    expect(open).toContain('this.render()');
  });

  it('paints the class, aria-selected and aria-activedescendant together', () => {
    // The three are one state. Moving the class without the ARIA pair leaves a
    // screen reader announcing an option the sighted highlight has left.
    const paint = between(
      'private paintSellActive(root: HTMLElement): void {',
      'private onFocusOut(',
    );
    expect(paint).toContain("option.classList.toggle('wm-combo-active', on)");
    expect(paint).toContain("option.setAttribute('aria-selected', on ? 'true' : 'false')");
    expect(paint).toContain("input?.setAttribute('aria-activedescendant',");
    // Cleared, not left stale, when nothing is highlighted.
    expect(paint).toContain("input?.removeAttribute('aria-activedescendant')");
    // The active option is scrolled into view: the list opens at FULL length, so
    // arrowing down leaves the visible 240px within a few keystrokes. This is a
    // scroll command, not one of the forced-reflow READS the cold contract counts,
    // and it is what the sibling social_window combobox uses for the same case.
    expect(paint).toContain("option.scrollIntoView({ block: 'nearest' })");
  });

  it('closes on focusout only when focus leaves the whole combobox', () => {
    const out = between('private onFocusOut(e: FocusEvent): void {', 'private scrollKeys(');
    expect(out).toContain('combo.contains(next)');
  });

  it('ignores the focusout its OWN rebuild causes', () => {
    // The bug this pins cost real debugging time and looked nothing like its
    // cause. Every render() replaces the subtree, and the browser moves focus off
    // the input while removing it, firing focusout with a null relatedTarget. The
    // rebuild therefore closed its own listbox, so the NEXT keystroke saw the list
    // as closed and Enter/Escape fell through to dropdownKeyNav's collapsed
    // branch: the widget looked like it had broken state, not a focus problem.
    expect(painter).toContain('private rendering = false');
    const out = between('private onFocusOut(e: FocusEvent): void {', 'private scrollKeys(');
    expect(out).toContain('if (this.rendering');
    // The flag must cover the focus RESTORE too, which is itself a focus move.
    const render = between('render(): void {', 'private renderInner(');
    expect(render).toContain('this.rendering = true');
    expect(render).toContain('finally');
    expect(render).toContain('this.rendering = false');
  });

  it('does NOT rely on isConnected to tell a rebuild from a real blur', () => {
    // The first attempt did, and it silently failed: the node is still attached at
    // the moment focusout fires, so the guard passed every time.
    const out = between('private onFocusOut(e: FocusEvent): void {', 'private scrollKeys(');
    expect(out).not.toContain('isConnected');
  });

  it('opens the whole list on FOCUS, before a single keystroke', () => {
    // A player who does not know what is listable should not have to guess a
    // search term to find out. An empty query matches every row, so opening on
    // focus shows the full scrollable inventory and typing only narrows it.
    const focusIn = between('private onFocusIn(e: FocusEvent): void {', 'private paintSellActive(');
    expect(focusIn).toContain("data-field') !== 'sell-search'");
    expect(focusIn).toContain('this.sellOpen = true');
    expect(focusIn).toContain('this.render()');
    // focusin, not focus: only the former bubbles to the one delegated listener.
    const render = between('render(): void {', 'const model = this.buildModel()');
    expect(render).toContain("root.addEventListener('focusin',");
    expect(render).not.toContain("root.addEventListener('focus',");
    // And the query itself is NOT reset here: reopening on a re-focus must not
    // silently discard what the seller already typed.
    expect(focusIn).not.toContain('this.sellSearch');
  });

  it('ignores the focusin its OWN rebuild causes, or Escape could never close', () => {
    // The exact mirror of the onFocusOut trap, and it bites in the opposite
    // direction: renderInner's focus restore puts focus back on this input, so
    // without the guard Escape would close the list and the rebuild it triggers
    // would reopen it on the way out. Unclosable, and it would read as a stuck
    // dropdown rather than a focus problem.
    const focusIn = between('private onFocusIn(e: FocusEvent): void {', 'private paintSellActive(');
    expect(focusIn).toContain('if (this.rendering || this.sellOpen) return;');
  });

  it('shows the item stats card from an option ICON, not only once chosen', () => {
    // Comparing candidates is the point: a seller picks between two epics by
    // reading their stats, which previously meant selecting one, reading it,
    // clearing, and selecting the other.
    const sell = between('private sellHtml(', 'private activityHtml(');
    expect(sell).toContain('this.tooltipTargets.set(`opt:${r.index}`');
    expect(sell).toContain('instance: r.instance');
    expect(sell).toContain('data-tt-key="opt:${r.index}"');
    // The key rides on the icon and NOT on the name: a card chasing the pointer
    // across every row of a 70-item list is noise, so the icon is the deliberate
    // target. Pinned by position, since both live in the same option div.
    const icon = sell.indexOf('wm-combo-icon');
    const name = sell.indexOf('wm-combo-name');
    expect(sell.slice(icon, name)).toContain('data-tt-key');
    expect(sell.slice(name)).not.toContain('data-tt-key');
  });

  it('does not rebuild under an open picker, which would eat the hovered card', () => {
    // The remaining way the card could vanish mid-hover: the slow-band poll firing
    // on a countdown bucket change while the pointer rests on an option.
    const refresh = between('refreshIfChanged(): void {', 'relocalize(): void {');
    const skip = "if (this.tab === 'sell' && this.sellOpen) return;";
    // Scoped to the TAB as well as the flag, and that is not belt-and-braces: the
    // flag is cleared by a focusout, and any path that skipped one would otherwise
    // freeze the browse countdowns for the rest of the session. Bounding the skip
    // to the tab the picker lives on makes the worst case a stale sell tab.
    expect(refresh).toContain(skip);
    // Before the signature is read, so lastSig is left unmoved and the very next
    // poll after the picker closes still sees the change. Skipping AFTER the read
    // would latch the new digest and drop the update entirely.
    expect(refresh.indexOf(skip)).toBeLessThan(refresh.indexOf('const sig ='));
  });

  it('tells the seller when a search matches nothing', () => {
    expect(painter).toContain('hudChrome.wocMarket.sellNoMatches');
    const sell = between('private sellHtml(', 'private activityHtml(');
    // The empty row is marked disabled so a screen reader does not offer it.
    expect(sell).toContain('aria-disabled="true"');
  });
});

describe('woc_market_window: a combined listing is opted into by price, not by picker', () => {
  it('keeps the format selector at two entries', () => {
    // The combined format is creatable again, but it is deliberately NOT a third
    // entry here: a seller who wants one fills the buy-now field on an auction.
    // Three entries would ask them to classify the listing before naming the two
    // prices that are the actual decision, and would let the picker and the
    // fields contradict each other.
    const sell = between('private sellHtml(', 'private activityHtml(');
    expect(sell).toContain('value="auction"');
    expect(sell).toContain('value="buy_now"');
    expect(sell).not.toContain('value="auction_buy_now"');
  });

  it('keeps the painter’s picker state to the two selectable values', () => {
    expect(painter).toContain("private sellFormat: 'auction' | 'buy_now' = 'auction'");
    // The change handler accepts only what the picker can emit; the third format
    // is derived at submit, never selected. Matched as a COMPARISON, not as bare
    // text, since nearby comments name the combined format.
    const onChange = between(
      'private onChange(e: Event): void {',
      'private async reloadBrowseOnly(',
    );
    expect(onChange).not.toContain("=== 'auction_buy_now'");
    expect(onChange).toContain("value === 'auction' || value === 'buy_now'");
  });

  it('submits auction_buy_now exactly when an auction named a price', () => {
    // The whole mapping, and the reason the picker can stay at two entries. A
    // submit that forwarded `format` verbatim would send 'auction' with a
    // buy-now price, which validListingParams refuses as bad_buy_now.
    const submit = between('private async submitListing(', 'private async payBond(');
    expect(submit).toContain(
      "format === 'auction' && buyNowCents !== null ? 'auction_buy_now' : format",
    );
    // And the derived value, not the picked one, is what reaches the wire and
    // decides which of the two price fields is dropped.
    expect(submit).toContain('format: submitFormat');
    expect(submit).toContain("reserveCents: submitFormat === 'buy_now' ? null : reserveCents");
    expect(submit).toContain("buyNowCents: submitFormat === 'auction' ? null : buyNowCents");
  });

  it('renders all three formats: read and write agree again', () => {
    const view = readFileSync(new URL('../src/ui/woc_market_view.ts', import.meta.url), 'utf8');
    expect(view).toContain("'auction' | 'buy_now' | 'auction_buy_now'");
  });
});

describe('woc_market_window: buy-now must beat the starting bid', () => {
  it('refuses on the client before a round trip, and says which rule failed', () => {
    const submit = between(
      'private async submitListing(): Promise<void> {',
      'private async payBond(',
    );
    expect(submit).toContain('const floor = Math.max(startCents, reserveCents ?? 0)');
    expect(submit).toContain('buyNowCents <= floor');
    expect(submit).toContain('hudChrome.wocMarket.sellBuyNowAboveStart');
  });

  it('compares against the RESERVE too, not just the start', () => {
    // A buy-now under a hidden reserve could never sell: the reserve would block
    // every bid at or below it while the buy-now invited exactly that price.
    const submit = between(
      'private async submitListing(): Promise<void> {',
      'private async payBond(',
    );
    expect(submit).toContain('reserveCents ?? 0');
  });
});

describe('woc_market_window: the picker prompt counts correctly', () => {
  it('renders the count through tPlural, so one item is never "1 items"', () => {
    // A flat '{count} items' template is wrong at 1 in English and wrong in more
    // places in locales with several plural categories.
    expect(painter).toContain("tPlural('hudChrome.plurals.wocMarketSellChoose'");
    expect(painter).not.toContain('sellChoosePrompt');
  });

  it('declares every CLDR category the base needs in English', () => {
    // tPlural falls back to `.other`, so a missing `one` would silently render the
    // plural form for a single item rather than failing.
    const catalog = readFileSync(
      new URL('../src/ui/i18n.catalog/hud_chrome.ts', import.meta.url),
      'utf8',
    );
    const block = catalog.slice(catalog.indexOf('wocMarketSellChoose: {'));
    const decl = block.slice(0, block.indexOf('},'));
    for (const cat of ['one', 'few', 'many', 'other']) {
      expect(decl, `plural category ${cat}`).toContain(`${cat}:`);
    }
    // And the singular really is singular.
    expect(decl).toContain("one: 'Choose from {count} item'");
  });
});

describe('woc_market_window: a fixed-price listing can satisfy the guards buyNow runs', () => {
  it('renders the terms and two-factor fields when there is no bid form to carry them', () => {
    // The defect this pins was UNREACHABLE in local testing and total in effect.
    // buyNow() sends totpCode and acceptTerms, and the server's buyNow gate chain
    // runs guardTotp and guardTerms exactly as placeBid does. But both inputs used
    // to live ONLY inside bidFormHtml, which returns '' for a buy_now listing. So a
    // fixed-price listing at or above the two-factor threshold refused with
    // totp_required while offering no field to type a code into, and a buyer who
    // had never accepted the terms got terms_required with no checkbox: unbuyable,
    // permanently, with no way out from the UI. Every listing in the local database
    // was the legacy combined format, whose bid form DOES render, which is exactly
    // why nothing caught it.
    const detail = between('private detailPaneHtml(', 'private bidFormHtml(');
    expect(detail).toContain('this.confirmFieldsHtml(model)');
    // Only when the bid form is absent: a combined listing would otherwise render
    // the same data-field twice and totpValue() would read whichever came first.
    expect(detail).toContain("bidForm === ''");
    // The COMPOSITION, not the declarations. Asserting the order with indexOf over
    // the whole method was vacuous both ways: `buyNowFields` appears first in its
    // own `const`, so deleting it from the returned concatenation entirely, and
    // moving it after the button, both still passed. The pane is assembled here, so
    // this is the sequence that decides what a player sees.
    const parts = detail
      .slice(detail.indexOf('      estimate +'), detail.indexOf('      cancel +'))
      .split('+')
      .map((piece) => piece.trim())
      .filter(Boolean);
    expect(parts).toEqual(['estimate', 'bidForm', 'buyNowFields', 'buyNow']);
  });

  it('defines the terms field exactly once, so both paths send the same name', () => {
    // One definition is the whole point: two copies drift, and the server reads one
    // name. This was two fields until 2FA came off the Exchange's paying side; the
    // helper stays because both the bid form and the buy-now path still need the
    // terms checkbox, which is the whole reason it was extracted.
    const fields = between('private confirmFieldsHtml(', 'private sellHtml(');
    expect(fields).toContain('data-field="accept-terms"');
    expect(fields).toContain("t('hudChrome.wocMarket.termsLabel')");
    // The bid form consumes the same helper rather than keeping its own copy.
    const bid = between('private bidFormHtml(', 'private confirmFieldsHtml(');
    expect(bid).toContain('this.confirmFieldsHtml(model)');
    expect(bid).not.toContain('data-field="accept-terms"');
    // Exactly one RENDER site, so no path can emit a duplicate.
    expect(painter.match(/(?<!\[)data-field="accept-terms"(?!\])/g) ?? []).toHaveLength(1);
  });

  it('sends the terms flag from both paying paths', () => {
    const buy = between('private async buyNow(', 'private async cancelListing(');
    expect(buy).toContain('acceptTerms: this.acceptTermsChecked()');
    const bid = between('private async placeBid(', 'private async buyNow(');
    expect(bid).toContain('acceptTerms: this.acceptTermsChecked()');
  });

  it('carries no two-factor field: 2FA is off the Exchange paying side', () => {
    // Removed deliberately, not lost. Both paying actions already require the
    // buyer's own wallet signature, which a stolen session token does not carry, so
    // the gate sat in front of an action that already had a stronger second factor.
    // The account's LOGIN 2FA is untouched and lives in server/account.ts.
    expect(painter.toLowerCase()).not.toContain('totp');
  });
});

describe('woc_market_window: the two ways to take a listing are separate actions', () => {
  const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');

  it('gives Buy now its own full-width row, clear of Place Bid', () => {
    // They are independent decisions, not a submit pair: flush against each other
    // they read as one control group and invite a misclick that spends money.
    const rule = css.slice(
      css.indexOf('#woc-market-window .wm-detail button[data-action="buy-now"]'),
      css.indexOf('button[data-action="cancel-listing"]'),
    );
    expect(rule, 'no buy-now rule in components.css').not.toEqual('');
    expect(rule).toContain('width: 100%');
    expect(rule).toContain('display: block');
    expect(rule).toMatch(/margin-top:\s*\d+px/);
  });

  it('keeps buy-now AFTER the window-wide button rule, so the width is not erased', () => {
    // The same specificity trap the tab rules hit: an attribute selector is
    // (1,1,1) and so is `button:not(.x-btn)`, so source order is what decides.
    expect(css.indexOf('#woc-market-window button:not(.x-btn) {')).toBeLessThan(
      css.indexOf('#woc-market-window .wm-detail button[data-action="buy-now"]'),
    );
  });
});

describe('woc_market_window: the listbox must stay in flow', () => {
  it('is NOT absolutely positioned, because an overflow ancestor clips it', () => {
    // .wm-body is overflow-y: auto. An absolute menu still had layout, so it
    // looked open and its options reported real rects, but it was clipped to a
    // two-pixel sliver and the pointer hit the window behind it: every option was
    // unclickable while appearing perfectly normal in a screenshot.
    const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
    const start = css.indexOf('#woc-market-window .wm-combo-list {');
    expect(start).toBeGreaterThan(0);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).not.toContain('position: absolute');
    expect(rule).not.toContain('z-index');
    // It scrolls itself rather than growing without bound.
    expect(rule).toContain('max-height');
    expect(rule).toContain('overflow-y: auto');
  });
});

describe('woc_market_window: "Not now" releases the listing lock', () => {
  // The dead end this closes: placing a bid creates a pending_bond row that
  // blocks every further bid on that listing, and "Not now" only dropped the
  // CLIENT's copy of the quote. The player was then refused with "Confirm or
  // abandon your pending bid on this listing first" and had no way to abandon
  // it, for the whole five-minute TTL.
  it('tells the server, rather than only forgetting the quote locally', () => {
    const cancel = between(
      'private async cancelPendingQuote()',
      'private async refreshPendingQuote',
    );
    expect(cancel, 'a bond quote must be abandoned server-side').toContain(
      'client.abandonBid(pending.bidId)',
    );
    // And the activity/detail views must re-read, or the window keeps showing
    // the bid it just withdrew.
    expect(cancel).toContain('this.reload()');
  });

  it('leaves a SETTLEMENT quote alone: that is a purchase, not a lock', () => {
    // The item is already the buyer's to pay for, Activity offers Pay now, and
    // the constraint is a deadline rather than a listing-wide lock. Abandoning
    // it here would throw away a purchase they still want.
    const cancel = between(
      'private async cancelPendingQuote()',
      'private async refreshPendingQuote',
    );
    expect(cancel).toContain("pending?.kind !== 'bond'");
  });

  it('routes the Not now button through that path, not a bare state clear', () => {
    const handler = between("case 'quote-cancel':", 'default:');
    expect(handler).toContain('this.cancelPendingQuote()');
    expect(handler, 'a bare local clear is what shipped the bug').not.toContain(
      'this.pendingQuote = null',
    );
  });
});

describe('woc_market_window: the bid $WOC preview', () => {
  it('quotes the SERVER for the typed price, never multiplying locally', () => {
    const pump = between('private pumpBidEstimate()', 'private onKeyDown');
    expect(pump).toContain('client.estimate(cents)');
    expect(pump).toContain('est?.amount?.tokens');
  });

  it('coalesces without a timer, which this cold window may not own', () => {
    // One request in flight at a time, chasing the latest value on completion.
    // A setTimeout debounce (what the p2p trade arm uses) is unavailable here:
    // the cold-window contract above scans this file for the token.
    const pump = between('private pumpBidEstimate()', 'private onKeyDown');
    expect(pump).toContain('this.bidEstimateInFlight');
    expect(pump, 'a stale reply must chase the newer value').toContain(
      'this.bidEstimateWanted !== cents',
    );
  });

  it('reuses the trade arm’s wording so the two surfaces read identically', () => {
    expect(painter).toContain("t('hudChrome.trade.woc.equivalent'");
  });

  it('shows nothing at all until the server has quoted a figure', () => {
    // An empty or cleared field must not keep displaying the rate for the number
    // that used to be there.
    expect(painter).toContain('this.bidEquivalentTokens === null');
  });
});

describe('woc_market_window: a price the wallet cannot cover', () => {
  // Mirrors the trade window's rule on the Exchange's two paying paths. Source
  // scans rather than a rendered check: the figures arrive from async estimates
  // held as window state, and what matters is that each gate reaches the shared
  // predicate and takes the button with it.
  it('gates the BID on the shared predicate, not a hand-rolled comparison', () => {
    const form = between('private bidFormHtml(', 'private confirmFieldsHtml');
    expect(form).toContain('overWalletBalance(this.bidEquivalentTokens, this.walletTokens())');
    expect(form, 'and the button actually goes dead').toContain('|| overBid ?');
    expect(form, 'with the figure carrying it too').toContain("' over-balance'");
    expect(form, 'and never colour alone').toContain(
      "t('hudChrome.trade.woc.hintInsufficientBalance')",
    );
  });

  it('gates BUY NOW on its own quote, since the detail estimate prices the bid', () => {
    // listingDetail estimates currentBidCents ?? startCents, which is not the
    // buy-now price: reusing it would compare the wrong number.
    expect(painter).toContain('overWalletBalance(this.buyNowTokens, this.walletTokens())');
    expect(painter).toContain('|| overBuyNow ?');
  });

  it('reads the VERIFIED balance, not a merely-connected wallet', () => {
    const reader = between('private walletTokens()', 'private busy =');
    expect(reader).toContain('verifiedWocBalance()');
  });

  it('clears the buy-now quote when the selected listing changes', () => {
    // A stale figure from the previous listing would gate this one.
    const select = between('this.selectedId = id;', 'private usd(');
    expect(select).toContain('this.buyNowTokens = null');
  });
});

describe('woc_market_window: the quote countdown actually moves', () => {
  // What shipped: "Quote expires in x seconds" rendered once and then sat
  // frozen while the quote ran out underneath the player. The window is cold
  // and repaints only when its digest changes; the pending quote is WINDOW
  // state, so the pure model's digest could never move for it.
  it('folds the quote countdown into the repaint signature', () => {
    const refresh = between('refreshIfChanged(): void {', 'private quoteCountdownSig');
    expect(refresh, 'the model digest alone cannot see a pending quote').toContain(
      'this.quoteCountdownSig()',
    );
  });

  it('latches the SAME composite it compares', () => {
    // Latching only the model half leaves the two permanently unequal, so every
    // poll rebuilds the window and takes the caret and hover card with it.
    const render = between('this.lastModel = model;', 'this.rendering = true');
    expect(render).toContain('this.quoteCountdownSig()');
  });

  it('keys on SECONDS, matching the resolution the countdown is displayed at', () => {
    // A finer key would rebuild many times per second for an unchanged string.
    const sig = between('private quoteCountdownSig()', '/** Language fan-out arm');
    expect(sig).toContain('/ 1000');
    // And no pending quote means no key at all, so an idle window still rests.
    expect(sig).toContain("return ''");
  });
});

describe('woc_market_window: bidding pays its own bond', () => {
  // The bond is not a second decision: it is what placing a bid COSTS. Stopping
  // to ask again left the player holding a listing lock they had not realised
  // they had taken, and the listing refusing their next bid because of it.
  it('goes straight into the wallet once the bid is quoted', () => {
    const bid = between('private async placeBid(', 'private async buyNow(');
    expect(bid).toContain('this.signPendingQuote()');
  });

  it('signs OUTSIDE the busy wrapper, which refuses to re-enter', () => {
    // withBusy returns early while busy, so a nested call would be swallowed and
    // the player would be left on the quote panel after all: the exact bug this
    // change exists to remove.
    const bid = between('private async placeBid(', 'private async buyNow(');
    // The withBusy CALLBACK's close, at method-body indentation. Matching a bare
    // '});' finds the placeBid request object's close first, which sits INSIDE
    // the callback: an earlier version of this test did exactly that and passed
    // with the sign call nested, proving nothing.
    const closeBusy = bid.indexOf('\n    });');
    expect(closeBusy, 'the withBusy block must close').toBeGreaterThan(0);
    expect(
      bid.indexOf('this.signPendingQuote()'),
      'the sign call must come after it',
    ).toBeGreaterThan(closeBusy);
  });

  it('does not sign when the bid was REFUSED', () => {
    // A refusal has no quote to pay, and reaching for the wallet then would ask
    // a player to fund a bid that does not exist.
    const bid = between('private async placeBid(', 'private async buyNow(');
    expect(bid).toContain('if (quoted) await this.signPendingQuote()');
  });

  it('leaves BUY NOW asking, because a settlement is not a lock', () => {
    // It carries a deadline and a documented pay-later route from Activity,
    // rather than blocking anyone else's action while it stands.
    const buy = between('private async buyNow(', 'private async cancelListing(');
    expect(buy).not.toContain('this.signPendingQuote()');
  });
});

describe('woc_market_window: the Sell form offers only what the format permits', () => {
  // What shipped: every field rendered regardless of the chosen format, so an
  // auction showed a Buy Now price box and a buy-now showed a Reserve box. The
  // server refuses ONE of those combinations (bad_reserve), so a seller could
  // fill it in and only learn it was impossible after pressing Submit.
  //
  // The auction case is no longer a contradiction: a buy-now on an auction is
  // the combined format, and submitListing maps it. So the asymmetry below is
  // the point. An auction offers BOTH fields; a pure buy-now still offers only
  // its price, because a reserve describes nothing on a listing with no bidding.
  it('gates the reserve field on the selected format, and offers the auction both', () => {
    const form = between('const form = selected', 'private activityHtml(');
    expect(form, 'the reserve must be on the auction arm alone').toContain(
      "this.sellFormat === 'auction'",
    );
    const auctionArm = form.slice(
      form.indexOf("this.sellFormat === 'auction'"),
      form.indexOf('sellDuration'),
    );
    const [ifTrue, ifFalse] = auctionArm.split(': `<label>');
    expect(ifTrue, 'an auction gets the reserve').toContain('sell-reserve');
    expect(ifTrue, 'and the optional buy-now that makes it a combined listing').toContain(
      'sell-buy-now',
    );
    expect(ifFalse, 'a pure buy-now gets its price').toContain('sell-buy-now');
    expect(ifFalse, 'and never a reserve').not.toContain('sell-reserve');
  });

  it('re-renders when the format changes, or the gate never moves', () => {
    const handler = between("if (field === 'sell-format')", "if (field === 'sell-duration')");
    expect(handler).toContain('this.sellFormat = value');
    expect(handler).toContain('this.render()');
  });

  it('reads an absent field as null, which is what the other format requires', () => {
    // The whole gate rests on this: a hidden buy-now box must submit null, not
    // zero or NaN, or an auction would carry the very field it forbids.
    const read = between('private numberFieldCents(', '/** Typing in the combobox');
    expect(read).toContain('if (!el || el.value.trim()');
    expect(read).toContain('return null');
  });
});

describe('woc_market_window: a bond awaiting the chain cannot be paid twice', () => {
  // What shipped: the Pay Bond button was rendered for every pending_bond bid and
  // disabled only on `this.busy`. busy covers a call in flight and clears the
  // moment the server accepts the signature, but the bid legitimately stays
  // pending_bond until the chain confirms. In that gap the button came back,
  // enabled, on a bond that was already paid, and pressing it sent a second
  // payment for the same bond.
  const bids = between('const bids = a.bids', 'const settlements = a.settlements');

  it('renders progress INSTEAD of the pay control while confirming', () => {
    // The two arms must be mutually exclusive. A test that only checked the
    // spinner appears would pass on markup that showed both.
    const confirmingArm = bids.slice(
      bids.indexOf('b.bondConfirming'),
      bids.indexOf('data-action="pay-bond"'),
    );
    expect(confirmingArm).toContain('wm-inline-busy');
    expect(confirmingArm, 'no pay control on the confirming arm').not.toContain('pay-bond');
    // And the button is what the NOT-confirming arm renders.
    expect(bids).toContain('data-action="pay-bond"');
    expect(bids.indexOf('b.bondConfirming')).toBeLessThan(bids.indexOf('data-action="pay-bond"'));
  });

  it('still gates the pay control on busy, which confirming does not replace', () => {
    // The two guards answer different questions (a call in flight vs a chain
    // awaiting), so keeping both is the point; dropping busy would re-open the
    // double-submit window this fix is about, one layer down.
    expect(bids).toContain("this.busy ? 'disabled' : ''");
  });

  it('shows nothing at all for a bid that is not pending a bond', () => {
    expect(bids).toContain("b.status !== 'pending_bond'");
  });

  it('announces the wait to a screen reader, not by colour or motion alone', () => {
    expect(bids).toContain('role="status"');
  });
});

describe('woc_market_window: the open window re-asks the server on its own cadence', () => {
  it('polls from the slow-band entry point, not from a driver of its own', () => {
    // The no-self-driver contract is pinned separately (and above); this pins
    // that the poll rides the existing HUD band instead of working around it.
    const refresh = between('refreshIfChanged(): void {', 'private pollFromServer');
    expect(refresh).toContain('this.pollFromServer()');
  });

  it('decides cadence through the pure core rather than a local timer', () => {
    const poll = between('private pollFromServer(): void {', 'The pending quote');
    expect(poll).toContain('shouldPollWocMarket');
    expect(poll).toContain('anyBondAwaitingChain');
  });

  it('never polls underneath a user action in flight', () => {
    // A refetch mid-withBusy would swap the state that action's own completion
    // is about to write.
    const poll = between('private pollFromServer(): void {', 'The pending quote');
    expect(poll).toContain('if (this.busy) return;');
  });

  it('clears the in-flight latch even when the request fails', () => {
    // Left set, the latch would wedge polling off for the rest of the session,
    // which is the exact failure the poll exists to prevent.
    const poll = between('private pollFromServer(): void {', 'The pending quote');
    expect(poll).toContain('.finally(');
    expect(poll).toContain('this.pollInFlight = false');
  });

  it('fetches SILENTLY, so a background blip neither flashes nor erases the list', () => {
    // browseLoading is in the view digest and browseFailed REPLACES the whole
    // list with an error, so reusing the foreground path would have made the
    // window flicker every poll and blank itself on one dropped request.
    const poll = between('private pollFromServer(): void {', 'The pending quote');
    expect(poll).toContain('this.loadBrowse(seq, true)');
    const load = between('private async loadBrowse(', 'private async loadActivity(');
    expect(load).toContain('if (!silent) this.browseLoading = true');
    expect(load).toContain('if (!silent) this.browseFailed = true');
  });

  it('does not repaint by itself: the digest compare stays the one render path', () => {
    const poll = between('private pollFromServer(): void {', 'The pending quote');
    expect(poll, 'the poll mutates state only').not.toContain('this.render()');
  });
});
