// The professions fairness guard (the UX pass): names, with teeth, which
// professions presentation is ACTIONABLE (must be graphics-preset-identical,
// per docs/design/graphics-settings-fairness.md) and which is COSMETIC (a
// preset may shed it).
//
// ACTIONABLE, preset-identical:
//   - The fishing bobber and its bite state (the reel window's one visual
//     affordance): fishing_bobber.ts and its core read neither the static
//     preset profile nor the FPS governor.
//   - The minimap's node markers (ready/cooldown, the lock strike): the
//     touch player's only node-spotting surface, so the marker build and
//     paint stay profile-free.
//   - The node props' TIER differentiation (nodeTierScale): tier is the
//     access gate's number, so the scale ladder is static content -> size,
//     identical everywhere.
//
// COSMETIC, and allowed to vary: the low preset's shorter fog (LOW_FOG in
// renderer.ts) sheds distant SCENERY, node props included, because the
// actionable spotting surface at range is the minimap above, which does not
// shorten; and the water surface's splash richness around a bite, because
// the bite itself is carried by the bobber state, the cue, and the log line.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NODE_TIER_SCALE_STEP, nodeTierScale } from '../src/render/gather_nodes_lookup';

// Comments stripped before scanning (the architecture-test rule): prose that
// NAMES the invariant ("nothing here reads ui_effects_profile") must never
// trip the scan that enforces it.
const read = (rel: string): string =>
  readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// The two spellings a profile/governor read would arrive through. Import
// specifiers are enough: the per-file scan matches the architecture test's
// scope (a module reaching for the profile does it by importing it).
const PROFILE_TOKENS = ['ui_effects_profile', 'fps_governor', 'frameBudgetGovernor'];

function expectProfileFree(rel: string): void {
  const source = read(rel);
  for (const token of PROFILE_TOKENS) {
    expect(source.includes(token), `${rel} must not read ${token}`).toBe(false);
  }
}

describe('professions graphics fairness (actionable surfaces stay preset-identical)', () => {
  it('the fishing bobber (bite affordance) reads no profile and no governor', () => {
    expectProfileFree('src/render/fishing_bobber.ts');
    expectProfileFree('src/render/fishing_bobber_core.ts');
  });

  it('the minimap node markers (spotting + lock) read no profile and no governor', () => {
    expectProfileFree('src/ui/minimap_markers.ts');
    expectProfileFree('src/ui/minimap_painter.ts');
    // The node tooltip carries two actionable lines of its own (the respawn
    // countdown and the fine-grade preview), so it joins the scan (the
    // phase 14 QA).
    expectProfileFree('src/ui/gather_node_tooltip.ts');
  });

  it('the node prop tier ladder is static and profile-free', () => {
    expectProfileFree('src/render/gather_nodes.ts');
    expectProfileFree('src/render/gather_nodes_lookup.ts');
    // The ladder itself: floor at tier 1, strictly increasing, one uniform
    // step (a preset cannot move it because nothing feeds it but the tier).
    expect(nodeTierScale(0)).toBe(1);
    expect(nodeTierScale(1)).toBe(1);
    for (let tier = 2; tier <= 5; tier++) {
      expect(nodeTierScale(tier)).toBeGreaterThan(nodeTierScale(tier - 1));
      expect(nodeTierScale(tier)).toBeCloseTo(1 + NODE_TIER_SCALE_STEP * (tier - 1), 10);
    }
  });

  it('the cosmetic side is the one that varies: LOW_FOG exists and the bobber does not read it', () => {
    // The low preset's fog trade is real (the constant exists in the
    // renderer)...
    const renderer = read('src/render/renderer.ts');
    expect(renderer.includes('LOW_FOG')).toBe(true);
    // ...and it is scenery-only for professions because the actionable
    // surfaces above never import the renderer's fog state either.
    expect(read('src/render/fishing_bobber.ts').includes('LOW_FOG')).toBe(false);
    expect(read('src/ui/minimap_markers.ts').includes('LOW_FOG')).toBe(false);
  });
});
