// The island interact bubble's pure core: which target carries the keycap
// prompt at each rail station (the giver on the way in, the turn-in on the
// way back, the nearest live crate on the haul, the bell at graduation), the
// interact-reach show gate that mirrors the click path's own ranges, and the
// chip resolution per input family.

import { describe, expect, it } from 'vitest';
// The generation-side line list (plain mjs data): the clip keys the UI plays
// must each have a text entry the ElevenLabs pipeline renders.
import { EXTRA_LINES } from '../scripts/voices/extra_lines.mjs';
import {
  PROVING_SHORE_NPCS,
  PROVING_SHORE_PROPS,
  PROVING_SHORE_QUESTS,
} from '../src/sim/content/proving_shore';
import { CRAB_SUMMON_SITE } from '../src/sim/interactions/crab_summon';
import { INTERACT_RANGE } from '../src/sim/types';
import { BELL_STEP_TARGET } from '../src/ui/bootcamp_view';
import {
  BOOTCAMP_PARKOUR,
  type CoachPromptEntity,
  coachPromptChip,
  coachPromptInRange,
  coachPromptPlan,
  GUIDE_VOICE_LINES,
  nearestCrate,
  PROMPT_NPC_RANGE,
  PROMPT_OBJECT_RANGE,
} from '../src/ui/coach_prompt_view';
import { en } from '../src/ui/i18n.catalog';

const AT_ORIGIN = { x: 0, z: 0 };

function crate(x: number, z: number, dead = false): CoachPromptEntity {
  return { kind: 'object', objectItemId: 'ps_castaway_crate', dead, pos: { x, z } };
}

function plan(over: {
  bellPhase?: boolean;
  step?: Parameters<typeof coachPromptPlan>[0]['step'];
  focus?: { questId: string; state: 'available' | 'active' | 'ready' } | null;
  entities?: CoachPromptEntity[];
  playerPos?: { x: number; z: number };
}) {
  return coachPromptPlan({
    bellPhase: over.bellPhase ?? false,
    step: over.step ?? null,
    focus: over.focus ?? null,
    entities: over.entities ?? [],
    playerPos: over.playerPos ?? AT_ORIGIN,
  });
}

describe('coachPromptPlan: which target carries the bubble', () => {
  it('aims at the giver with Talk while a quest is on offer', () => {
    const p = plan({ focus: { questId: 'q_ps_strike_true', state: 'available' } });
    const giver = PROVING_SHORE_NPCS[PROVING_SHORE_QUESTS.q_ps_strike_true.giverNpcId];
    expect(p).not.toBeNull();
    expect(p!.x).toBe(giver.pos.x);
    expect(p!.z).toBe(giver.pos.z);
    expect(p!.range).toBe(PROMPT_NPC_RANGE);
    expect(p!.verbKey).toBe('hudChrome.bootcamp.promptTalk');
  });

  it('aims at the turn-in with Turn in once the task is done', () => {
    const p = plan({ focus: { questId: 'q_ps_shell_and_claw', state: 'ready' } });
    const turnIn = PROVING_SHORE_NPCS[PROVING_SHORE_QUESTS.q_ps_shell_and_claw.turnInNpcId];
    expect(p!.x).toBe(turnIn.pos.x);
    expect(p!.verbKey).toBe('hudChrome.bootcamp.promptTurnIn');
  });

  it('bubbles the nearest live quarry with Attack for the kill lessons', () => {
    const near = { kind: 'mob', templateId: 'training_effigy', pos: { x: 4, z: 0 } };
    const far = { kind: 'mob', templateId: 'training_effigy', pos: { x: 30, z: 0 } };
    const felled = { kind: 'mob', templateId: 'training_effigy', dead: true, pos: { x: 1, z: 0 } };
    const p = plan({
      focus: { questId: 'q_ps_strike_true', state: 'active' },
      entities: [far, felled, near],
    });
    expect(p!.x).toBe(4);
    expect(p!.kind).toBe('kill');
    expect(p!.verbKey).toBe('hudChrome.bootcamp.promptAttack');
  });

  it('stays quiet for a kill lesson with no live quarry in the roster', () => {
    expect(plan({ focus: { questId: 'q_ps_strike_true', state: 'active' } })).toBeNull();
    expect(plan({ focus: { questId: 'q_ps_shell_and_claw', state: 'active' } })).toBeNull();
  });

  it('aims at the nearest LIVE crate on the haul, with the object reach', () => {
    const near = crate(3, 0);
    const far = crate(40, 0);
    const looted = crate(1, 0, true);
    const p = plan({
      focus: { questId: 'q_ps_the_wreck_line', state: 'active' },
      entities: [far, looted, near],
    });
    expect(p!.x).toBe(3);
    expect(p!.range).toBe(PROMPT_OBJECT_RANGE);
    expect(p!.verbKey).toBe('hudChrome.bootcamp.promptPickUp');
  });

  it('goes quiet between crate respawns rather than pointing at nothing', () => {
    const p = plan({
      focus: { questId: 'q_ps_the_wreck_line', state: 'active' },
      entities: [crate(1, 0, true)],
    });
    expect(p).toBeNull();
  });

  it('walks the gauntlet ladder: Talk at Tam, Turn in at Pell, quiet mid-lane', () => {
    expect(plan({ step: 'talk' })!.verbKey).toBe('hudChrome.bootcamp.promptTalk');
    expect(plan({ step: 'done' })!.verbKey).toBe('hudChrome.bootcamp.promptTurnIn');
    expect(plan({ step: 'forward' })).toBeNull();
    expect(plan({ step: 'camera' })).toBeNull();
  });

  it('rings the bell at graduation', () => {
    const p = plan({ bellPhase: true });
    expect(p!.x).toBe(BELL_STEP_TARGET.x);
    expect(p!.z).toBe(BELL_STEP_TARGET.z);
    expect(p!.verbKey).toBe('hudChrome.bootcamp.promptRing');
  });

  it('asks for the lure at the pool, then attacks once the king is up', () => {
    // The pearl detour's quarry is summoned: with no live boss the bubble
    // stands on the tide pool with the bags-bind Summon ask; once he prowls
    // it becomes the usual kill bubble on him.
    const focus = { questId: 'q_ps_mother_of_pearl', state: 'active' as const };
    const before = plan({ focus, entities: [] });
    expect(before!.kind).toBe('use');
    expect(before!.verbKey).toBe('hudChrome.bootcamp.promptSummon');
    expect({ x: before!.x, z: before!.z }).toEqual({
      x: CRAB_SUMMON_SITE.x,
      z: CRAB_SUMMON_SITE.z,
    });
    const boss: CoachPromptEntity = {
      kind: 'mob',
      templateId: 'mister_crabs',
      pos: { x: CRAB_SUMMON_SITE.x, z: CRAB_SUMMON_SITE.z + 3 },
    };
    const during = plan({ focus, entities: [boss] });
    expect(during!.kind).toBe('kill');
    expect(during!.verbKey).toBe('hudChrome.bootcamp.promptAttack');
    expect({ x: during!.x, z: during!.z }).toEqual(boss.pos);
    // A dead king reads as "not up": the lure ask returns for the re-summon.
    const after = plan({ focus, entities: [{ ...boss, dead: true }] });
    expect(after!.kind).toBe('use');
  });

  it('asks for the hurdle jump, then the crate step, then goes quiet', () => {
    // Lane 2 runs south (-z): entering at the first flag the bubble aims at
    // the hurdle rail; a stride past the rail it moves to the crate step; a
    // stride past the crates the lane is clear and the ask ends.
    const atFlag = plan({ step: 'turnwalk', playerPos: { x: -308, z: -16 } });
    expect(atFlag!.kind).toBe('jump');
    expect(atFlag!.verbKey).toBe('hudChrome.bootcamp.promptJump');
    expect({ x: atFlag!.x, z: atFlag!.z }).toEqual(BOOTCAMP_PARKOUR[0]);
    const pastRail = plan({ step: 'turnwalk', playerPos: { x: -308, z: -24.5 } });
    expect({ x: pastRail!.x, z: pastRail!.z }).toEqual(BOOTCAMP_PARKOUR[1]);
    expect(plan({ step: 'turnwalk', playerPos: { x: -308, z: -28.5 } })).toBeNull();
  });

  it('anchors the parkour asks on the authored obstacles', () => {
    // The hurdle anchor sits mid-lane ON a fence rail spanning lane 2 wall
    // to wall, and the crate-step anchor sits on the authored crate line: if
    // the content moves, the bubbles move with it or this pins the drift.
    const [hurdle, step] = BOOTCAMP_PARKOUR;
    const rail = (PROVING_SHORE_PROPS.fences ?? []).find(
      (f) => f.z1 === hurdle.z && f.z2 === hurdle.z && f.x1 <= hurdle.x && hurdle.x <= f.x2,
    );
    const railSpan = rail ?? { x1: 0, x2: 0 };
    expect(rail, 'a lane 2 rail under the hurdle anchor').toBeTruthy();
    // Wall to wall: the rail meets both lane walls so it cannot be walked
    // around (lane 2's west wall x -312, east wall x -304).
    expect(Math.min(railSpan.x1, railSpan.x2)).toBe(-312);
    expect(Math.max(railSpan.x1, railSpan.x2)).toBe(-304);
    const crates = PROVING_SHORE_PROPS.crates ?? [];
    const stepRow = crates.filter(([, z]) => z === step.z);
    expect(stepRow.length, 'the crate step under the second anchor').toBeGreaterThanOrEqual(6);
    // Shoulder to shoulder across the lane: no slipping between crates. The
    // narrowest collider is the barrel (r 0.44, prop_layout.ts
    // campCrateShape), so adjacent points 1.1 apart always overlap or leave
    // a gap smaller than any player body.
    const xs = stepRow.map(([x]) => x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      const gap = xs[i] - xs[i - 1];
      expect(gap, `crate spacing ${i}`).toBeLessThanOrEqual(1.15);
    }
    expect(Math.min(...xs)).toBeLessThanOrEqual(-311);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(-305);
  });
});

describe('coachPromptInRange: the show gate mirrors the interact reach', () => {
  const base = {
    x: 0,
    z: 0,
    lift: 2,
    range: INTERACT_RANGE + 2,
    verbKey: 'hudChrome.bootcamp.promptTalk',
    kind: 'interact',
  } as const;

  it('shows at the reach boundary and hides one step past it', () => {
    expect(coachPromptInRange(base, { x: base.range, z: 0 })).toBe(true);
    expect(coachPromptInRange(base, { x: base.range + 0.5, z: 0 })).toBe(false);
  });
});

describe('nearestCrate: the haul scan', () => {
  it('ignores non-crate objects entirely', () => {
    const bell: CoachPromptEntity = {
      kind: 'object',
      objectItemId: 'ps_ferry_bell',
      pos: { x: 1, z: 0 },
    };
    expect(nearestCrate([bell], AT_ORIGIN)).toBeNull();
  });
});

describe('GUIDE_VOICE_LINES: the clip keys, the pipeline lines, the captions', () => {
  it('renders every UI clip key from an extra_lines entry on the ferryman', () => {
    const byKey = new Map(EXTRA_LINES.map((l: { key: string }) => [l.key, l]));
    for (const line of Object.values(GUIDE_VOICE_LINES)) {
      const entry = byKey.get(line.clip) as { voiceNpc: string; text: string } | undefined;
      expect(
        entry,
        `${line.clip} must be declared in scripts/voices/extra_lines.mjs`,
      ).toBeDefined();
      expect(entry!.voiceNpc).toBe('ferryman_odo');
    }
  });

  it('speaks the SAME English the caption row shows (reword them together)', () => {
    const byKey = new Map(EXTRA_LINES.map((l: { key: string; text: string }) => [l.key, l.text]));
    const captions = en.hudChrome.bootcamp as Record<string, string>;
    for (const line of Object.values(GUIDE_VOICE_LINES)) {
      const captionKey = line.caption.replace('hudChrome.bootcamp.', '');
      expect(byKey.get(line.clip)).toBe(captions[captionKey]);
    }
  });
});

describe('coachPromptChip: one chip per input family', () => {
  it('shows the live bind on keyboard, the fixed B on pad, nothing on touch', () => {
    expect(coachPromptChip('keyboard', 'F')).toEqual({ chip: 'F', chipIsKey: true });
    expect(coachPromptChip('pad', 'F')).toEqual({ chip: 'B', chipIsKey: true });
    expect(coachPromptChip('touch', 'F')).toEqual({ chip: null, chipIsKey: false });
  });

  it('hides the chip when the interact action is unbound', () => {
    expect(coachPromptChip('keyboard', '')).toEqual({ chip: null, chipIsKey: true });
  });
});
