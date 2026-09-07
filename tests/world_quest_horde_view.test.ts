import { describe, expect, it } from 'vitest';
import { createHordeBarricade } from '../src/sim/minigames/horde_barricade';
import type { WorldQuestProgress } from '../src/sim/types';
import { QuestTrackerController } from '../src/ui/hud/quest/quest_tracker_controller';
import { makeWriterFacet } from '../src/ui/painter_host';
import { hordeInstructionLines } from '../src/ui/world_quest_horde_view';

const progress = (): WorldQuestProgress => ({
  questId: 'wq_wraithwood_barricade',
  state: 'active',
  count: 0,
  horde: createHordeBarricade(42),
});

describe('horde tracker instructions', () => {
  it('explains auto-fire, movement, upgrades and leaving during the authoritative countdown', () => {
    const p = progress();
    const lines = hordeInstructionLines(p);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Horde incoming in 3s!');
    expect(lines[1]).toBe('Shots: 1 | +0% speed | Repeater');
    expect(lines[2]).toContain('Auto-fire. A/D, arrows or joystick. Backward: leave.');
    expect(lines[3]).toBe('Break one crate to choose. The other disappears!');
    p.horde!.tick = 21;
    expect(hordeInstructionLines(p)[0]).toBe('Horde incoming in 2s!');
  });

  it('projects time, integrity and weapon only from an unchanged owner snapshot', () => {
    const p = progress();
    Object.assign(p.horde!, { phase: 'active', tick: 80, barrier: 87, kills: 12, upgrade: 2 });
    const before = structuredClone(p);
    const lines = hordeInstructionLines(p);
    expect(lines[0]).toBe('89s left. Kills: 12. Barricade: 87%.');
    expect(lines[1]).toBe('Shots: 1 | +0% speed | Piercing Shot');
    expect(hordeInstructionLines(structuredClone(p))).toEqual(lines);
    expect(p).toEqual(before);
    expect(lines.join(' ')).not.toMatch(/Gold!|Silver!|Score:/);
  });

  it('shows the latest practice result over an earlier saved gold result', () => {
    const p = progress();
    p.state = 'completed';
    p.hordeResult = { rating: 'gold', kills: 300, barrier: 100, score: 3500 };
    Object.assign(p.horde!, {
      phase: 'won',
      result: {
        rating: 'silver',
        kills: 200,
        barrier: 60,
        score: 2300,
      },
    });
    expect(hordeInstructionLines(p)).toEqual([
      'Silver! Score: 2,300.',
      'Kills: 200. Barricade: 60%.',
      'Speak to the captain to retry. Rewards once per rotation.',
    ]);
    delete p.horde;
    expect(hordeInstructionLines(p)[0]).toBe('Gold! Score: 3,500.');
  });

  it('does not present a failed attempt as a bronze completion or the saved success', () => {
    const p = progress();
    p.hordeResult = { rating: 'gold', kills: 300, barrier: 100, score: 3500 };
    Object.assign(p.horde!, {
      phase: 'failed',
      result: {
        rating: 'bronze',
        kills: 15,
        barrier: 0,
        score: 150,
      },
    });
    const lines = hordeInstructionLines(p);
    expect(lines[0]).toBe('Defense failed. Try again!');
    expect(lines[1]).toBe('Kills: 15. Barricade: 0%.');
    expect(lines).toHaveLength(3);
    expect(lines.join(' ')).not.toMatch(/Gold!|Bronze!/);
  });

  it('offers a start when there is no attempt and hides the old result during a retry', () => {
    const p = progress();
    p.hordeResult = { rating: 'gold', kills: 300, barrier: 100, score: 3500 };
    expect(hordeInstructionLines(p)[0]).toBe('Horde incoming in 3s!');
    delete p.horde;
    delete p.hordeResult;
    expect(hordeInstructionLines(p)).toEqual(['Speak to the barricade captain to begin.']);
  });

  it('keeps the active lesson expanded, then unlocks collapse while retaining its completed result', () => {
    const p = progress();
    let collapsed = true;
    const element = { innerHTML: '', addEventListener() {} } as unknown as HTMLElement;
    const tracker = new QuestTrackerController({
      element,
      document: { activeElement: null } as unknown as Document,
      writers: makeWriterFacet(
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        () => {},
        () => {},
      ),
      world: () => ({ questLog: new Map(), worldQuestLog: new Map([[p.questId, p]]) }),
      settings: {
        available: () => true,
        collapsed: () => collapsed,
        setCollapsed: (value) => {
          collapsed = value;
        },
      },
      questTitle: () => '',
      objectiveLabel: () => '',
      click() {},
    });
    tracker.update(0);
    expect(element.innerHTML).toContain('The Last Barricade');
    expect(element.innerHTML).toContain('Horde incoming in 3s!');
    expect(element.innerHTML).toContain('aria-disabled="true"');
    tracker.toggleCollapsed();
    expect(collapsed).toBe(true);
    p.state = 'completed';
    Object.assign(p.horde!, {
      phase: 'won',
      result: {
        rating: 'gold',
        kills: 300,
        barrier: 100,
        score: 3500,
      },
    });
    tracker.update(1);
    expect(element.innerHTML).not.toContain('aria-disabled="true"');
    tracker.toggleCollapsed();
    expect(collapsed).toBe(false);
    expect(element.innerHTML).toContain('Gold! Score: 3,500.');
  });
});
