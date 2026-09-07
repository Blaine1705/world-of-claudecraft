import { describe, expect, it } from 'vitest';
import { objectDisplayName } from '../src/render/entity_labels';
import { createForgeWorkshop } from '../src/sim/minigames/forge_workshop';
import type { Entity, WorldQuestProgress } from '../src/sim/types';
import { entityDisplayName } from '../src/ui/entity_display_labels';
import {
  forgeInstructionLines,
  forgeObjectLabel,
  forgeSpeechText,
} from '../src/ui/world_quest_forge_view';

function progress(): WorldQuestProgress {
  return {
    questId: 'wq_evergarden_forging',
    state: 'active',
    count: 0,
    forging: createForgeWorkshop(42, 100),
  };
}

function session(p: WorldQuestProgress) {
  if (!p.forging) throw new Error('Missing forge fixture');
  return p.forging;
}

describe('forge workshop instructions', () => {
  it('starts a three-second countdown even when the authoritative realm has been running for hours', () => {
    const p = progress();
    p.forging = createForgeWorkshop(42, 36000);
    expect(forgeSpeechText(p)).toBe('Ready your hands! Starting in 3s.');
    // The wire carries this clock inside the owner session. No assumed IWorld
    // implementation property or browser frame clock enters the projection.
    expect(forgeInstructionLines(structuredClone(p))).toEqual(forgeInstructionLines(p));
  });

  it('hides the requested object during countdown and between requests', () => {
    const p = progress();
    expect(forgeSpeechText(p)).toBe('Ready your hands! Starting in 3s.');
    session(p).observedAt = 101;
    expect(forgeSpeechText(p)).toBe('Ready your hands! Starting in 2s.');
    session(p).phase = 'working';
    session(p).requests[0] = ['fuel'];
    expect(forgeSpeechText(p)).toBe('Nicely done! Next request...');
    session(p).observedAt = 103;
    expect(forgeSpeechText(p)).toContain('Add some wood!');
  });

  it('shows ordered double requests and advances only the authoritative step', () => {
    const p = progress();
    session(p).phase = 'working';
    session(p).requestIndex = 7;
    session(p).observedAt = 120;
    session(p).requests[7] = ['water', 'metal'];
    expect(forgeSpeechText(p)).toContain('Water from the well! Then click the Ingot Crate.');
    session(p).actionIndex = 1;
    const before = structuredClone(p);
    const lines = forgeInstructionLines(p);
    expect(forgeSpeechText(p)).toBe('More metal! Open the ingot crate!');
    expect(lines[0]).toBe('Request 8/10: step 2/2');
    expect(p).toEqual(before);
  });

  it('keeps wrong-click feedback but hides times and medal thresholds while working', () => {
    const p = progress();
    Object.assign(session(p), {
      phase: 'working',
      feedback: 'wrong',
      mistakes: 2,
      lockUntil: 121,
      observedAt: 120,
    });
    const lines = forgeInstructionLines(p);
    expect(lines[1]).toContain('Wrong tool! +3s.');
    expect(lines).toHaveLength(2);
    expect(lines.join(' ')).not.toMatch(/Gold|Silver|23s/);
  });

  it('shows the latest practice result rather than a saved better score', () => {
    const p = progress();
    p.state = 'completed';
    p.forgeResult = { elapsed: 30, adjustedTime: 30, mistakes: 0, rating: 'gold' };
    Object.assign(session(p), {
      phase: 'success',
      result: {
        elapsed: 62,
        adjustedTime: 65,
        mistakes: 1,
        rating: 'bronze',
      },
    });
    expect(forgeInstructionLines(p)[0]).toBe('Bronze! 65s. Mistakes: 1.');
    expect(forgeInstructionLines(p)[1]).toBe('Gold: 40s or less. Silver: 60s or less.');
    expect(forgeInstructionLines(p)[2]).toContain('Rewards are earned once per rotation');
    delete p.forging;
    expect(forgeInstructionLines(p)[0]).toBe('Gold! 30s. Mistakes: 0.');
  });

  it('labels the four world click targets without relabeling unrelated objects', () => {
    expect(
      ['fuel', 'metal', 'water', 'tools'].map((id) => forgeObjectLabel(`forge_${id}`)),
    ).toEqual(['Woodpile', 'Ingot Crate', 'Well', 'Anvil']);
    expect(forgeObjectLabel('quest_crate')).toBeNull();
    const entity = {
      kind: 'object',
      templateId: 'ground_forge_fuel',
      objectItemId: 'forge_fuel',
    } as Entity;
    expect(entityDisplayName(entity)).toBe('Woodpile');
    expect(objectDisplayName(entity)).toBe('Woodpile');
  });
});
