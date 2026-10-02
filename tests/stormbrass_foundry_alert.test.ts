// The Stormbrass Foundry's encounter alert (src/ui/hud/dungeon/
// foundry_alert_view.ts): the Storm Cell carrier's line follows the Core
// Hatch's state and names the drop key, a Target Lock says keep moving, a
// Storm Cell on the floor asks for a taker, the Voltaic Warden's plating says
// which face is up and which damage lands to everyone near it (the drones
// line, the flip countdown, the Stored Charge bar), and the priority is cell,
// mark, Proof Shot, floor cell, plating. The scene scan (foundry_alert_scene.ts)
// and the floating "Turned aside" word (foundry_fct.ts) ride here too. Driven
// from real fights as well, so the view reads exactly the auras and objects
// the sim mirrors. (The Proof Shot alert: stormbrass_foundry_rangewarden.test.ts.)

import { describe, expect, it } from 'vitest';
import { MAIN_LINE_BELTS } from '../src/sim/content/stormbrass_foundry_layout';
import {
  ARC_DRONE_ID,
  DRAFT_CELL_CARRY,
  FOUNDRY_CELL_TEMPLATES,
  FOUNDRY_HATCH_TEMPLATES,
  hatchRingCentre,
  PRIME_DRAFT_ID,
  RANGE_TARGET_LOCK,
  TOCK_ID,
  TOCK_SCALDING_VENTS,
  TOCK_TUNING,
  RANGEWARDEN_ID,
  VOLTAIC_CHARGED,
  VOLTAIC_FLIP,
  VOLTAIC_GROUNDED,
  VOLTAIC_STORED,
  VOLTAIC_TUNING,
  VOLTAIC_WARDEN_ID,
} from '../src/sim/encounters/stormbrass_foundry';
import { chargeCycle } from '../src/sim/encounters/stormbrass_foundry/prime_draft';
import type { Entity } from '../src/sim/types';
import { auraEffectDescriptor } from '../src/ui/aura_effect';
import { spellFxCue } from '../src/ui/combat_sfx';
import { launchPlatedDrones } from '../src/sim/encounters/stormbrass_foundry/voltaic_warden';
import { foundryObjectLabel } from '../src/ui/entity_display_core';
import {
  FoundryAlertSceneScan,
  type FoundrySceneEntity,
} from '../src/ui/hud/dungeon/foundry_alert_scene';
import {
  buildFoundryAlertView,
  FLOOR_CELL_REACH,
  type FoundryAlertEntity,
  type FoundryAlertInput,
  type FoundryAlertScene,
  WARDEN_REACH,
} from '../src/ui/hud/dungeon/foundry_alert_view';
import { fctAvoidanceText, platingTurnedAside } from '../src/ui/hud/dungeon/foundry_fct';
import { setLanguage, t } from '../src/ui/i18n';
import { boss, engage, fight, local, objects, put, run } from './helpers/foundry_fight';

setLanguage('en');

function input(over: Partial<FoundryAlertInput>): FoundryAlertInput {
  return {
    auras: [],
    targetId: null,
    entity: () => null,
    interactKey: 'F',
    touch: false,
    ...over,
  };
}

function scene(over: Partial<FoundryAlertScene>): FoundryAlertScene {
  return { rangewarden: null, warden: null, draft: null, drones: [], cells: [], ...over };
}

function shown(v: ReturnType<typeof buildFoundryAlertView>) {
  if (!v.visible) throw new Error('hidden');
  return v;
}

describe('the Foundry alert view', () => {
  it('hides when no Foundry mechanic concerns the player', () => {
    expect(buildFoundryAlertView(input({})).visible).toBe(false);
  });

  it('a cell carrier reads the hatch: shut, shuddering, open; names the drop key', () => {
    const hatches: Record<number, FoundryAlertEntity> = {
      1: { templateId: FOUNDRY_HATCH_TEMPLATES.closed },
      2: { templateId: FOUNDRY_HATCH_TEMPLATES.warn },
      3: { templateId: FOUNDRY_HATCH_TEMPLATES.open },
    };
    const kinds = [1, 2, 3].map((id) => {
      const v = buildFoundryAlertView(
        input({
          auras: [{ id: DRAFT_CELL_CARRY, sourceId: id, remaining: 6, duration: 15, stacks: 35 }],
          entity: (e) => hatches[e],
        }),
      );
      if (!v.visible) throw new Error('hidden');
      return v;
    });
    expect(kinds.map((v) => v.kind)).toEqual(['cell-closed', 'cell-warn', 'cell-open']);
    expect(kinds[2].line).toBe(t('hudChrome.foundryAlert.cellOpenLine'));
    expect(kinds[0].title).toContain('35');
    expect(kinds[0].key).toBe('F');
    expect(kinds[0].hint).toBe(t('hudChrome.foundryAlert.dropKey', { key: 'F' }));
    expect(kinds[0].pressable).toBe(true);
    expect(kinds[0].progress).toBeCloseTo(6 / 15, 6);
    const tap = buildFoundryAlertView(
      input({
        auras: [{ id: DRAFT_CELL_CARRY, sourceId: 1 }],
        touch: true,
        entity: (e) => hatches[e],
      }),
    );
    if (!tap.visible) throw new Error('hidden');
    expect(tap.hint).toBe(t('hudChrome.foundryAlert.dropTap'));
    expect(tap.key).toBe('');
  });

  it('a Target Lock says keep moving, with its time left', () => {
    const v = buildFoundryAlertView(
      input({ auras: [{ id: RANGE_TARGET_LOCK, remaining: 4, duration: 8 }] }),
    );
    if (!v.visible) throw new Error('hidden');
    expect(v.kind).toBe('locked');
    expect(v.progress).toBe(0.5);
    expect(v.pressable).toBe(false);
  });

  it('a plated target reads its face, the split back, and the Stored Charge', () => {
    const warden: FoundryAlertEntity = {
      auras: [
        { id: VOLTAIC_CHARGED, value2: 1 },
        { id: VOLTAIC_STORED, stacks: 500, value2: 2000 },
      ],
    };
    const drone: FoundryAlertEntity = { auras: [{ id: VOLTAIC_GROUNDED, value2: 0 }] };
    const w = buildFoundryAlertView(input({ targetId: 7, entity: () => warden }));
    if (!w.visible) throw new Error('hidden');
    expect(w.kind).toBe('charged');
    expect(w.hint).toBe(t('hudChrome.foundryAlert.splitLine'));
    expect(w.progress).toBe(0.25);
    const d = buildFoundryAlertView(input({ targetId: 8, entity: () => drone }));
    if (!d.visible) throw new Error('hidden');
    expect(d.kind).toBe('grounded');
    expect(d.hint).toBe('');
    expect(d.progress).toBeNull();
  });

  it('the cell outranks the mark, the mark outranks the plating', () => {
    const plated: FoundryAlertEntity = { auras: [{ id: VOLTAIC_GROUNDED }] };
    const both = buildFoundryAlertView(
      input({
        auras: [{ id: RANGE_TARGET_LOCK }, { id: DRAFT_CELL_CARRY, sourceId: 1 }],
        targetId: 2,
        entity: (id) => (id === 2 ? plated : { templateId: FOUNDRY_HATCH_TEMPLATES.open }),
      }),
    );
    expect(both.visible && both.kind).toBe('cell-open');
    const mark = buildFoundryAlertView(
      input({ auras: [{ id: RANGE_TARGET_LOCK }], targetId: 2, entity: () => plated }),
    );
    expect(mark.visible && mark.kind).toBe('locked');
  });

  it('a Storm Cell on the floor nearby asks for a taker; a rolling or far one does not', () => {
    const at = (x: number, templateId: string): FoundryAlertEntity => ({
      templateId,
      pos: { x, z: 0 },
    });
    const view = (cells: FoundryAlertEntity[], touch = false) =>
      buildFoundryAlertView(input({ selfPos: { x: 0, z: 0 }, touch, scene: scene({ cells }) }));
    const v = shown(view([at(FLOOR_CELL_REACH - 1, FOUNDRY_CELL_TEMPLATES.ready)]));
    expect(v.kind).toBe('floorcell');
    expect(v.title).toBe(t('hudChrome.foundryAlert.floorCellTitle'));
    expect(v.line).toBe(t('hudChrome.foundryAlert.floorCellLine'));
    expect(v.hint).toBe(t('hudChrome.foundryAlert.floorCellHint'));
    expect(v.progress).toBeNull();
    expect(v.pressable).toBe(false);
    expect(shown(view([at(3, FOUNDRY_CELL_TEMPLATES.ready)], true)).line).toBe(
      t('hudChrome.foundryAlert.floorCellLineTouch'),
    );
    // Too far, or still rolling out of a jammed rack: nothing to take yet.
    expect(view([at(FLOOR_CELL_REACH + 1, FOUNDRY_CELL_TEMPLATES.ready)]).visible).toBe(false);
    expect(view([at(3, FOUNDRY_CELL_TEMPLATES.rolling)]).visible).toBe(false);
    // Carrying one outranks the one on the floor.
    const carrying = buildFoundryAlertView(
      input({
        auras: [{ id: DRAFT_CELL_CARRY, sourceId: 1 }],
        selfPos: { x: 0, z: 0 },
        scene: scene({ cells: [at(3, FOUNDRY_CELL_TEMPLATES.ready)] }),
      }),
    );
    expect(shown(carrying).kind).toBe('cell-closed');
  });

  it('the plating reads to everyone near the Warden, targeted or not: face, damage kind, bank', () => {
    const warden: FoundryAlertEntity = {
      templateId: VOLTAIC_WARDEN_ID,
      pos: { x: 0, z: 0 },
      auras: [
        { id: VOLTAIC_GROUNDED, value2: 0, remaining: 7.2, duration: 15 },
        { id: VOLTAIC_STORED, stacks: 900, value2: 2000 },
      ],
    };
    const view = (selfX: number, over: Partial<FoundryAlertScene> = {}) =>
      buildFoundryAlertView(
        input({ selfPos: { x: selfX, z: 0 }, scene: scene({ warden, ...over }) }),
      );
    const v = shown(view(20));
    expect(v.kind).toBe('grounded');
    expect(v.title).toBe(t('hudChrome.foundryAlert.groundedTitle'));
    expect(v.title).toBe('Copper face: weapons land');
    // No drones up: the plain line.
    expect(v.line).toBe(t('hudChrome.foundryAlert.groundedLine'));
    // The flip countdown, whole seconds, rounded up.
    expect(v.hint).toBe(t('hudChrome.foundryAlert.flipIn', { seconds: '8' }));
    expect(v.progress).toBeCloseTo(0.45, 6);
    expect(v.barLabel).toBe(t('hudChrome.foundryAlert.storedAria', { pct: '45%' }));
    expect(v.barLabel).toBe('Stored Charge 45%: released at the flip');
    expect(v.progressAria).toBe(v.barLabel);
    // Off the crown: no readout.
    expect(view(WARDEN_REACH + 1).visible).toBe(false);
    // A fallen Warden, or one out of its fight (no face): nothing.
    expect(
      buildFoundryAlertView(
        input({ selfPos: { x: 5, z: 0 }, scene: scene({ warden: { ...warden, dead: true } }) }),
      ).visible,
    ).toBe(false);
    expect(
      buildFoundryAlertView(
        input({ selfPos: { x: 5, z: 0 }, scene: scene({ warden: { ...warden, auras: [] } }) }),
      ).visible,
    ).toBe(false);
  });

  it('with plated drones up it sends the turned-aside damage to them; the blue face mirrors it', () => {
    const drone: FoundryAlertEntity = {
      templateId: ARC_DRONE_ID,
      auras: [{ id: VOLTAIC_CHARGED, value2: 0 }],
    };
    const bare: FoundryAlertEntity = { templateId: ARC_DRONE_ID, auras: [] };
    const fallen: FoundryAlertEntity = { ...drone, dead: true };
    const warden = (face: string): FoundryAlertEntity => ({
      templateId: VOLTAIC_WARDEN_ID,
      pos: { x: 0, z: 0 },
      auras: [{ id: face, value2: 0, remaining: 3.4, duration: 15 }],
    });
    const view = (face: string, drones: FoundryAlertEntity[]) =>
      shown(
        buildFoundryAlertView(
          input({ selfPos: { x: 4, z: 0 }, scene: scene({ warden: warden(face), drones }) }),
        ),
      );
    const g = view(VOLTAIC_GROUNDED, [bare, drone]);
    expect(g.line).toBe(t('hudChrome.foundryAlert.groundedDronesLine'));
    expect(g.line).toBe('Spells are turned aside: hit the drones');
    const c = view(VOLTAIC_CHARGED, [drone]);
    expect(c.kind).toBe('charged');
    expect(c.title).toBe('Blue face: spells land');
    expect(c.line).toBe('Weapons are turned aside: hit the drones');
    expect(c.hint).toBe(t('hudChrome.foundryAlert.flipIn', { seconds: '4' }));
    // Only unplated or fallen drones: no job to hand out.
    expect(view(VOLTAIC_GROUNDED, [bare, fallen]).line).toBe(
      t('hudChrome.foundryAlert.groundedLine'),
    );
  });

  it('the rattle bar reads as the flip itself; heroic names the split back with the countdown', () => {
    const flipping: FoundryAlertEntity = {
      templateId: VOLTAIC_WARDEN_ID,
      pos: { x: 0, z: 0 },
      castingAbility: VOLTAIC_FLIP,
      auras: [{ id: VOLTAIC_GROUNDED, value2: 1, remaining: 2, duration: 10 }],
    };
    const at = { selfPos: { x: 4, z: 0 } };
    const now = shown(buildFoundryAlertView(input({ ...at, scene: scene({ warden: flipping }) })));
    expect(now.hint).toBe(t('hudChrome.foundryAlert.flipNow'));
    const split = shown(
      buildFoundryAlertView(
        input({ ...at, scene: scene({ warden: { ...flipping, castingAbility: null } }) }),
      ),
    );
    expect(split.hint).toBe(t('hudChrome.foundryAlert.flipInSplit', { seconds: '2' }));
  });

  it('a plated target outranks the Warden nearby (the drone you are hitting)', () => {
    const warden: FoundryAlertEntity = {
      templateId: VOLTAIC_WARDEN_ID,
      pos: { x: 0, z: 0 },
      auras: [{ id: VOLTAIC_GROUNDED, value2: 0, remaining: 9, duration: 15 }],
    };
    const drone: FoundryAlertEntity = {
      templateId: ARC_DRONE_ID,
      auras: [{ id: VOLTAIC_CHARGED, value2: 0, remaining: 9, duration: 15 }],
    };
    const v = shown(
      buildFoundryAlertView(
        input({
          targetId: 9,
          entity: () => drone,
          selfPos: { x: 4, z: 0 },
          scene: scene({ warden, drones: [drone] }),
        }),
      ),
    );
    expect(v.kind).toBe('charged');
    // On the drone itself: its own plain line, no bank.
    expect(v.line).toBe(t('hudChrome.foundryAlert.chargedLine'));
    expect(v.progress).toBeNull();
    expect(v.barLabel).toBe('');
    expect(v.hint).toBe(t('hudChrome.foundryAlert.flipIn', { seconds: '9' }));
  });

  it('names the cell and the hatch for the target frame', () => {
    expect(foundryObjectLabel(FOUNDRY_CELL_TEMPLATES.ready, null)).toBe(
      t('hudChrome.foundryAlert.cellName'),
    );
    expect(foundryObjectLabel(FOUNDRY_HATCH_TEMPLATES.open, null)).toBe(
      t('hudChrome.foundryAlert.hatchName'),
    );
    expect(foundryObjectLabel('ground_something', 'something')).toBeNull();
  });
});

describe('the Foundry alert scene scan', () => {
  function world(list: (FoundrySceneEntity & { id: number })[], version: number) {
    return { entities: new Map(list.map((e) => [e.id, e])), entityRosterVersion: version };
  }

  it('finds the bosses, the drones and the cells, and only walks on a roster change', () => {
    const scan = new FoundryAlertSceneScan();
    const cell: FoundrySceneEntity & { id: number } = {
      id: 4,
      kind: 'object',
      templateId: FOUNDRY_CELL_TEMPLATES.rolling,
    };
    const list = [
      { id: 1, kind: 'mob', templateId: RANGEWARDEN_ID },
      { id: 2, kind: 'mob', templateId: VOLTAIC_WARDEN_ID },
      { id: 3, kind: 'mob', templateId: ARC_DRONE_ID },
      cell,
      { id: 5, kind: 'mob', templateId: PRIME_DRAFT_ID },
      { id: 6, kind: 'object', templateId: FOUNDRY_HATCH_TEMPLATES.open },
      { id: 7, kind: 'player', templateId: '' },
    ];
    const w = world(list, 1);
    const s = scan.update(w);
    expect(s.rangewarden?.id).toBe(1);
    expect(s.warden?.id).toBe(2);
    expect(s.draft?.id).toBe(5);
    expect(s.drones.map((d) => d.id)).toEqual([3]);
    expect(s.cells.map((c) => c.id)).toEqual([4]);
    // Same roster: the same scene, not walked again (a body added behind its
    // back is not seen), and a template change reads live off the reference.
    w.entities.set(8, { id: 8, kind: 'mob', templateId: ARC_DRONE_ID });
    cell.templateId = FOUNDRY_CELL_TEMPLATES.ready;
    const again = scan.update(w);
    expect(again).toBe(s);
    expect(again.drones).toHaveLength(1);
    expect(again.cells[0].templateId).toBe(FOUNDRY_CELL_TEMPLATES.ready);
    // The roster moved: walked again.
    w.entityRosterVersion = 2;
    expect(scan.update(w).drones).toHaveLength(2);
    // Everything gone: an empty scene.
    const empty = scan.update(world([], 3));
    expect(empty.rangewarden).toBeNull();
    expect(empty.warden).toBeNull();
    expect(empty.draft).toBeNull();
    expect(empty.drones).toHaveLength(0);
    expect(empty.cells).toHaveLength(0);
  });

  it('prefers a living boss over a corpse of the same template', () => {
    const scan = new FoundryAlertSceneScan();
    const s = scan.update(
      world(
        [
          { id: 1, kind: 'mob', templateId: VOLTAIC_WARDEN_ID, dead: true },
          { id: 2, kind: 'mob', templateId: VOLTAIC_WARDEN_ID },
        ],
        1,
      ),
    );
    expect(s.warden?.id).toBe(2);
  });
});

describe('the floating avoidance word', () => {
  it('keeps the classic words', () => {
    expect(fctAvoidanceText('miss')).toBe(t('hud.combat.floatingMiss'));
    expect(fctAvoidanceText('dodge')).toBe(t('hud.combat.floatingDodge'));
    expect(fctAvoidanceText('parry')).toBe(t('hud.combat.floatingParry'));
    expect(fctAvoidanceText('evade')).toBe(t('hud.combat.floatingEvade'));
    expect(fctAvoidanceText('resist', [], 'frost')).toBe(t('hud.combat.floatingResist'));
    expect(fctAvoidanceText('resist', null, 'frost')).toBe(t('hud.combat.floatingResist'));
  });

  it('says Turned aside when the plating refused the hit, Resist when it was a true resist', () => {
    const grounded = [{ id: VOLTAIC_GROUNDED, value2: 0 }];
    const charged = [{ id: VOLTAIC_CHARGED, value2: 0 }];
    const split = [{ id: VOLTAIC_GROUNDED, value2: 1 }];
    const aside = t('hudChrome.foundryAlert.turnedAside');
    expect(aside).toBe('Turned aside');
    // The wrong kind for the face that is up.
    expect(fctAvoidanceText('resist', grounded, 'frost')).toBe(aside);
    expect(fctAvoidanceText('resist', charged, 'physical')).toBe(aside);
    // The right kind, resisted the ordinary way.
    expect(fctAvoidanceText('resist', charged, 'frost')).toBe(t('hud.combat.floatingResist'));
    expect(platingTurnedAside(grounded, 'physical')).toBe(false);
    // Split Plating: the back half wears the other face.
    expect(fctAvoidanceText('resist', split, 'physical')).toBe(aside);
    // A miss on a plated body is still a miss.
    expect(fctAvoidanceText('miss', grounded, 'frost')).toBe(t('hud.combat.floatingMiss'));
  });
});

describe('the Foundry alert from a real Voltaic Warden fight', () => {
  it('reads the live face, the countdown, the drones and the flip off the mirrored bodies', () => {
    const f = fight();
    const b = boss(f, VOLTAIC_WARDEN_ID);
    put(f, b, 82, 24);
    put(f, f.tank, 82, 27);
    put(f, f.others[0], 70, 24);
    engage(f, b);
    const scan = new FoundryAlertSceneScan();
    const caster = f.others[0];
    caster.targetId = null;
    const view = () =>
      buildFoundryAlertView({
        auras: caster.auras,
        targetId: caster.targetId,
        entity: (id) => f.sim.ctx.entities.get(id),
        interactKey: 'F',
        touch: false,
        selfId: caster.id,
        selfPos: caster.pos,
        scene: scan.update(f.sim),
      });
    run(f, 5);
    const first = shown(view());
    expect(first.kind).toBe('grounded');
    expect(first.hint).toBe(
      t('hudChrome.foundryAlert.flipIn', { seconds: String(VOLTAIC_TUNING.flipEvery - 5) }),
    );
    expect(first.line).toBe(t('hudChrome.foundryAlert.groundedLine'));
    // A spell is turned aside and banked: the bar fills, the word floats.
    f.sim.ctx.dealDamage(caster, b, 500, false, 'frost', 'Test Bolt', 'hit');
    expect(shown(view()).progress).toBeCloseTo(0.25, 6);
    expect(fctAvoidanceText('resist', b.auras, 'frost')).toBe('Turned aside');
    const st = b.foundryFight;
    if (st?.kind !== 'voltaic') throw new Error('state');
    launchPlatedDrones(f.sim.ctx, f.inst, b, st);
    run(f, 0.1);
    expect(shown(view()).line).toBe(t('hudChrome.foundryAlert.groundedDronesLine'));
    // The rattle, then the other face.
    run(f, VOLTAIC_TUNING.flipEvery - VOLTAIC_TUNING.flipCast - 5);
    expect(shown(view()).hint).toBe(t('hudChrome.foundryAlert.flipNow'));
    run(f, VOLTAIC_TUNING.flipCast + 0.1);
    const flipped = shown(view());
    expect(flipped.kind).toBe('charged');
    expect(flipped.line).toBe(t('hudChrome.foundryAlert.chargedDronesLine'));
  });
});

describe('the Foundry alert from a real Prime Draft fight', () => {
  it('a cell on the floor calls for a taker, then the carry takes over', () => {
    const f = fight();
    const b = boss(f, PRIME_DRAFT_ID);
    put(f, b, 0, 213);
    b.facing = Math.PI;
    put(f, f.tank, 0, 210);
    engage(f, b);
    run(f, 3.2);
    const st = b.foundryFight;
    if (st?.kind !== 'prime_draft') throw new Error('state');
    const scan = new FoundryAlertSceneScan();
    const runner = f.others[0];
    const view = () =>
      buildFoundryAlertView({
        auras: runner.auras,
        targetId: null,
        entity: (id) => f.sim.ctx.entities.get(id),
        interactKey: 'F',
        touch: false,
        selfId: runner.id,
        selfPos: runner.pos,
        scene: scan.update(f.sim),
      });
    put(f, runner, 0, 200);
    expect(view().visible).toBe(false);
    chargeCycle(f.sim.ctx, f.inst, b, st);
    expect(shown(view()).kind).toBe('floorcell');
    const [cell] = objects(f, FOUNDRY_CELL_TEMPLATES.ready);
    put(f, runner, local(f, cell).x, local(f, cell).z);
    f.sim.pickUpObject(cell.id, runner.id);
    expect(shown(view()).kind).toBe('cell-closed');
  });

  it('follows the carried cell from the shut hatch to the open one', () => {
    const f = fight();
    const b = boss(f, PRIME_DRAFT_ID);
    put(f, b, 0, 213);
    b.facing = Math.PI;
    put(f, f.tank, 0, 210);
    engage(f, b);
    run(f, 3.2);
    const st = b.foundryFight;
    if (st?.kind !== 'prime_draft') throw new Error('state');
    chargeCycle(f.sim.ctx, f.inst, b, st);
    const [cell] = objects(f, FOUNDRY_CELL_TEMPLATES.ready);
    const runner = f.others[0];
    put(f, runner, local(f, cell).x, local(f, cell).z);
    f.sim.pickUpObject(cell.id, runner.id);
    const view = () =>
      buildFoundryAlertView({
        auras: runner.auras,
        targetId: runner.targetId,
        entity: (id) => f.sim.ctx.entities.get(id),
        interactKey: 'F',
        touch: false,
      });
    expect(view().visible && (view() as { kind: string }).kind).toBe('cell-closed');
    run(f, 5.2, () => put(f, runner, -8, 200));
    expect(view().visible && (view() as { kind: string }).kind).toBe('cell-open');
    const c = hatchRingCentre(b);
    run(f, 0.2, () => put(f, runner, c.x - f.ox, c.z - f.oz));
    expect(view().visible).toBe(false);
  });
});

describe("the Foundry alert on Tock's Scalding Vents", () => {
  it('a walkway stander is told to get onto a belt: warning first, then the scald', () => {
    const warn = buildFoundryAlertView(
      input({ auras: [{ id: TOCK_SCALDING_VENTS, value2: 0, remaining: 0.75, duration: 1.5 }] }),
    );
    if (!warn.visible) throw new Error('hidden');
    expect(warn.kind).toBe('vent-warn');
    expect(warn.title).toBe(t('hudChrome.foundryAlert.ventWarnTitle'));
    expect(warn.line).toBe(t('hudChrome.foundryAlert.ventWarnLine'));
    expect(warn.progress).toBeCloseTo(0.5, 6);
    expect(warn.pressable).toBe(false);
    const scald = buildFoundryAlertView(
      input({ auras: [{ id: TOCK_SCALDING_VENTS, value2: 1, remaining: 4, duration: 5 }] }),
    );
    if (!scald.visible) throw new Error('hidden');
    expect(scald.kind).toBe('vent-scald');
    expect(scald.title).toBe(t('hudChrome.foundryAlert.ventScaldTitle'));
    expect(scald.line).toBe(t('hudChrome.foundryAlert.ventScaldLine'));
    expect(scald.progress).toBeCloseTo(0.8, 6);
  });

  it('the vents outrank a plated target; nobody off the walkways sees them', () => {
    const plated: FoundryAlertEntity = { auras: [{ id: VOLTAIC_GROUNDED }] };
    const v = buildFoundryAlertView(
      input({ auras: [{ id: TOCK_SCALDING_VENTS, value2: 0 }], targetId: 2, entity: () => plated }),
    );
    expect(v.visible && v.kind).toBe('vent-warn');
    expect(buildFoundryAlertView(input({ auras: [] })).visible).toBe(false);
  });

  it('reads the walkway aura of a real Tock fight: shown on a walkway, gone on a belt', () => {
    const f = fight();
    const b = boss(f, TOCK_ID);
    put(f, b, 0, -22);
    put(f, f.tank, MAIN_LINE_BELTS.xs[1], -22);
    engage(f, b);
    const walker = f.others[0];
    const rider = f.others[1];
    const keep = () => {
      put(f, walker, -10, -30);
      put(f, rider, MAIN_LINE_BELTS.xs[0], -30);
    };
    const view = (e: Entity) =>
      buildFoundryAlertView({
        auras: e.auras,
        targetId: e.targetId,
        entity: (id) => f.sim.ctx.entities.get(id),
        interactKey: 'F',
        touch: false,
      });
    run(f, TOCK_TUNING.ventFirst + 0.2, keep);
    expect(view(walker).visible && (view(walker) as { kind: string }).kind).toBe('vent-warn');
    expect(view(rider).visible).toBe(false);
    run(f, TOCK_TUNING.ventWarning, keep);
    expect(view(walker).visible && (view(walker) as { kind: string }).kind).toBe('vent-scald');
    // Stepping onto a belt clears it at once.
    run(f, 0.1, () => put(f, walker, MAIN_LINE_BELTS.xs[1], -30));
    expect(view(walker).visible).toBe(false);
  });

  it('the vents hiss on their windup; any other windup stays silent', () => {
    const ev = { type: 'spellfx', sourceId: 1, targetId: 9, school: 'fire', fx: 'windup' } as const;
    expect(spellFxCue({ ...ev, ability: TOCK_SCALDING_VENTS })).toEqual({
      key: 'ui_aura_steam_hiss',
      anchorId: 9,
    });
    expect(spellFxCue({ ...ev, ability: 'foundry_tock_stamping_press' })).toBeNull();
    expect(spellFxCue(ev)).toBeNull();
  });

  it('the walkway mark says its rule and its real numbers, not a 0 percent vulnerability', () => {
    const d = auraEffectDescriptor({ id: TOCK_SCALDING_VENTS, kind: 'vulnerability', value: 0 });
    expect(d?.key).toBe('hudChrome.auraEffect.foundry.scaldingVents');
    expect(d?.nums).toEqual({
      min: TOCK_TUNING.ventMin,
      max: TOCK_TUNING.ventMax,
      every: TOCK_TUNING.ventTickEvery,
      seconds: TOCK_TUNING.ventScald,
      heroicMin: Math.round(TOCK_TUNING.ventMin * 2.5),
      heroicMax: Math.round(TOCK_TUNING.ventMax * 2.5),
    });
    const text = t('hudChrome.auraEffect.foundry.scaldingVents', d?.nums ?? {});
    expect(text).toContain(`${TOCK_TUNING.ventMin} to ${TOCK_TUNING.ventMax} Fire damage`);
    expect(text).not.toContain('{');
  });
});
