// Unit test for the PR-screenshot diff classifier. classifyDiff is the whole "shoot only
// visual changes, and only the sections they touch" policy, kept pure so it needs no
// browser. The .mjs script has no TS/browser imports at module load, so vitest can import
// it directly.
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain Node ESM script, no types
import { classifyDiff, diffChangedPaths, resolveTargets } from '../scripts/pr_shot_targets.mjs';

describe('classifyDiff', () => {
  it('treats a backend/data-only diff as non-visual (captures nothing)', () => {
    const plan = classifyDiff(['server/game.ts', 'src/sim/spirit.ts', 'server/db.ts']);
    expect(plan.isVisual).toBe(false);
    expect(plan.specific).toHaveLength(0);
    expect(plan.generic).toHaveLength(0);
  });

  it('maps a bags change to the inventory window target', () => {
    const plan = classifyDiff(['src/ui/bags.ts']);
    expect(plan.isVisual).toBe(true);
    expect(plan.specific.map((t: { key: string }) => t.key)).toContain('inventory');
    // A specific window was found, so no generic HUD fallback.
    expect(plan.generic).toHaveLength(0);
  });

  it('maps the player tooltip view to its focused hover target', () => {
    const plan = classifyDiff(['src/ui/player_tooltip_view.ts']);
    expect(plan.isVisual).toBe(true);
    expect(plan.specific.map((t: { key: string }) => t.key)).toEqual(['player-tooltip']);
  });

  it('captures both the market overview and expanded armor filters for market window changes', () => {
    const plan = classifyDiff(['src/ui/market_window.ts']);
    expect(plan.isVisual).toBe(true);
    expect(plan.specific.map((t: { key: string }) => t.key)).toEqual([
      'market-window',
      'market-armor-filters',
    ]);
    expect(plan.specific[1].variants).toEqual([
      { key: 'desktop' },
      { key: 'mobile', mobile: true },
    ]);
  });

  it('captures expanded armor filters for every market-specific UI module', () => {
    for (const path of [
      'src/ui/market_window.ts',
      'src/ui/market_view.ts',
      'src/ui/market_filters.ts',
    ]) {
      const keys = classifyDiff([path]).specific.map((target: { key: string }) => target.key);
      expect(keys).toContain('market-armor-filters');
    }
  });

  it('maps the tank cooldown regression suite to its focused visual target', () => {
    const plan = classifyDiff(['tests/tank_defensive_cds.test.ts']);
    expect(plan.isVisual).toBe(true);
    expect(plan.specific.map((t: { key: string }) => t.key)).toEqual(['tank-defensive-cds']);
    // paladin-desktop, druid-desktop, paladin-mobile.
    expect(plan.specific[0].variants).toHaveLength(3);
  });

  it('maps a zone/terrain change to the world-map target', () => {
    const plan = classifyDiff(['src/render/terrain.ts']);
    expect(plan.specific.map((t: { key: string }) => t.key)).toContain('world-map');
  });

  it('falls back to the desktop HUD for a generic visual change', () => {
    const plan = classifyDiff(['src/render/renderer.ts']);
    expect(plan.isVisual).toBe(true);
    expect(plan.specific).toHaveLength(0);
    expect(plan.generic).toEqual(['hud-desktop']);
  });

  it('adds the mobile HUD when the visual change touches the mobile surface', () => {
    const plan = classifyDiff(['src/styles/hud.mobile.css']);
    expect(plan.generic).toEqual(['hud-desktop', 'hud-mobile']);
  });

  it('keeps the desktop HUD fallback for the shared component stylesheet', () => {
    const plan = classifyDiff(['src/styles/components.css']);
    expect(plan.specific).toHaveLength(0);
    expect(plan.generic).toEqual(['hud-desktop']);
  });

  it('does not treat an i18n text-table change as visual', () => {
    const plan = classifyDiff(['src/ui/i18n.catalog/hud_chrome.ts']);
    expect(plan.isVisual).toBe(false);
    expect(plan.generic).toHaveLength(0);
  });

  it('does not treat a UI test file as visual', () => {
    const plan = classifyDiff(['tests/social_view.test.ts', 'src/ui/social_view.test.ts']);
    expect(plan.isVisual).toBe(false);
  });

  it('prefers specific targets even when other generic-visual files also changed', () => {
    const plan = classifyDiff(['src/ui/bags.ts', 'src/render/renderer.ts']);
    expect(plan.specific.map((t: { key: string }) => t.key)).toContain('inventory');
    expect(plan.generic).toHaveLength(0);
  });

  it('resolveTargets stays available and returns registry-ordered matches', () => {
    const keys = resolveTargets(['src/ui/map_window.ts', 'src/ui/bags.ts']).map(
      (t: { key: string }) => t.key,
    );
    expect(keys).toEqual(['inventory', 'world-map']);
  });

  it('stages a complete profession identity for refresh-aware captures', () => {
    const target = resolveTargets(['src/ui/professions_window.ts']).find(
      (candidate: { key: string }) => candidate.key === 'professions',
    );
    expect(target?.capture.toString()).toContain('knownRecipes: []');
  });
});

describe('diffChangedPaths', () => {
  function section(header: string, minus: string, plus: string) {
    return `diff --git ${header}\n--- ${minus}\n+++ ${plus}\n@@ -1 +1 @@\n-x\n+y\n`;
  }

  it('collects modified, added, and deleted paths (both diff sides, no /dev/null)', () => {
    const diff =
      section('a/src/ui/hud.ts b/src/ui/hud.ts', 'a/src/ui/hud.ts', 'b/src/ui/hud.ts') +
      section('a/src/render/new.ts b/src/render/new.ts', '/dev/null', 'b/src/render/new.ts') +
      section(
        'a/src/styles/hud.mobile.css b/src/styles/hud.mobile.css',
        'a/src/styles/hud.mobile.css',
        '/dev/null',
      );
    expect(diffChangedPaths(diff).sort()).toEqual([
      'src/render/new.ts',
      'src/styles/hud.mobile.css',
      'src/ui/hud.ts',
    ]);
  });

  it('a DELETED visual file still classifies as a visual change', () => {
    // src/game/mobile_controls.ts is visual (VISUAL_PREFIXES) and mobile (isMobilePath)
    // but maps to no specific window target's `when` list, so this stays a pure
    // generic-fallback probe.
    const diff = section(
      'a/src/game/mobile_controls.ts b/src/game/mobile_controls.ts',
      'a/src/game/mobile_controls.ts',
      '/dev/null',
    );
    const plan = classifyDiff(diffChangedPaths(diff));
    expect(plan.isVisual).toBe(true);
    expect(plan.generic).toEqual(['hud-desktop', 'hud-mobile']);
  });

  it('the vendor row gate resolves its own target from the sim table and both view halves', () => {
    // The gate spans a sim content table and the two vendor-window halves, and
    // only the sim table is outside src/ui, so a gate-table-only change would
    // fall through to "nothing to shoot" without its own `when` entry. Pinning
    // the resolved key ORDER also catches a typo in either list.
    expect(
      resolveTargets(['src/sim/content/vendor_row_gates.ts']).map((t: { key: string }) => t.key),
    ).toEqual(['vendor-tool-gate']);
    // Both view halves resolve this target and ONLY this target. Worth pinning
    // because it is easy to assume otherwise: the bags target lists 'ui/vendor'
    // in its own `when`, but these modules live at src/ui/hud/vendor/, so that
    // entry does not substring-match them and never shot this window.
    expect(
      resolveTargets(['src/ui/hud/vendor/vendor_view.ts']).map((t: { key: string }) => t.key),
    ).toEqual(['vendor-tool-gate']);
    expect(
      resolveTargets(['src/ui/hud/vendor/vendor_window.ts']).map((t: { key: string }) => t.key),
    ).toEqual(['vendor-tool-gate']);
    // A sim-only content change is still visual, because the gate changes what
    // the goods grid paints.
    expect(classifyDiff(['src/sim/content/vendor_row_gates.ts']).isVisual).toBe(true);
  });

  it('gather-node content shoots all three surfaces it is visible on', () => {
    // Gather-node placement shows up in three places: the world map's terrain and
    // labels, the quest-objective blobs, and the in-world props. A `when` list that
    // only names the blobs would silently skip the other two, and the omission is
    // invisible because a missing target just means one fewer screenshot. Pinning
    // the resolved key ORDER makes a typo in either list red instead.
    expect(
      resolveTargets(['src/sim/content/gather_nodes.ts']).map((t: { key: string }) => t.key),
    ).toEqual(['world-map', 'gather-quest-map-areas', 'gather-node']);
    // The quest-blob geometry lives in the sim leaf, and only the blob target
    // depends on it, so that path resolves to exactly one.
    expect(resolveTargets(['src/sim/quest_targets.ts']).map((t: { key: string }) => t.key)).toEqual(
      ['gather-quest-map-areas'],
    );
    // Both are visual, so a placement-only or geometry-only change never falls
    // through to "nothing to shoot".
    expect(classifyDiff(['src/sim/content/gather_nodes.ts']).isVisual).toBe(true);
    expect(classifyDiff(['src/sim/quest_targets.ts']).isVisual).toBe(true);
  });
});
