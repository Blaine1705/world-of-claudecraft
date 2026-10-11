import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDirectPickEntityId } from '../src/render/pick_resolution';
import { isUseOnlyBody, resolveWorldDirectPick } from '../src/render/world_direct_pick';
import { MOBS } from '../src/sim/data';
import { createMob, createPlayer } from '../src/sim/entity';
import type { Entity } from '../src/sim/types';

type TestPickEntity = {
  id: number;
  kind: 'mob' | 'object' | 'player' | 'npc';
  dead: boolean;
  lootable: boolean;
  /** A body the local player can only use (the resolver's fourth argument reads it). */
  useOnly?: boolean;
};

function entities(
  list: Array<{
    id: number;
    kind: TestPickEntity['kind'];
    dead?: boolean;
    lootable?: boolean;
    useOnly?: boolean;
  }>,
): Map<number, TestPickEntity> {
  return new Map(
    list.map((e) => [
      e.id,
      {
        dead: false,
        lootable: false,
        ...e,
      },
    ]),
  );
}

describe('resolveDirectPickEntityId', () => {
  it('keeps a normal single lootable corpse pick unchanged', () => {
    const map = entities([{ id: 10, kind: 'mob', dead: true, lootable: true }]);
    expect(resolveDirectPickEntityId([10], map, 10)).toBe(10);
  });

  it('skips an already-unlootable corpse to reach a stacked lootable corpse', () => {
    const map = entities([
      { id: 10, kind: 'mob', dead: true, lootable: false },
      { id: 11, kind: 'mob', dead: true, lootable: true },
    ]);
    expect(resolveDirectPickEntityId([10, 11], map)).toBe(11);
  });

  it('cycles to the next lootable corpse in a stacked direct-hit set', () => {
    const map = entities([
      { id: 10, kind: 'mob', dead: true, lootable: true },
      { id: 11, kind: 'mob', dead: true, lootable: true },
      { id: 12, kind: 'mob', dead: true, lootable: true },
    ]);
    expect(resolveDirectPickEntityId([10, 11, 12], map, 10)).toBe(11);
    expect(resolveDirectPickEntityId([10, 11, 12], map, 11)).toBe(12);
    expect(resolveDirectPickEntityId([10, 11, 12], map, 12)).toBe(10);
  });

  it('dedupes repeated child hits before cycling stacked corpses', () => {
    const map = entities([
      { id: 10, kind: 'mob', dead: true, lootable: true },
      { id: 11, kind: 'mob', dead: true, lootable: true },
    ]);
    expect(resolveDirectPickEntityId([10, 10, 11], map, 10)).toBe(11);
  });

  it('does not bypass a non-corpse first hit while cycling corpses', () => {
    const map = entities([
      { id: 9, kind: 'mob', dead: false },
      { id: 10, kind: 'mob', dead: true, lootable: true },
      { id: 11, kind: 'mob', dead: true, lootable: true },
    ]);
    expect(resolveDirectPickEntityId([9, 10, 11], map, 10)).toBe(9);
  });

  it('preserves unlootable object blocking behavior', () => {
    const map = entities([
      { id: 20, kind: 'object', lootable: false },
      { id: 10, kind: 'mob', dead: true, lootable: true },
    ]);
    expect(resolveDirectPickEntityId([20, 10], map)).toBeNull();
  });

  it('selects the ward spike first in a spike-over-raider stack, then cycles to the raider', () => {
    // A Nythraxis Bone Spike (click capsule 2.6, v0.42.2) always contains the
    // raider it pins. The first click takes the nearest live hit, the spike;
    // a second click on the same stack advances to the impaled raider, so a
    // world click can still reach them (the raid frames reach them at once).
    const map = entities([
      { id: 30, kind: 'mob', dead: false, lootable: false },
      { id: 31, kind: 'player', dead: false, lootable: false },
    ]);
    expect(resolveDirectPickEntityId([30, 31], map, null)).toBe(30);
    expect(resolveDirectPickEntityId([30, 31], map, 30)).toBe(31);
    // A shattered spike no longer stands in the way.
    const shattered = entities([
      { id: 30, kind: 'mob', dead: true, lootable: false },
      { id: 31, kind: 'player', dead: false, lootable: false },
    ]);
    expect(resolveDirectPickEntityId([30, 31], shattered, null)).toBe(31);
  });

  it('keeps a dead player directly pickable for combat resurrection targeting', () => {
    const map = entities([{ id: 30, kind: 'player', dead: true, lootable: false }]);
    expect(resolveDirectPickEntityId([30], map)).toBe(30);
  });

  describe('overlapping live targets', () => {
    it('cycles through live targets on repeated direct clicks', () => {
      const map = entities([
        { id: 10, kind: 'mob' },
        { id: 11, kind: 'mob' },
        { id: 12, kind: 'mob' },
      ]);

      expect(resolveDirectPickEntityId([10, 11, 12], map)).toBe(10);
      expect(resolveDirectPickEntityId([10, 11, 12], map, 10)).toBe(11);
      expect(resolveDirectPickEntityId([10, 11, 12], map, 11)).toBe(12);
      expect(resolveDirectPickEntityId([10, 11, 12], map, 12)).toBe(10);
    });

    it('dedupes repeated child hits before cycling live targets', () => {
      const map = entities([
        { id: 10, kind: 'mob' },
        { id: 11, kind: 'mob' },
      ]);

      expect(resolveDirectPickEntityId([10, 10, 11], map, 10)).toBe(11);
    });

    it('keeps the nearest live target when the current target is outside the hit set', () => {
      const map = entities([
        { id: 10, kind: 'mob' },
        { id: 11, kind: 'mob' },
      ]);

      expect(resolveDirectPickEntityId([10, 11], map, 99)).toBe(10);
    });

    it('cycles live targets even when a lootable corpse is the frontmost hit', () => {
      const map = entities([
        { id: 9, kind: 'mob', dead: true, lootable: true },
        { id: 10, kind: 'mob' },
        { id: 11, kind: 'mob' },
      ]);

      expect(resolveDirectPickEntityId([9, 10, 11], map)).toBe(10);
      expect(resolveDirectPickEntityId([9, 10, 11], map, 10)).toBe(11);
      expect(resolveDirectPickEntityId([9, 10, 11], map, 11)).toBe(10);
    });
  });

  describe('issue #2787: live mob wins over an overlapping corpse', () => {
    it('prefers a live mob behind the frontmost corpse instead of opening loot', () => {
      const map = entities([
        { id: 10, kind: 'mob', dead: true, lootable: true }, // ray hits this first
        { id: 11, kind: 'mob', dead: false }, // the last living mob, farther along the ray
      ]);
      expect(resolveDirectPickEntityId([10, 11], map)).toBe(11);
    });

    it('prefers a live PLAYER over a leading corpse too', () => {
      const map = entities([
        { id: 10, kind: 'mob', dead: true, lootable: true },
        { id: 12, kind: 'player', dead: false },
      ]);
      expect(resolveDirectPickEntityId([10, 12], map)).toBe(12);
    });

    it('picks the NEAREST live mob when several are behind the leading corpse', () => {
      const map = entities([
        { id: 10, kind: 'mob', dead: true, lootable: true },
        { id: 11, kind: 'mob', dead: false },
        { id: 13, kind: 'mob', dead: false },
      ]);
      expect(resolveDirectPickEntityId([10, 11, 13], map)).toBe(11);
    });

    it('still cycles among corpses when no live entity is in the hit set', () => {
      const map = entities([
        { id: 10, kind: 'mob', dead: true, lootable: true },
        { id: 11, kind: 'mob', dead: true, lootable: true },
      ]);
      expect(resolveDirectPickEntityId([10, 11], map, 10)).toBe(11); // unchanged
    });

    it('ignores a live-but-unselectable object hit behind the corpse', () => {
      // A lootable ground object is never target-selectable (kind 'object'), so
      // it must not steal the pick away from the ordinary corpse-loot branch.
      const map = entities([
        { id: 10, kind: 'mob', dead: true, lootable: true },
        { id: 14, kind: 'object', lootable: true },
      ]);
      expect(resolveDirectPickEntityId([10, 14], map)).toBe(10); // unchanged
    });

    it('still opens loot when the corpse is genuinely alone (lone-corpse looting preserved)', () => {
      const map = entities([{ id: 10, kind: 'mob', dead: true, lootable: true }]);
      expect(resolveDirectPickEntityId([10], map)).toBe(10);
    });

    it('ignores a live NPC behind the corpse: loot the corpse, not the NPC (OSSBrain review)', () => {
      // A non-hostile NPC is never a valid direct-pick target (npc dialog is
      // opened through interact/proximity, not click-pick priority), so it
      // must not steal the pick away from the ordinary corpse-loot branch,
      // same as the 'object' case above.
      const map = entities([
        { id: 10, kind: 'mob', dead: true, lootable: true },
        { id: 15, kind: 'npc', dead: false },
      ]);
      expect(resolveDirectPickEntityId([10, 15], map)).toBe(10); // unchanged
    });
  });

  // The Hollow Crypt's Rite of the Unquiet: Morthen stands at the altar with a
  // click capsule far wider than his body, on the line a player walks up to the
  // north Remembrance Candle from, so the ray reached him first and every click
  // on that candle selected the boss. A body the local player can only USE wins
  // the first click over the live mobs in front of it.
  describe('use-only encounter bodies', () => {
    const useOnly = (e: TestPickEntity): boolean => e.useOnly === true;
    const BOSS = 40;
    const ADD = 41;
    const CANDLE = 42;

    it('selects the usable body on the first click when a boss capsule is in front', () => {
      const map = entities([
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([BOSS, CANDLE], map, null, useOnly)).toBe(CANDLE);
      // A target held somewhere else changes nothing: the body still wins.
      expect(resolveDirectPickEntityId([BOSS, CANDLE], map, 99, useOnly)).toBe(CANDLE);
    });

    it('wins over every live mob in front of it, adds included', () => {
      const map = entities([
        { id: ADD, kind: 'mob' },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([ADD, BOSS, CANDLE], map, null, useOnly)).toBe(CANDLE);
    });

    it('cycles on to the next live target once the usable body is the current target', () => {
      const map = entities([
        { id: ADD, kind: 'mob' },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      // The ring is the body first, then the rest in ray order. With the body
      // BETWEEN two mobs on the ray that is a different ring from plain ray
      // order, so every step here would differ without the rule.
      expect(resolveDirectPickEntityId([BOSS, CANDLE, ADD], map, null, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([BOSS, CANDLE, ADD], map, CANDLE, useOnly)).toBe(BOSS);
      expect(resolveDirectPickEntityId([BOSS, CANDLE, ADD], map, BOSS, useOnly)).toBe(ADD);
      expect(resolveDirectPickEntityId([BOSS, CANDLE, ADD], map, ADD, useOnly)).toBe(CANDLE);
      // Without the rule the same clicks walk the ray: boss, candle, add.
      expect(resolveDirectPickEntityId([BOSS, CANDLE, ADD], map, CANDLE)).toBe(ADD);
      expect(resolveDirectPickEntityId([BOSS, CANDLE, ADD], map, BOSS)).toBe(CANDLE);
    });

    it('steps through the ring as before when the current target is itself in the stack', () => {
      // Not a first click: the player already holds a mob of this stack, so the
      // click means "the next one", exactly as overlap cycling always read it.
      // With the body last on the ray the ring is the old one rotated, so these
      // steps are unchanged; the body is reached when the ring comes round.
      const map = entities([
        { id: ADD, kind: 'mob' },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([ADD, BOSS, CANDLE], map, CANDLE, useOnly)).toBe(ADD);
      expect(resolveDirectPickEntityId([ADD, BOSS, CANDLE], map, ADD, useOnly)).toBe(BOSS);
      expect(resolveDirectPickEntityId([ADD, BOSS, CANDLE], map, BOSS, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([CANDLE, BOSS], map, CANDLE, useOnly)).toBe(BOSS);
      expect(resolveDirectPickEntityId([CANDLE, BOSS], map, BOSS, useOnly)).toBe(CANDLE);
    });

    it('wins over a leading lootable corpse and over the live mob behind that corpse', () => {
      const map = entities([
        { id: 9, kind: 'mob', dead: true, lootable: true },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([9, CANDLE], map, null, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([CANDLE, 9], map, null, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([9, BOSS, CANDLE], map, null, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([9, BOSS, CANDLE], map, CANDLE, useOnly)).toBe(BOSS);
      // With the body the only live hit it keeps the click (the #2787 rule):
      // a repeat click does not fall through to the corpse.
      expect(resolveDirectPickEntityId([9, CANDLE], map, CANDLE, useOnly)).toBe(CANDLE);
    });

    it('selects a usable body standing alone, and keeps it on a repeat click', () => {
      const map = entities([{ id: CANDLE, kind: 'mob', useOnly: true }]);
      expect(resolveDirectPickEntityId([CANDLE], map, null, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([CANDLE], map, CANDLE, useOnly)).toBe(CANDLE);
    });

    it('keeps two usable bodies in ray order ahead of the mobs', () => {
      const map = entities([
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
        { id: 43, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([BOSS, CANDLE, 43], map, null, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([BOSS, CANDLE, 43], map, CANDLE, useOnly)).toBe(43);
      expect(resolveDirectPickEntityId([BOSS, CANDLE, 43], map, 43, useOnly)).toBe(BOSS);
      // A mob between the two bodies on the ray: both bodies still come first
      // (plain ray order would step from the first body to the boss).
      expect(resolveDirectPickEntityId([CANDLE, BOSS, 43], map, CANDLE, useOnly)).toBe(43);
      expect(resolveDirectPickEntityId([CANDLE, BOSS, 43], map, 43, useOnly)).toBe(BOSS);
      expect(resolveDirectPickEntityId([CANDLE, BOSS, 43], map, CANDLE)).toBe(BOSS);
    });

    it('leaves the click with a live player who is the nearest hit', () => {
      // A healer clicking the party member who stands at the candle lighting it
      // must reach that player, not the body behind them.
      const map = entities([
        { id: 50, kind: 'player' },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([50, CANDLE], map, null, useOnly)).toBe(50);
      expect(resolveDirectPickEntityId([50, BOSS, CANDLE], map, null, useOnly)).toBe(50);
      // Ray order stands for the whole ring too, not only for the first pick.
      expect(resolveDirectPickEntityId([50, BOSS, CANDLE], map, CANDLE, useOnly)).toBe(50);
      expect(resolveDirectPickEntityId([50, BOSS, CANDLE], map, 50, useOnly)).toBe(BOSS);
      // A corpse in front of that player changes nothing: the player is still
      // the nearest LIVE hit.
      const withCorpse = entities([
        { id: 9, kind: 'mob', dead: true, lootable: true },
        { id: 50, kind: 'player' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([9, 50, CANDLE], withCorpse, null, useOnly)).toBe(50);
      // A player BEHIND the boss is not what the click landed on: the body wins.
      expect(resolveDirectPickEntityId([BOSS, 50, CANDLE], map, null, useOnly)).toBe(CANDLE);
      expect(resolveDirectPickEntityId([BOSS, 50, CANDLE], map, CANDLE, useOnly)).toBe(BOSS);
      expect(resolveDirectPickEntityId([BOSS, 50, CANDLE], map, BOSS, useOnly)).toBe(50);
    });

    it('a dead body no longer wins anything, lootable or not', () => {
      const spent = entities([
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', dead: true, useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([BOSS, CANDLE], spent, null, useOnly)).toBe(BOSS);
      expect(resolveDirectPickEntityId([CANDLE, BOSS], spent, null, useOnly)).toBe(BOSS);
      // A body that left a lootable corpse is a corpse like any other: it is
      // never asked about, and it does not pull the click off the live mobs.
      const corpse = entities([
        { id: ADD, kind: 'mob' },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', dead: true, lootable: true, useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([ADD, BOSS, CANDLE], corpse, null, useOnly)).toBe(ADD);
      expect(resolveDirectPickEntityId([CANDLE, ADD, BOSS], corpse, null, useOnly)).toBe(ADD);
    });

    it('only ever asks a live mob whether it is a usable body', () => {
      const asked: number[] = [];
      const map = entities([
        { id: 9, kind: 'mob', dead: true, lootable: true },
        { id: BOSS, kind: 'mob' },
        { id: 50, kind: 'player' },
      ]);
      const spy = (e: TestPickEntity): boolean => {
        asked.push(e.id);
        return true;
      };
      expect(resolveDirectPickEntityId([9, BOSS, 50], map, null, spy)).toBe(BOSS);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((id) => id === BOSS)).toBe(true);
    });

    it('keeps every older rule: an unlootable object still blocks, an npc still leads', () => {
      const map = entities([
        { id: 20, kind: 'object', lootable: false },
        { id: 15, kind: 'npc' },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([20, BOSS, CANDLE], map, null, useOnly)).toBeNull();
      expect(resolveDirectPickEntityId([15, BOSS, CANDLE], map, null, useOnly)).toBe(15);
      // A fallen party member lying nearest stays pickable for a resurrection.
      const fallen = entities([
        { id: 51, kind: 'player', dead: true },
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([51, BOSS, CANDLE], fallen, null, useOnly)).toBe(51);
    });

    it('without the predicate the nearest live mob still wins', () => {
      const map = entities([
        { id: BOSS, kind: 'mob' },
        { id: CANDLE, kind: 'mob', useOnly: true },
      ]);
      expect(resolveDirectPickEntityId([BOSS, CANDLE], map)).toBe(BOSS);
      expect(resolveDirectPickEntityId([BOSS, CANDLE], map, BOSS)).toBe(CANDLE);
    });
  });
});

// The renderer's entry (world_direct_pick.ts): the same resolver fed from the
// live world and the real content tables.
describe('resolveWorldDirectPick', () => {
  const at = { x: 0, y: 0, z: 0 };

  function mob(id: number, templateId: string): Entity {
    const template = MOBS[templateId];
    if (!template) throw new Error(`no mob template ${templateId}`);
    return createMob(id, template, template.minLevel, at);
  }

  /** The Remembrance Candle's body as the Rite stands it (morthen_candles.ts). */
  function candleBody(id: number): Entity {
    const body = mob(id, 'crypt_remembrance_candle');
    body.hostile = false;
    return body;
  }

  function world(list: Entity[], targetId: number | null = null) {
    const player = createPlayer(1, 'warrior', at, 'Tester');
    player.targetId = targetId;
    return { player: player as Entity | null, entities: new Map(list.map((e) => [e.id, e])) };
  }

  it('the Remembrance Candle wins the first click through Morthen, then cycles to him', () => {
    const morthen = mob(40, 'morthen');
    const bones = mob(41, 'marrow_restless_bones');
    const candle = candleBody(42);
    expect(morthen.hostile).toBe(true);
    expect(isUseOnlyBody(candle)).toBe(true);
    expect(isUseOnlyBody(morthen)).toBe(false);
    expect(resolveWorldDirectPick([40, 42], world([morthen, candle]))).toBe(42);
    expect(resolveWorldDirectPick([41, 40, 42], world([morthen, bones, candle]))).toBe(42);
    expect(resolveWorldDirectPick([40, 42], world([morthen, candle], 42))).toBe(40);
    expect(resolveWorldDirectPick([40, 42], world([morthen, candle], 40))).toBe(42);
  });

  it('a candle that cannot be used right now does not win', () => {
    const morthen = mob(40, 'morthen');
    const spent = candleBody(42);
    spent.hp = 0;
    expect(isUseOnlyBody(spent)).toBe(false);
    expect(resolveWorldDirectPick([40, 42], world([morthen, spent]))).toBe(40);
    // A dead local player can use nothing: the nearest live hit stands.
    const dead = world([morthen, candleBody(43)]);
    if (dead.player) dead.player.dead = true;
    expect(resolveWorldDirectPick([40, 43], dead)).toBe(40);
    // No local player yet (a world still booting): plain ray order, no throw.
    const booting = world([morthen, candleBody(43)]);
    booting.player = null;
    expect(resolveWorldDirectPick([40, 43], booting)).toBe(40);
  });

  it('being non-hostile is not enough: the body must carry a use', () => {
    // A friendly mob with no usable kit (a pet, an escortee, a held prop) must
    // never jump ahead of the boss in front of it.
    const morthen = mob(40, 'morthen');
    const friendly = mob(44, 'marrow_restless_bones');
    friendly.hostile = false;
    expect(MOBS.marrow_restless_bones?.trashKit?.usable).toBeUndefined();
    expect(isUseOnlyBody(friendly)).toBe(false);
    expect(resolveWorldDirectPick([40, 44], world([morthen, friendly]))).toBe(40);
  });

  it('a pick made to attack keeps plain ray order (the Attack Move key)', () => {
    const morthen = mob(40, 'morthen');
    const candle = candleBody(42);
    expect(resolveWorldDirectPick([40, 42], world([morthen, candle]), true)).toBe(40);
    expect(resolveWorldDirectPick([40, 42], world([morthen, candle]), false)).toBe(42);
  });

  it('a usable body the player can also attack (the Soul Brazier) competes nearest first', () => {
    // The Gravewyrm Sanctum's brazier is a hostile mob planted beside the
    // Pyre-Tender whose death snuffs it: a click on her must not be pulled onto
    // the brazier behind her. The interact press and its HUD prompt reach the
    // brazier without a click (src/game/nearby_interaction_core.ts).
    const tender = mob(40, 'broodsworn_pyre_tender');
    const brazier = mob(42, 'soul_brazier');
    expect(brazier.hostile).toBe(true);
    expect(MOBS.soul_brazier?.trashKit?.usable).toBeDefined();
    expect(isUseOnlyBody(brazier)).toBe(false);
    expect(resolveWorldDirectPick([40, 42], world([tender, brazier]))).toBe(40);
    expect(resolveWorldDirectPick([40, 42], world([tender, brazier], 40))).toBe(42);
  });

  it('Attack Move is the one caller that asks with attack intent', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    const attackMove = main.indexOf('function handleAttackMove(x: number, y: number): void {');
    expect(attackMove).toBeGreaterThanOrEqual(0);
    const pick = main.indexOf('renderer.pick(x, y, true)', attackMove);
    expect(pick).toBeGreaterThan(attackMove);
    expect(pick - attackMove).toBeLessThan(200);
    // The click, the hover and the tooltip all ask without it.
    expect(main.split('renderer.pick(x, y, true)').length).toBe(2);
    expect(main).toContain('let id = renderer.pickDirect(x, y);');
  });
});
