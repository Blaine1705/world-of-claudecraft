// @vitest-environment happy-dom

// Behavioral pin for Hud.updateReliquaryTracker(), the one seam between the
// live world and the always-on #reliquary-tracker strip. The pure core is
// covered in tests/reliquary_tracker_view.test.ts and the painter's DOM
// contract in tests/reliquary_tracker_painter.test.ts, which left the method
// that FEEDS them both unpinned end to end: nothing said the persisted collapse
// setting reaches the view, nothing said the compact-touch chip flag needs BOTH
// body classes, and nothing said a pinned page really travels from the window's
// store into a tracker line.
//
// The rig is the reliquary_unlock_chat_link.test.ts one: Object.create over the
// real Hud.prototype with only the fields this method touches assigned onto the
// instance, so the assertions run the shipped code rather than a copy of it.
// The tracker view is the REAL reused container (makeReliquaryTrackerView), the
// container-reuse contract being what makes the immediate-assert style below
// necessary: the painter is handed the same object every build, so a captured
// reference is never a snapshot.

import { beforeEach, describe, expect, it } from 'vitest';
import { RELIQUARY_PAGES_BY_ID } from '../src/sim/content/reliquary';
import { Hud } from '../src/ui/hud';
import { reliquaryPageName } from '../src/ui/reliquary_i18n';
import {
  makeReliquaryTrackerView,
  type ReliquaryTrackerView,
} from '../src/ui/reliquary_tracker_view';
import type { ReliquaryPageCompletion } from '../src/world_api/reliquary';

// A LIVE catalog page, so the pin travels the same road a player's pin does.
const PINNED_PAGE = 'conquerors_gravewyrm_sanctum';
// Deliberately not this page's real relic count: the assertion below proves the
// numbers came from the stubbed completion read, not from the content table.
const OWNED = 3;
const TOTAL = 7;

interface TrackerHarness {
  sim: {
    reliquaryPageCompletion(pageId: string): ReliquaryPageCompletion | null;
    deedStats: { itemsDiscovered: Set<string> };
    reliquaryMarks: Set<string>;
    deedsEarned: Set<string>;
    ownedMounts(): string[];
    accountCosmetics: { weaponSkinIds: string[] };
  };
  optionsHooks: {
    settings: { get(key: string): unknown; set(key: string, value: unknown): void };
  };
  reliquaryWindow: { pinned: Set<string> };
  reliquaryTrackerView: ReliquaryTrackerView;
  reliquaryTrackerPainter: { update(view: ReliquaryTrackerView): void };
  updateReliquaryTracker(): void;
}

interface TrackerRig {
  hud: TrackerHarness;
  /** The settings bag the persisted collapse row is read out of. */
  settings: Record<string, unknown>;
  /** Every view the painter was handed, in call order (same container each time). */
  painted: ReliquaryTrackerView[];
}

function makeRig(): TrackerRig {
  const hud = Object.create(Hud.prototype) as unknown as TrackerHarness;
  const settings: Record<string, unknown> = {};
  const painted: ReliquaryTrackerView[] = [];
  hud.optionsHooks = {
    settings: {
      get: (key) => settings[key],
      set: (key, value) => {
        settings[key] = value;
      },
    },
  };
  hud.sim = {
    // Only the pinned page has progress: every other catalog page reads as
    // absent, so the nothing-pinned default scan finds nothing and cannot
    // quietly supply the line a pin assertion is looking for.
    reliquaryPageCompletion: (pageId) =>
      pageId === PINNED_PAGE ? { owned: OWNED, total: TOTAL, complete: false } : null,
    deedStats: { itemsDiscovered: new Set<string>() },
    reliquaryMarks: new Set<string>(),
    deedsEarned: new Set<string>(),
    ownedMounts: () => [],
    accountCosmetics: { weaponSkinIds: [] },
  };
  hud.reliquaryWindow = { pinned: new Set<string>() };
  hud.reliquaryTrackerView = makeReliquaryTrackerView();
  hud.reliquaryTrackerPainter = {
    update: (view) => {
      painted.push(view);
    },
  };
  return { hud, settings, painted };
}

beforeEach(() => {
  document.body.className = '';
  // Content premise: a page rename would leave every pin assertion below
  // passing over a page the player can never actually pin.
  if (!RELIQUARY_PAGES_BY_ID[PINNED_PAGE]) {
    throw new Error(`content premise: ${PINNED_PAGE} is a live Reliquary page`);
  }
});

describe('Hud.updateReliquaryTracker: the persisted collapse', () => {
  it('carries the reliquaryTrackerCollapsed setting into the painted view, both ways', () => {
    // Both arms are driven: a method that hardcoded either value would pass a
    // single-arm test, and the collapsed arm is the one the painter uses to
    // skip the whole row loop.
    const { hud, settings, painted } = makeRig();
    hud.reliquaryWindow.pinned.add(PINNED_PAGE);

    settings.reliquaryTrackerCollapsed = true;
    hud.updateReliquaryTracker();
    expect(painted).toHaveLength(1);
    expect(painted[0].collapsed).toBe(true);

    settings.reliquaryTrackerCollapsed = false;
    hud.updateReliquaryTracker();
    expect(painted[1].collapsed).toBe(false);

    // The reuse contract, and the reason each assertion above sits directly
    // after its own call: the painter is handed ONE container for the session.
    expect(painted[1]).toBe(painted[0]);
    expect(painted[0]).toBe(hud.reliquaryTrackerView);
  });

  it('falls back to expanded when no setting has ever been stored', () => {
    const { hud, painted } = makeRig();
    hud.reliquaryWindow.pinned.add(PINNED_PAGE);
    hud.updateReliquaryTracker();
    expect(painted[0].collapsed).toBe(false);
  });
});

describe('Hud.updateReliquaryTracker: the compact-touch chip flag', () => {
  // All four combinations, because the flag is an AND and either half alone is
  // a real HUD state: a landscape phone carries mobile-touch without the
  // compact tier, and the compact class is set from viewport size alone.
  const CASES: { classes: string[]; chip: boolean }[] = [
    { classes: [], chip: false },
    { classes: ['mobile-touch'], chip: false },
    { classes: ['hud-mobile-compact'], chip: false },
    { classes: ['mobile-touch', 'hud-mobile-compact'], chip: true },
  ];

  for (const { classes, chip } of CASES) {
    const label = classes.length > 0 ? classes.join(' plus ') : 'neither class';
    it(`sets chip ${String(chip)} with ${label} on the body`, () => {
      const { hud, painted } = makeRig();
      hud.reliquaryWindow.pinned.add(PINNED_PAGE);
      for (const cls of classes) document.body.classList.add(cls);
      hud.updateReliquaryTracker();
      expect(painted[0].chip).toBe(chip);
    });
  }

  it('re-reads the body on every build, so leaving the compact tier drops the chip', () => {
    // The flag is not latched anywhere: a rotation or a resize has to be able
    // to hand the header its disclosure role back on the very next slow band.
    const { hud, painted } = makeRig();
    hud.reliquaryWindow.pinned.add(PINNED_PAGE);
    document.body.classList.add('mobile-touch', 'hud-mobile-compact');
    hud.updateReliquaryTracker();
    expect(painted[0].chip).toBe(true);
    document.body.classList.remove('hud-mobile-compact');
    hud.updateReliquaryTracker();
    expect(painted[1].chip).toBe(false);
  });
});

describe('Hud.updateReliquaryTracker: the window pin store', () => {
  it('puts a page pinned in the Reliquary window onto the strip with its live progress', () => {
    const { hud, painted } = makeRig();
    hud.reliquaryWindow.pinned.add(PINNED_PAGE);
    hud.updateReliquaryTracker();

    const view = painted[0];
    expect(view.visible).toBe(true);
    expect(view.count).toBe(1);
    expect(view.lines[0].pageId).toBe(PINNED_PAGE);
    // The numbers are the stubbed completion read's, not the catalog's, so the
    // pin proves the completion callback is wired rather than merely present.
    expect(view.lines[0].owned).toBe(OWNED);
    expect(view.lines[0].total).toBe(TOTAL);
    // And the id the painter will label with really resolves through the
    // reliquary_i18n channel instead of falling back to the raw id.
    expect(reliquaryPageName(view.lines[0].pageId)).not.toBe(PINNED_PAGE);
  });

  it('shows nothing at all while the store is empty (no default page qualifies)', () => {
    // The negative half: without it the pin assertion above could be satisfied
    // by a strip that shows this page whether or not anyone pinned it.
    const { hud, painted } = makeRig();
    hud.updateReliquaryTracker();
    expect(painted[0].count).toBe(0);
    expect(painted[0].visible).toBe(false);
  });
});
