import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

  it('performs no forced-reflow layout read', () => {
    // The layout-thrash killers the perf gate scans painters for; a cold
    // window holds this contract whatever its poll cadence.
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
      'scrollTop',
      'scrollLeft',
      'scrollWidth',
      'scrollHeight',
      'scrollIntoView',
    ]) {
      expect(painter.includes(token), `forced-reflow read: ${token}`).toBe(false);
    }
    // getComputedStyle is called BARE in this tree, never as a member, so the
    // scan matches the bare call form only.
    expect(painter).not.toMatch(/(?<![.\w])getComputedStyle\s*\(/);
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
    // AT the real count (11), not "> 0", which one surviving attribute
    // satisfied. A floor rather than an exact count so adding a labelled
    // control does not red the suite, while deleting ten still does.
    expect(segments.length).toBeGreaterThanOrEqual(11);
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
      expect.arrayContaining([
        'wm-reserve-met',
        'wm-reserve-not_met',
        'wm-row-selected',
        'wm-sell-selected',
      ]),
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

  it('tags every one of the four item surfaces with a namespaced, stable key', () => {
    // Namespaced so the same item on two tabs cannot collide, and carrying the
    // row's own id so the hover target survives a poll rebuild.
    for (const key of [
      '`browse:${r.id}`',
      '`detail:${d.row.id}`',
      '`sell:${r.index}`',
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
