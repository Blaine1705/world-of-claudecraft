// The island interact bubble's pure core: which target carries the keycap
// prompt at each rail station (the giver on the way in, the turn-in on the
// way back, the nearest live crate on the haul, the bell at graduation), the
// interact-reach show gate that mirrors the click path's own ranges, and the
// chip resolution per input family.

import { describe, expect, it } from 'vitest';
// The generation-side line list (plain mjs data): the clip keys the UI plays
// must each have a text entry the ElevenLabs pipeline renders.
import { EXTRA_LINES } from '../scripts/voices/extra_lines.mjs';
import { PROVING_SHORE_NPCS, PROVING_SHORE_QUESTS } from '../src/sim/content/proving_shore';
import { INTERACT_RANGE } from '../src/sim/types';
import { BELL_STEP_TARGET } from '../src/ui/bootcamp_view';
import {
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

  it('carries no bubble for the kill lessons', () => {
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
});

describe('coachPromptInRange: the show gate mirrors the interact reach', () => {
  const base = {
    x: 0,
    z: 0,
    lift: 2,
    range: INTERACT_RANGE + 2,
    verbKey: 'hudChrome.bootcamp.promptTalk',
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
      // The designed voice Odo's own dialog aliases to (coverage requires a
      // designed voice, not an alias); promote to ferryman_odo's own voice
      // when one is designed, and move this pin with it.
      expect(entry!.voiceNpc).toBe('ferrymaster_caddow');
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
