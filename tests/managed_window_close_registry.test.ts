// The managed-window close registry (#2517).
//
// `Hud.closeAll()` reaches a window through `topmostOpenWindow()`, whose whole vocabulary is
// the CSS selector `.window.panel`. Whatever it finds goes to `closeManagedWindow`, which
// switches on `el.id`; anything with no `case` falls to `default:`, a bare
// `el.style.display = 'none'` plus `hideTooltip()`. So membership in that selector is what
// enrols a window, and a `case` is what gives it a real teardown. Nothing connected the two:
// `#lockpick-panel` sat on the default arm for its whole life, leaking a 100ms countdown and
// a focus trap on every Escape and every gamepad escape, and no test could notice.
//
// This is the connection. Every id in the family is classified exactly once, and a new
// `.window.panel` in the markup fails the suite until its author says which bucket it is in.
// The point is not the ids; it is that "needs no teardown" becomes a claim someone WROTE
// rather than the silent default of having forgotten.
//
// The case list is read with the TypeScript compiler API rather than a regex over the source
// text. `src/ui/hud.ts` carries about a hundred regex literals in its server-text matchers,
// several holding apostrophes and escaped slashes, and a hand-rolled scan over it has already
// been wrong twice invisibly (see tests/helpers/method_call_sites.ts). A `case '...'` inside
// one of the file's other switches, or inside a comment or a string, must not count.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const hudTs = readFileSync(`${root}src/ui/hud.ts`, 'utf8');
const indexHtml = readFileSync(`${root}index.html`, 'utf8');
const playHtml = readFileSync(`${root}play.html`, 'utf8');

/**
 * `.window.panel` ids that are built in code instead of shipped in the markup, so
 * `topmostOpenWindow()` still selects them but no HTML entry lists them. Value = the module
 * that creates the element. An unlisted fourth creation site fails the count pin below.
 */
const CODE_BUILT: Record<string, string> = {
  'confirm-dialog': 'src/ui/hud.ts (confirmDialog + inputDialog share the one id)',
  'profession-tutorial': 'src/ui/profession_tutorial_window.ts',
  'dev-command-window': 'src/ui/dev_command_window.ts',
};

/**
 * Ids an EARLIER arm of `closeAll()` claims before the `topmostOpenWindow()` scan ever runs,
 * so `closeManagedWindow` is unreachable for them and a `case` would be dead code. Each is
 * checked below to really precede the scan in the source.
 */
const CLOSED_BEFORE_THE_SCAN: Record<string, string> = {
  'delve-rite-panel':
    "closeAll's `$('#delve-rite-panel').style.display === 'block'` arm routes it to " +
    'closeRitePanel -> RiteController.close(), which releases its focus trap.',
};

/**
 * Ids deliberately left on the `default:` arm: their own close affordance is the same bare
 * hide, and they own no trap, no timer, and no state the next open does not re-seed. This is
 * the "recorded as not needing one" half of the contract, and each entry is a claim its
 * author checked, not a leftover.
 */
const NO_MANAGED_TEARDOWN: Record<string, string> = {
  'map-window':
    "#map-close's own handler is the identical hide + hideTooltip, and closeManagedWindow " +
    'adds the same syncAnyWindowOpenState. No trap, no timer: updateMapWindow is driven by ' +
    "Hud.update()'s mediumHud band behind a display === 'block' gate, so the hide stops it, " +
    'and the mapPing / mapZoneOverride the toggle clears are re-seeded by the next open.',
  'report-window':
    "Its X and Cancel buttons are literally `el.style.display = 'none'`. No trap, no timer; " +
    'the panel is rebuilt by innerHTML on every open, so an in-flight submit that resolves ' +
    'against the hidden window cannot survive into the next one.',
};

/** The `case '<id>':` labels of the switch inside `Hud.closeManagedWindow`. */
function readCloseManagedWindowCases(source: string): string[] {
  const file = ts.createSourceFile('hud.ts', source, ts.ScriptTarget.Latest, true);
  let method: ts.MethodDeclaration | null = null;
  const findMethod = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.name.getText() === 'closeManagedWindow') method = node;
    else ts.forEachChild(node, findMethod);
  };
  ts.forEachChild(file, findMethod);
  if (!method) throw new Error('closeManagedWindow not found in the source');
  // The switch this method OWNS, not one nested inside a callback it happens to contain.
  let block: ts.CaseBlock | null = null;
  const findSwitch = (node: ts.Node): void => {
    if (block) return;
    if (ts.isSwitchStatement(node)) {
      block = node.caseBlock;
      return;
    }
    ts.forEachChild(node, findSwitch);
  };
  ts.forEachChild((method as ts.MethodDeclaration).body as ts.Block, findSwitch);
  if (!block) throw new Error('closeManagedWindow has no switch statement');
  return (block as ts.CaseBlock).clauses
    .filter(ts.isCaseClause)
    .map((clause) => (ts.isStringLiteral(clause.expression) ? clause.expression.text : ''))
    .filter((id) => id !== '');
}

/** Every `id` carrying BOTH the `window` and `panel` classes, in markup order. */
function readPanelIds(html: string): string[] {
  const ids: string[] = [];
  for (const tag of html.match(/<div\b[^>]*>/g) ?? []) {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];
    const cls = tag.match(/\bclass="([^"]+)"/)?.[1];
    if (!id || !cls) continue;
    const classes = cls.split(/\s+/);
    if (classes.includes('window') && classes.includes('panel')) ids.push(id);
  }
  return ids;
}

const caseIds = readCloseManagedWindowCases(hudTs);
const markupIds = readPanelIds(indexHtml);

describe('closeManagedWindow case registry', () => {
  it('reads the real switch, not a `case` label from anywhere else in the file', () => {
    // Without this the walk could be silently returning [] (or the cases of some other
    // switch) and every diff below would pass by agreeing on nothing.
    expect(caseIds).toContain('confirm-dialog');
    expect(caseIds).toContain('lockpick-panel');
    expect(caseIds.length).toBeGreaterThan(30);
    expect(new Set(caseIds).size, 'no duplicate case labels').toBe(caseIds.length);

    // A synthetic source with the same shapes the real file has: a decoy case in another
    // method, one in a nested callback switch, and one inside a string and a comment.
    const planted = readCloseManagedWindowCases(`
      class Hud {
        private other(el: HTMLElement): void {
          switch (el.id) {
            case 'decoy-other-method':
              break;
          }
        }
        private closeManagedWindow(el: HTMLElement): void {
          // case 'decoy-comment':
          const s = "case 'decoy-string':";
          switch (el.id) {
            case 'real-one':
              this.a();
              break;
            case 'real-two': {
              el.addEventListener('x', () => {
                switch (s) {
                  case 'decoy-nested':
                    break;
                }
              });
              break;
            }
            default:
              break;
          }
        }
      }
    `);
    expect(planted).toEqual(['real-one', 'real-two']);
  });

  it('finds the same panel family in both game shells', () => {
    // index.html and play.html are two entries onto the one HUD; a window that exists in
    // only one of them is a window Escape closes differently depending on how you loaded
    // the game.
    expect(readPanelIds(playHtml).slice().sort()).toEqual(markupIds.slice().sort());
    expect(markupIds.length).toBeGreaterThan(30);
  });

  it('classifies every `.window .panel` exactly once', () => {
    const buckets = markupIds.map((id) => ({
      id,
      in: [
        caseIds.includes(id) ? 'case' : null,
        id in CLOSED_BEFORE_THE_SCAN ? 'closed-before-the-scan' : null,
        id in NO_MANAGED_TEARDOWN ? 'no-teardown' : null,
      ].filter(Boolean),
    }));
    // Named rather than counted, so the failure message says WHICH window is unclassified.
    expect(buckets.filter((b) => b.in.length === 0).map((b) => b.id)).toEqual([]);
    expect(
      buckets.filter((b) => b.in.length > 1).map((b) => `${b.id}: ${b.in.join(' + ')}`),
    ).toEqual([]);
  });

  it('keeps every case pointed at a window that still exists', () => {
    // The other direction: a renamed or deleted window leaves a case that can never fire,
    // and the next reader assumes the id is still covered.
    const known = new Set([...markupIds, ...Object.keys(CODE_BUILT)]);
    expect(caseIds.filter((id) => !known.has(id))).toEqual([]);
  });

  it('keeps every registry row pointed at a window that still exists', () => {
    const live = new Set(markupIds);
    const rows = { ...CLOSED_BEFORE_THE_SCAN, ...NO_MANAGED_TEARDOWN };
    expect(Object.keys(rows).filter((id) => !live.has(id))).toEqual([]);
    // A row is a claim someone made, so it has to say something. An empty or one-word
    // reason is the same silence the default arm already gives.
    for (const [id, reason] of Object.entries(rows)) {
      expect(reason.length, `${id} needs a real reason`).toBeGreaterThan(60);
    }
  });

  it('reaches the closed-before-the-scan windows from an arm that really does precede the scan', () => {
    // The whole justification for those rows is ORDER. If the early arm moved below the
    // topmost scan (or was deleted), they would silently fall to the default hide.
    const body = hudTs.slice(hudTs.indexOf('  closeAll(): boolean {'));
    const closeAll = body.slice(0, body.indexOf('\n  }'));
    const scanAt = closeAll.indexOf('this.topmostOpenWindow()');
    expect(scanAt).toBeGreaterThan(-1);
    for (const id of Object.keys(CLOSED_BEFORE_THE_SCAN)) {
      const armAt = closeAll.indexOf(`#${id}`);
      expect(armAt, `${id} has no arm in closeAll`).toBeGreaterThan(-1);
      expect(armAt, `${id}'s arm must run before the topmost scan`).toBeLessThan(scanAt);
    }
  });

  it('pins the three code-built panels so a fourth has to be classified', () => {
    // These carry no markup entry, so the markup sweep above cannot see them. An exact
    // count (not a floor) is what makes a new one a failure instead of a silent addition.
    const sites = [
      ...hudTs.matchAll(/className = 'window panel'/g),
      ...readFileSync(`${root}src/ui/profession_tutorial_window.ts`, 'utf8').matchAll(
        /className = 'window panel'/g,
      ),
      ...readFileSync(`${root}src/ui/dev_command_window.ts`, 'utf8').matchAll(
        /className = 'window panel[^']*'/g,
      ),
    ];
    expect(sites).toHaveLength(4); // two share #confirm-dialog
    for (const id of Object.keys(CODE_BUILT)) expect(caseIds).toContain(id);
  });

  it('routes #lockpick-panel through the controller, not a bare hide (#2517)', () => {
    // The regression this registry was written for. The behavioral proof lives in
    // tests/lockpick_managed_close.test.ts; this is the source-level half, so deleting the
    // case fails here even if someone also deletes that suite's harness.
    const start = hudTs.indexOf('private closeManagedWindow(');
    const switchBody = hudTs.slice(start, hudTs.indexOf('\n  private ', start + 1));
    const arm = switchBody.slice(switchBody.indexOf("case 'lockpick-panel':"));
    expect(arm.slice(0, arm.indexOf('break;'))).toContain(
      'this.lockpickController.requestClose();',
    );
  });
});
