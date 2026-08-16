// The guild-signpost lesson (q_ps_the_signpost): the camp noticeboard's
// interaction arm credits the sentinel objective through
// tutorial/signpost_read.ts, on the SAME click that raises the notice
// feedback, and only for the island board, only mid-quest, only once.

import { describe, expect, it } from 'vitest';
import { NOTICEBOARDS } from '../src/sim/content/noticeboards';
import { Sim } from '../src/sim/sim';
import { SIGNPOST_NOTICEBOARD_ID, SIGNPOST_QUEST_ID } from '../src/sim/tutorial/signpost_read';
import type { QuestProgress, SimEvent } from '../src/sim/types';

function makeSim(seed = 4120): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: true });
}

const board = NOTICEBOARDS.find((b) => b.id === SIGNPOST_NOTICEBOARD_ID)!;

/** Stand the player on the board's authored reading spot. */
function standAtBoard(sim: Sim): void {
  const p = sim.entities.get(sim.playerId)!;
  p.pos.x = board.frontStandingPoint.x;
  p.pos.z = board.frontStandingPoint.z;
}

/** Seed the signpost quest active in the log (the rail's earlier quests are
 *  exercised by their own suites; this one tests the credit arm). */
function seedActiveQuest(sim: Sim): QuestProgress {
  const meta = sim.players.get(sim.playerId)!;
  const qp: QuestProgress = { questId: SIGNPOST_QUEST_ID, counts: [0], state: 'active' };
  meta.questLog.set(SIGNPOST_QUEST_ID, qp);
  return qp;
}

describe('the signpost read credit', () => {
  it('reading the camp board mid-quest credits the sentinel and readies the quest', () => {
    const sim = makeSim();
    expect(board).toBeTruthy();
    standAtBoard(sim);
    const qp = seedActiveQuest(sim);
    sim.interact();
    expect(qp.counts[0]).toBe(1);
    expect(qp.state).toBe('ready');
    // The same click still raised the board's own notice feedback.
    const events: SimEvent[] = sim.tick();
    const notice = events.filter((e) => e.type === 'noticeboard');
    expect(notice).toHaveLength(1);
  });

  it('a second read never over-credits a ready quest', () => {
    const sim = makeSim();
    standAtBoard(sim);
    const qp = seedActiveQuest(sim);
    sim.interact();
    sim.interact();
    expect(qp.counts[0]).toBe(1);
    expect(qp.state).toBe('ready');
  });

  it('off-quest, the board is a plain noticeboard and credits nothing', () => {
    const sim = makeSim();
    standAtBoard(sim);
    sim.interact();
    const meta = sim.players.get(sim.playerId)!;
    expect(meta.questLog.has(SIGNPOST_QUEST_ID)).toBe(false);
    const events = sim.tick();
    expect(events.some((e) => e.type === 'noticeboard')).toBe(true);
    expect(events.some((e) => e.type === 'questProgress')).toBe(false);
  });
});
