// The Hud-side prewarm composition (preview_prewarm_wiring.ts): the plan
// scheduling itself is preview_prewarm_core.test.ts's job; this suite pins the
// WIRING, that the stateless halves (the class roster, the real per-class skin
// counts, the async portrait prewarm) are composed in, and that every
// Hud-supplied thunk is routed verbatim.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/characters/portrait', () => ({
  prewarmPlayerPortrait: vi.fn(),
}));

import { skinCount } from '../src/render/characters/manifest';
import { prewarmPlayerPortrait } from '../src/render/characters/portrait';
import { ALL_CLASSES } from '../src/sim/types';
import { buildHudPreviewPrewarmUnits } from '../src/ui/preview_prewarm_wiring';

type Calls = {
  shell: number;
  skins: number[];
  poses: string[];
  armory: [string, string][];
  finish: number;
};

function makeDeps(includeCharFamily: boolean) {
  const calls: Calls = { shell: 0, skins: [], poses: [], armory: [], finish: 0 };
  const units = buildHudPreviewPrewarmUnits<string>({
    playerClass: 'warrior',
    cardPoses: ['poseA', 'poseB'],
    armorySkinIds: ['skin_x', 'skin_y'],
    includeCharFamily,
    renderCharShell: () => {
      calls.shell++;
    },
    prewarmCharSkin: (skin) => {
      calls.skins.push(skin);
    },
    prewarmCardPose: (pose) => {
      calls.poses.push(pose);
    },
    prewarmArmorySkin: (skinId, mode) => {
      calls.armory.push([skinId, mode]);
    },
    finishArmoryPrewarm: () => {
      calls.finish++;
    },
  });
  return { calls, units };
}

describe('buildHudPreviewPrewarmUnits', () => {
  beforeEach(() => {
    vi.mocked(prewarmPlayerPortrait).mockClear();
  });

  it('composes the real class roster and skin counts into the portrait units', () => {
    const { units } = makeDeps(true);
    const portraitUnits = units.filter((u) => u.label.startsWith('preview:portrait:'));
    let expected = 0;
    for (const cls of ALL_CLASSES) expected += skinCount(`player_${cls}`) * 2;
    expect(expected).toBeGreaterThan(0);
    expect(portraitUnits.length).toBe(expected);
    for (const u of portraitUnits) u.run();
    expect(vi.mocked(prewarmPlayerPortrait).mock.calls.length).toBe(expected);
    // The wiring routes portrait units at the module level (no Hud state): the
    // first warrior headshot goes straight to prewarmPlayerPortrait.
    expect(vi.mocked(prewarmPlayerPortrait).mock.calls).toContainEqual(['warrior', 0, 'headshot']);
    expect(vi.mocked(prewarmPlayerPortrait).mock.calls).toContainEqual(['warrior', 0, 'body']);
  });

  it('routes every Hud thunk verbatim and forwards includeCharFamily', () => {
    const { calls, units } = makeDeps(true);
    for (const u of units) u.run();
    expect(calls.shell).toBe(1);
    expect(calls.skins).toEqual(
      Array.from({ length: skinCount('player_warrior') }, (_, index) => index),
    );
    expect(calls.poses).toEqual(['poseA', 'poseB']);
    expect(calls.armory).toEqual([
      ['skin_x', 'character'],
      ['skin_x', 'weapon'],
      ['skin_y', 'character'],
      ['skin_y', 'weapon'],
    ]);
    expect(calls.finish).toBe(1);
  });

  it('excludes the char-family units when includeCharFamily is false', () => {
    const { calls, units } = makeDeps(false);
    for (const u of units) u.run();
    expect(calls.shell).toBe(0);
    expect(calls.skins).toEqual([]);
    expect(calls.poses).toEqual([]);
    // The portrait and armory families still warm.
    expect(units.some((u) => u.label.startsWith('preview:portrait:'))).toBe(true);
    expect(calls.finish).toBe(1);
  });
});
