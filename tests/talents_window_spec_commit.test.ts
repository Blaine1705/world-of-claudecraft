// @vitest-environment jsdom
//
// Spec-commit behavior of the talents window (the fix for the nine talents-2.0
// classes whose spec choice only ever STAGED and never committed):
//   - For every class EXCEPT the overhauled 'warrior' (warrior_classic IS one of
//     the nine), an UNCOMMITTED spec panel's button reads the selectSpec label and
//     clicking it COMMITS through deps.commitSpec (Hud wires it to IWorld.setSpec)
//     before staging + jumping to the Choices tab.
//   - The ALREADY-COMMITTED spec keeps the navigation-only viewTalents button.
//   - The warrior keeps viewTalents on every panel and never calls commitSpec.
//   - The online wire: ClientWorld.setSpec sends the existing setSpec command.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The procedural icon compositor draws on a 2D canvas, which jsdom does not ship
// (no `canvas` package in this repo). The window only ever embeds the returned URL
// string, so a stub URL keeps the paint path real while skipping the raster work.
// talent_icons' talentIconDataUrl wraps this same import, so the rows tab is
// covered by the one mock too.
vi.mock('../src/ui/icons', () => ({
  iconDataUrl: () => 'data:,icon-stub',
}));

import { ClientWorld } from '../src/net/online';
import type { SavedLoadout, TalentAllocation } from '../src/sim/content/talents';
import { talentsFor } from '../src/sim/content/talents';
import { ALL_CLASSES, type PlayerClass } from '../src/sim/types';
import { t } from '../src/ui/i18n';
import { TalentsWindow, type TalentsWindowDeps } from '../src/ui/talents_window';

// The nine talents-2.0 classes: every class except the overhauled 'warrior'.
const NINE_CLASSIC_STYLE = ALL_CLASSES.filter((c) => c !== 'warrior');

interface Harness {
  win: TalentsWindow;
  root: HTMLElement;
  commits: string[];
}

function makeHarness(cls: PlayerClass, committedSpec: string | null): Harness {
  const root = document.createElement('div');
  document.body.appendChild(root);
  let stage: TalentAllocation | null = null;
  const commits: string[] = [];
  const deps: TalentsWindowDeps = {
    itemIcon: () => '',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: () => {},
    root: () => root,
    hideTooltip: () => {},
    captureFocus: () => null,
    restoreFocus: () => {},
    getStage: () => stage,
    setStage: (s) => {
      stage = s;
    },
    playerClass: () => cls,
    totalPoints: () => 6,
    currentAllocation: () => ({ spec: committedSpec, rows: {} }),
    activeLoadout: () => -1,
    loadouts: (): readonly SavedLoadout[] => [],
    abilityTooltip: () => null,
    rowPicks: () => [],
    playerLevel: () => 60,
    pickRow: () => {},
    commitSpec: (specId) => {
      commits.push(specId);
    },
    currentBar: () => [],
    saveLoadout: () => {},
    switchLoadout: () => {},
    deleteLoadout: () => {},
    applyLoadoutBar: () => {},
    inputDialog: () => {},
    confirmDialog: () => {},
    showError: () => {},
  };
  return { win: new TalentsWindow(deps), root, commits };
}

function panelButtons(root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('.ts-view-talents'));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('spec commit: the nine talents-2.0 classes', () => {
  it('covers exactly the nine classes (every class except warrior; warrior_classic included)', () => {
    expect(NINE_CLASSIC_STYLE).toHaveLength(9);
    expect(NINE_CLASSIC_STYLE).toContain('warrior_classic');
    expect(NINE_CLASSIC_STYLE).not.toContain('warrior');
    for (const cls of NINE_CLASSIC_STYLE) {
      expect(talentsFor(cls), `${cls} must have authored specs`).not.toBeNull();
    }
  });

  for (const cls of NINE_CLASSIC_STYLE) {
    it(`${cls}: uncommitted specs render the selectSpec label and the click commits that spec`, () => {
      const { win, root, commits } = makeHarness(cls, null);
      win.open();
      const specs = talentsFor(cls)?.specs ?? [];
      const buttons = panelButtons(root);
      expect(buttons.length).toBe(specs.length);
      expect(buttons.length).toBeGreaterThan(0);
      for (const btn of buttons) {
        expect(btn.textContent).toBe(t('hudChrome.specPanel.selectSpec'));
      }
      buttons[0].click();
      expect(commits).toEqual([specs[0].id]);
      // The click still stages + jumps to the Choices tab, exactly as before.
      const rowsTab = root.querySelector('.tal-tab[data-tab="rows"]');
      expect(rowsTab?.classList.contains('active')).toBe(true);
    });
  }

  it('the already-committed spec keeps the navigation-only View talents button', () => {
    const specs = talentsFor('mage')?.specs ?? [];
    expect(specs.length).toBeGreaterThan(1);
    const committedId = specs[0].id;
    const { win, root, commits } = makeHarness('mage', committedId);
    win.open();
    const buttons = panelButtons(root);
    expect(buttons[0].textContent).toBe(t('hudChrome.specPanel.viewTalents'));
    for (const btn of buttons.slice(1)) {
      expect(btn.textContent).toBe(t('hudChrome.specPanel.selectSpec'));
    }
    buttons[0].click();
    // Navigation only: no commit fires for the spec that is already committed.
    expect(commits).toEqual([]);
    const rowsTab = root.querySelector('.tal-tab[data-tab="rows"]');
    expect(rowsTab?.classList.contains('active')).toBe(true);
  });
});

describe('spec commit: the overhauled warrior keeps its existing flow', () => {
  it('renders View talents on every panel and never calls commitSpec', () => {
    const { win, root, commits } = makeHarness('warrior', null);
    win.open();
    const specs = talentsFor('warrior')?.specs ?? [];
    const buttons = panelButtons(root);
    expect(buttons.length).toBe(specs.length);
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.textContent).toBe(t('hudChrome.specPanel.viewTalents'));
    }
    buttons[0].click();
    expect(commits).toEqual([]);
    // Navigation still works: the click stages + jumps to the Choices tab.
    const rowsTab = root.querySelector('.tal-tab[data-tab="rows"]');
    expect(rowsTab?.classList.contains('active')).toBe(true);
  });
});

// Build a ClientWorld without opening a socket (mirrors quest_link_wire.test.ts's
// bareClient): the online half of the commit path is a pure command send that the
// server re-validates (server/game.ts 'setSpec' -> Sim.setSpec).
function bareClient(): { world: ClientWorld; sent: Record<string, unknown>[] } {
  const world = Object.create(ClientWorld.prototype) as ClientWorld;
  const sent: Record<string, unknown>[] = [];
  const bag = world as unknown as Record<string, unknown>;
  bag.connected = true;
  bag.ws = { readyState: 1, send: (s: string) => sent.push(JSON.parse(s)) };
  return { world, sent };
}

describe('ClientWorld.setSpec online wire', () => {
  it('sends the existing setSpec command with the spec id', () => {
    const { world, sent } = bareClient();
    world.setSpec('frost');
    expect(sent).toEqual([{ t: 'cmd', cmd: 'setSpec', spec: 'frost' }]);
  });

  it('sends spec: null for a spec clear', () => {
    const { world, sent } = bareClient();
    world.setSpec(null);
    expect(sent).toEqual([{ t: 'cmd', cmd: 'setSpec', spec: null }]);
  });
});
