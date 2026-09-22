// A Clue Scroll talk step solved from the NPC's gossip window (playtest: clicking
// Ferrymaster Caddow opened his window and the hunt never moved, because the
// window opens client-side and never reaches Sim.talkToNpc).
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { clueTalkHuntFor } from '../src/ui/hud/quest/clue_talk_row_core';

const HUNT = 'hunt_amberfall_lantern_ferry';

describe('the clue talk row', () => {
  it('offers the row only at the NPC the current talk or delivery step names', () => {
    // Step 0: speak with Ferrymaster Caddow.
    expect(clueTalkHuntFor({ huntId: HUNT, step: 0 }, 'ferrymaster_caddow')).toBe(HUNT);
    expect(clueTalkHuntFor({ huntId: HUNT, step: 0 }, 'orchardist_pomeline')).toBeNull();
    // Step 1 is a landmark: no NPC answers it.
    expect(clueTalkHuntFor({ huntId: HUNT, step: 1 }, 'ferrymaster_caddow')).toBeNull();
    // Step 2: deliver water to Orchardist Pomeline.
    expect(clueTalkHuntFor({ huntId: HUNT, step: 2 }, 'orchardist_pomeline')).toBe(HUNT);
    expect(clueTalkHuntFor(null, 'ferrymaster_caddow')).toBeNull();
    expect(clueTalkHuntFor({ huntId: 'retired_hunt', step: 0 }, 'ferrymaster_caddow')).toBeNull();
  });

  it("the row's action (target, then interact) advances the hunt", () => {
    const sim = new Sim({ seed: 1, playerClass: 'warrior', autoEquip: true, devCommands: true });
    const pid = sim.player.id;
    sim.chat('/dev level 20', pid);
    sim.chat(`/dev clue hunt ${HUNT}`, pid);
    const caddow = [...sim.entities.values()].find((e) => e.templateId === 'ferrymaster_caddow');
    if (!caddow) throw new Error('missing Caddow');
    sim.chat(`/dev tp ${caddow.pos.x + 1} ${caddow.pos.z + 1}`, pid);
    const meta = sim.meta(pid);
    expect(meta?.clueHunt).toEqual({ huntId: HUNT, step: 0 });
    sim.targetEntity(caddow.id);
    sim.interact();
    expect(meta?.clueHunt).toEqual({ huntId: HUNT, step: 1 });
  });
});
