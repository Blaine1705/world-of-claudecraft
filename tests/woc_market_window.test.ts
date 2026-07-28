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
    for (const token of ['getBoundingClientRect', 'offsetWidth', 'offsetHeight', 'scrollTop']) {
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
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(segment.startsWith('${esc(')).toBe(true);
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
