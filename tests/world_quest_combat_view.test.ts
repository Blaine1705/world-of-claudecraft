import { describe, expect, it, vi } from 'vitest';
import { handlePickedEntity, hoverCursorKind } from '../src/game/interactions';
import { tryNearbyInteraction } from '../src/game/nearby_interaction';
import { nextNpcTarget } from '../src/game/npc_cycle';
import { createPadTargetPick } from '../src/game/pad_target_pick';
import { COMBAT_QUEST_SITES } from '../src/sim/content/world_quest_combat';
import type { Entity, WorldQuestCombatState, WorldQuestProgress } from '../src/sim/types';
import {
  combatQuestInstructionLines,
  combatQuestTrackedObjectives,
} from '../src/ui/world_quest_combat_view';
import { worldQuestDisplayName, worldQuestObjectiveLabel } from '../src/ui/world_quest_view';

function progress(index: number, patch?: Partial<WorldQuestCombatState>): WorldQuestProgress {
  return {
    questId: COMBAT_QUEST_SITES[index].questId,
    count: 0,
    state: 'active',
    ...(patch
      ? {
          combat: {
            phase: 'ready',
            stage: 1,
            kills: 0,
            required: 3,
            trail: 0,
            integrity: 100,
            secondsRemaining: 180,
            ...patch,
          },
        }
      : {}),
  };
}

describe('combat world quest instructions', () => {
  it('prioritizes live Highwatch integrity and phase while retaining start and retry instructions', () => {
    const waves = combatQuestTrackedObjectives(
      progress(2, { phase: 'waves', stage: 2, integrity: 25 }),
    );
    expect(waves[0]).toMatchObject({
      label: 'Defenses remaining: 25%',
      current: 25,
      total: 100,
      progressBar: true,
    });
    expect(waves[1].label).toContain('Wave 2/3');
    expect(waves[2].label).toContain('sappers');
    const boss = combatQuestTrackedObjectives(progress(2, { phase: 'boss', integrity: 50 }));
    expect(boss[0].current).toBe(50);
    expect(boss[1].label).toBe('Defeat the final enemy.');
    for (const phase of ['ready', 'failed'] as const) {
      const waiting = combatQuestTrackedObjectives(progress(2, { phase }));
      expect(waiting.some((line) => line.progressBar)).toBe(false);
      expect(waiting.some((line) => line.label.includes('Speak with'))).toBe(true);
    }
  });
  it.each(COMBAT_QUEST_SITES)(
    'names $encounterId and provides the starting NPC before and after failure',
    (site) => {
      const p = progress(COMBAT_QUEST_SITES.indexOf(site));
      expect(worldQuestDisplayName(site.questId)).not.toMatch(/questUi|unknown/i);
      expect(combatQuestInstructionLines(p)[0]).toBe(worldQuestObjectiveLabel(site.questId));
      expect(combatQuestInstructionLines(p)[1]).toMatch(/Speak with/);
      p.combat = progress(0, { phase: 'failed' }).combat;
      expect(combatQuestInstructionLines(p).join(' ')).toContain('try again');
      expect(combatQuestInstructionLines(p).join(' ')).not.toContain(String(site.npcEntityId));
    },
  );

  it('updates actionable phase counters, boss state, and gate health', () => {
    expect(
      combatQuestInstructionLines(progress(0, { phase: 'leaders', kills: 2, required: 3 })),
    ).toContain('Leaders defeated: 2/3');
    expect(combatQuestInstructionLines(progress(1, { phase: 'waves', stage: 2 }))).toContain(
      'Wave 2/3. Clear the attackers to advance.',
    );
    expect(combatQuestInstructionLines(progress(0, { phase: 'boss' }))).toContain(
      'Defeat the final enemy.',
    );
    expect(combatQuestInstructionLines(progress(2, { phase: 'waves', integrity: 25 }))).toContain(
      'Defenses remaining: 25%',
    );
    expect(
      combatQuestInstructionLines({ questId: 'constructor', count: 0, state: 'active' }),
    ).toEqual([]);
  });
});

function interactionRig(site: (typeof COMBAT_QUEST_SITES)[number], original = false) {
  const player = {
    id: 1,
    kind: 'player',
    pos: { x: 0, y: 0, z: 0 },
    targetId: null,
    dead: false,
  } as Entity;
  const npc = {
    id: original ? 100 : site.npcEntityId,
    kind: 'npc',
    templateId: site.npcId,
    pos: { x: 1, y: 0, z: 0 },
    dead: false,
    questIds: [],
  } as unknown as Entity;
  const world = {
    player,
    playerId: 1,
    entities: new Map([
      [1, player],
      [npc.id, npc],
    ]),
    known: [],
    questLog: new Map(),
    worldQuestLog: new Map(),
    targetEntity: vi.fn((id: number | null) => {
      player.targetId = id;
    }),
    interact: vi.fn(),
    lootCorpse: vi.fn(() => true),
    harvestCorpse: vi.fn(),
    delveInteract: vi.fn(() => true),
    enterDungeon: vi.fn(() => true),
    leaveDungeon: vi.fn(() => true),
    pickUpObject: vi.fn(() => true),
    startAutoAttack: vi.fn(),
    nodeHarvestableByMe: vi.fn(() => true),
    harvestNode: vi.fn(() => true),
  };
  const hud = {
    openQuestDialog: vi.fn(),
    openLoot: vi.fn(),
    openDelveBoard: vi.fn(),
    openMailbox: vi.fn(),
    showError: vi.fn(),
    closeContextMenu: vi.fn(),
    requestSpiritHealerResurrect: vi.fn(),
  };
  const nearby = (prefer?: number | null) =>
    tryNearbyInteraction(
      world,
      hud,
      [],
      null,
      'too far',
      'not ready',
      'escort away',
      'nothing',
      true,
      undefined,
      prefer,
    );
  return { world, hud, npc, nearby };
}

describe('combat expedition NPC input routes', () => {
  it.each(COMBAT_QUEST_SITES)(
    'makes $encounterId accessible by desktop click, mobile tap, key, and controller',
    (site) => {
      for (const button of [0, 2]) {
        const { world, hud, npc } = interactionRig(site);
        expect(hoverCursorKind(npc, 1, new Set())).toBe('friendly');
        expect(handlePickedEntity(world, hud, npc.id, button, 0, 0)).toBe(true);
        expect(world.player.targetId).toBe(npc.id);
        expect(world.interact).toHaveBeenCalledOnce();
        expect(hud.openQuestDialog).not.toHaveBeenCalled();
      }
      const { world, hud, npc, nearby } = interactionRig(site);
      expect(nearby()).toBe(true);
      expect(world.interact).toHaveBeenCalledOnce();
      world.interact.mockClear();
      world.targetEntity(nextNpcTarget(world.entities.values(), world.player.pos, null));
      expect(world.player.targetId).toBe(npc.id);
      createPadTargetPick({ world, interactKey: nearby }).interact();
      expect(world.interact).toHaveBeenCalledOnce();
      expect(hud.openQuestDialog).not.toHaveBeenCalled();
    },
  );

  it.each(COMBAT_QUEST_SITES)('preserves the original town $npcId dialogue', (site) => {
    const { world, hud, npc, nearby } = interactionRig(site, true);
    expect(handlePickedEntity(world, hud, npc.id, 0, 0, 0)).toBe(true);
    expect(nearby()).toBe(true);
    expect(world.interact).not.toHaveBeenCalled();
    expect(hud.openQuestDialog).toHaveBeenCalledTimes(2);
  });
});
