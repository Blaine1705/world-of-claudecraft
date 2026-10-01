// The Stormbrass Foundry's encounter alert (src/ui/hud/dungeon/
// foundry_alert_view.ts): the Storm Cell carrier's line follows the Core
// Hatch's state and names the drop key, a Target Lock says keep moving, a
// plated target says which kind of damage lands (and fills with the Stored
// Charge on the Warden), and the priority is cell, then mark, then plating.
// Driven from a real Prime Draft fight too, so the view reads exactly the
// auras and objects the sim mirrors.

import { describe, expect, it } from 'vitest';
import {
  DRAFT_CELL_CARRY,
  FOUNDRY_CELL_TEMPLATES,
  FOUNDRY_HATCH_TEMPLATES,
  hatchRingCentre,
  PRIME_DRAFT_ID,
  RANGE_TARGET_LOCK,
  VOLTAIC_CHARGED,
  VOLTAIC_GROUNDED,
  VOLTAIC_STORED,
} from '../src/sim/encounters/stormbrass_foundry';
import { chargeCycle } from '../src/sim/encounters/stormbrass_foundry/prime_draft';
import { foundryObjectLabel } from '../src/ui/entity_display_core';
import {
  buildFoundryAlertView,
  type FoundryAlertEntity,
  type FoundryAlertInput,
} from '../src/ui/hud/dungeon/foundry_alert_view';
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

describe('the Foundry alert from a real Prime Draft fight', () => {
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
