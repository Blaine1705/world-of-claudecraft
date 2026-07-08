import { describe, expect, it } from 'vitest';
import { DUNGEON_FLOOR_Y, isRiftPos, riftInstanceOrigin } from '../src/sim/data';
import { generateRiftFloor, riftPlatformLift } from '../src/sim/rift/rift_gen';
import type { RiftFloorPlan } from '../src/sim/rift/types';
import { Sim } from '../src/sim/sim';

// The rift's variety mechanics (v3): ice-slide, strength-boulder, sequence, the
// way-out beacon, lava, and the rolling-boulder hazard. Puzzle/hazard kind is a
// pure function of (seed, floorIndex), so we fish for a seed whose FLOOR 0 carries
// the mechanic under test (entering a rift lands you on floor 0), then drive it.

function seedWithFloor0(pred: (f: RiftFloorPlan) => boolean): number {
  for (let s = 1; s < 800; s++) {
    const f = generateRiftFloor(s, 20, 0);
    if (!f.isBoss && pred(f)) return s;
  }
  throw new Error('no seed found for the requested floor-0 mechanic');
}

function active(sim: Sim) {
  return sim.riftInstances.find((i) => i.partyKey !== null)!;
}

function killAll(sim: Sim): void {
  const inst = active(sim);
  for (const id of inst.mobIds) {
    const e = sim.entities.get(id);
    if (e) {
      e.hp = 0;
      e.dead = true;
    }
  }
}

// Enter a floor-0 rift. The rift's mobs are baseLevel 20 while the fresh test
// player is level 1, so we clear the trash to stop it interfering; `god` makes the
// player invulnerable for puzzle-solving cases (a dead player skips triggers). The
// damage tests pass god:false so hazard/roller hits register.
function enter(seed: number, { god = true }: { god?: boolean } = {}): Sim {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true, devCommands: true });
  sim.enterRift(seed, 20, sim.player.id);
  killAll(sim);
  sim.player.gm = god;
  return sim;
}

describe('rift mechanics: generator variety', () => {
  it('floor 0 across seeds surfaces every puzzle + hazard kind', () => {
    let ice = 0;
    let boulder = 0;
    let seq = 0;
    let pylons = 0;
    let hazards = 0;
    let rollers = 0;
    for (let s = 1; s <= 250; s++) {
      const f = generateRiftFloor(s, 20, 0);
      if (f.puzzle.kind === 'ice_slide') ice++;
      if (f.puzzle.kind === 'boulder_push') boulder++;
      if (f.puzzle.kind === 'sequence') seq++;
      if (f.puzzle.kind === 'rune_pylons') pylons++;
      if (f.hazards.length > 0) hazards++;
      if (f.rollers.length > 0) rollers++;
    }
    expect(ice, 'some floors are ice-slide').toBeGreaterThan(0);
    expect(boulder, 'some floors are boulder-push').toBeGreaterThan(0);
    expect(seq, 'some floors are sequence').toBeGreaterThan(0);
    expect(pylons, 'some floors are rune-pylons').toBeGreaterThan(0);
    expect(hazards, 'some floors have lava').toBeGreaterThan(0);
    expect(rollers, 'some floors have a rolling boulder').toBeGreaterThan(0);
  });

  it('boss floors never carry a puzzle, hazard, ice sheet, or roller', () => {
    let checked = 0;
    for (let s = 1; s <= 150; s++) {
      const fc = generateRiftFloor(s, 20, 0).floorCount;
      const boss = generateRiftFloor(s, 20, fc - 1);
      expect(boss.isBoss).toBe(true);
      expect(boss.puzzle.kind).toBe('none');
      expect(boss.hazards.length).toBe(0);
      expect(boss.rollers.length).toBe(0);
      expect(boss.iceZone).toBeNull();
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('an ice-slide floor has a non-null ice zone and a Frost Sigil goal on the spine', () => {
    const seed = seedWithFloor0((f) => f.puzzle.kind === 'ice_slide');
    const f = generateRiftFloor(seed, 20, 0);
    expect(f.iceZone).not.toBeNull();
    const goal = f.objects.find((o) => o.kind === 'ice_goal');
    expect(goal).toBeTruthy();
    expect(goal?.x).toBe(0); // reachable by a straight northward slide
  });
});

describe('rift mechanics: ice-slide goal', () => {
  it('stopping on the Frost Sigil solves the floor', () => {
    const seed = seedWithFloor0((f) => f.puzzle.kind === 'ice_slide');
    const sim = enter(seed);
    const inst = active(sim);
    const floor = generateRiftFloor(seed, 20, 0);
    const goal = floor.objects.find((o) => o.kind === 'ice_goal')!;
    const origin = riftInstanceOrigin(inst.slot, 0);
    expect(inst.puzzleSolved).toBe(false);
    // Stand (not moving) on the goal tile: the proximity check solves the floor.
    sim.player.pos = { ...sim.player.pos, x: origin.x + goal.x, z: origin.z + goal.z };
    sim.player.prevPos = { ...sim.player.pos };
    sim.player.hp = sim.player.maxHp;
    sim.tick();
    expect(inst.puzzleSolved).toBe(true);
  });
});

describe('rift mechanics: strength boulders', () => {
  it('every boulder resting on a socket pad solves the floor and marks it placed', () => {
    const seed = seedWithFloor0(
      (f) => f.puzzle.kind === 'boulder_push' && f.objects.some((o) => o.kind === 'boulder'),
    );
    const sim = enter(seed);
    const inst = active(sim);
    const origin = riftInstanceOrigin(inst.slot, 0);
    expect(inst.boulderIds.length).toBeGreaterThan(0);
    expect(inst.boulderPads.length).toBe(inst.boulderIds.length);
    expect(inst.puzzleSolved).toBe(false);
    // Drop each boulder onto its socket, then let the 1 Hz gate check run.
    for (let i = 0; i < inst.boulderIds.length; i++) {
      const b = sim.entities.get(inst.boulderIds[i])!;
      const pad = inst.boulderPads[i];
      b.pos = { ...b.pos, x: origin.x + pad.x, z: origin.z + pad.z };
    }
    for (let i = 0; i < 21; i++) {
      sim.player.hp = sim.player.maxHp;
      sim.tick();
    }
    expect(inst.puzzleSolved).toBe(true);
    for (const id of inst.boulderIds) {
      expect(sim.entities.get(id)?.templateId).toBe('rift_boulder_placed');
    }
  });
});

describe('rift mechanics: sequence runes', () => {
  it('stepping the runes south-to-north solves it; a skipped step resets progress', () => {
    const seed = seedWithFloor0(
      (f) =>
        f.puzzle.kind === 'sequence' && f.objects.filter((o) => o.kind === 'seq_rune').length >= 3,
    );
    const sim = enter(seed);
    const inst = active(sim);
    const stepOnto = (i: number) => {
      const rune = sim.entities.get(inst.seqRuneIds[i])!;
      sim.player.pos = { ...rune.pos };
      sim.player.prevPos = { ...sim.player.pos };
      sim.player.hp = sim.player.maxHp;
      sim.tick();
    };

    // Wrong order first: step rune 0 (ok), then skip ahead to rune 2 -> reset.
    stepOnto(0);
    expect(inst.seqStep).toBe(1);
    stepOnto(2);
    expect(inst.seqStep).toBe(0);

    // Correct order start-to-finish solves it.
    for (let i = 0; i < inst.seqRuneIds.length; i++) {
      stepOnto(i);
      expect(inst.seqStep).toBe(i + 1);
    }
    expect(inst.puzzleSolved).toBe(true);
  });
});

describe('rift mechanics: way-out beacon', () => {
  it('walking onto the beacon returns the player to the overworld', () => {
    const sim = enter(4242);
    const inst = active(sim);
    expect(inst.beaconId).not.toBeNull();
    expect(isRiftPos(sim.player.pos.x)).toBe(true);
    const beacon = sim.entities.get(inst.beaconId!)!;
    sim.player.pos = { ...beacon.pos };
    sim.player.prevPos = { ...sim.player.pos };
    sim.player.hp = sim.player.maxHp;
    sim.tick();
    expect(isRiftPos(sim.player.pos.x)).toBe(false);
  });
});

describe('rift mechanics: lava hazard', () => {
  it('standing in a molten band chips HP (the shared delve blackwater model)', () => {
    const seed = seedWithFloor0((f) => f.hazards.length > 0);
    const sim = enter(seed, { god: false });
    const inst = active(sim);
    const floor = generateRiftFloor(seed, 20, 0);
    const hz = floor.hazards[0];
    const origin = riftInstanceOrigin(inst.slot, 0);
    sim.player.hp = sim.player.maxHp;
    // Pin the player in the band (grounded) across a 1 Hz hazard boundary.
    for (let i = 0; i < 21; i++) {
      sim.player.pos = { ...sim.player.pos, x: origin.x + hz.x, z: origin.z + hz.z };
      sim.player.jumping = false;
      sim.tick();
    }
    expect(sim.player.hp).toBeLessThan(sim.player.maxHp);
  });
});

describe('rift mechanics: verticality (raised sanctum tier)', () => {
  it('the platform lift is 0 in the nave, ramps up monotonically, and flattens at height', () => {
    const seed = seedWithFloor0((f) => f.platform !== null);
    const p = generateRiftFloor(seed, 20, 0).platform!;
    expect(riftPlatformLift(p, p.rampZ0 - 5)).toBe(0); // nave: flat
    expect(riftPlatformLift(p, p.rampZ0)).toBe(0); // stair foot
    expect(riftPlatformLift(p, p.rampZ1)).toBeCloseTo(p.height); // stair top
    expect(riftPlatformLift(p, p.rampZ1 + 20)).toBe(p.height); // deck: flat raised
    const mid = riftPlatformLift(p, (p.rampZ0 + p.rampZ1) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(p.height);
  });

  it('boss floors and some non-boss floors generate a raised platform', () => {
    let bossWith = 0;
    let nonBossWith = 0;
    for (let s = 1; s <= 150; s++) {
      const fc = generateRiftFloor(s, 20, 0).floorCount;
      if (generateRiftFloor(s, 20, fc - 1).platform) bossWith++;
      for (let fi = 0; fi < fc - 1; fi++) {
        if (generateRiftFloor(s, 20, fi).platform) nonBossWith++;
      }
    }
    expect(bossWith, 'boss floors get the grand sanctum').toBeGreaterThan(0);
    expect(nonBossWith, 'some nave floors are raised too').toBeGreaterThan(0);
  });

  it('standing on the rear tier lifts the player Y; the nave stays flat', () => {
    const seed = seedWithFloor0((f) => f.platform !== null);
    const sim = enter(seed);
    const inst = active(sim);
    const floor = generateRiftFloor(seed, 20, 0);
    const plat = floor.platform!;
    const origin = riftInstanceOrigin(inst.slot, 0);
    // On the raised rear deck (north of the stairs): the post-motion lift raises Y.
    // (Teleports land at the flat floor Y, like groundPos/knockback do in play.)
    sim.player.pos = { x: origin.x, y: DUNGEON_FLOOR_Y, z: origin.z + plat.rampZ1 + 4 };
    sim.player.prevPos = { ...sim.player.pos };
    sim.tick();
    expect(sim.player.pos.y).toBeCloseTo(DUNGEON_FLOOR_Y + plat.height, 1);
    // Back down in the nave (south of the stairs): flat floor.
    sim.player.pos = { x: origin.x, y: DUNGEON_FLOOR_Y, z: origin.z + plat.rampZ0 - 8 };
    sim.player.prevPos = { ...sim.player.pos };
    sim.tick();
    expect(sim.player.pos.y).toBeCloseTo(DUNGEON_FLOOR_Y, 1);
  });
});

describe('rift mechanics: rolling boulder', () => {
  it('the boulder rolls down its lane and bowls over a player it overtakes', () => {
    const seed = seedWithFloor0((f) => f.rollers.length > 0);
    const sim = enter(seed, { god: false });
    const inst = active(sim);
    expect(inst.rollerIds.length).toBeGreaterThan(0);

    // Motion: with the player parked at the entry (clear of the lane), one tick
    // advances the boulder down its lane.
    const startZ = sim.entities.get(inst.rollerIds[0])!.pos.z;
    sim.player.hp = sim.player.maxHp;
    sim.tick();
    const roller = sim.entities.get(inst.rollerIds[0])!;
    expect(roller.pos.z).toBeGreaterThan(startZ);

    // Overlap: standing in its path chips HP, shoves the player aside, and arms
    // the hit cooldown so one pass costs one hit.
    sim.player.gm = false;
    sim.player.jumping = false;
    sim.player.pos = { ...sim.player.pos, x: roller.pos.x, z: roller.pos.z };
    sim.player.prevPos = { ...sim.player.pos };
    sim.player.hp = sim.player.maxHp;
    const beforeHp = sim.player.hp;
    sim.tick();
    expect(sim.player.hp).toBeLessThan(beforeHp);
    expect(sim.player.riftRollerUntil ?? 0).toBeGreaterThan(0);
    // Shoved clear of the lane centre (dodged sideways into the aisle).
    expect(Math.abs(sim.player.pos.x - roller.pos.x)).toBeGreaterThan(0.5);
  });
});
