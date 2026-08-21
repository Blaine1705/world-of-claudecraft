import { describe, expect, it } from 'vitest';
import {
  decodeVarkhulAnvilMeteors,
  decodeVarkhulAssemblies,
} from '../src/net/varkhul_assembly_wire';

describe('Varkhul assembly wire', () => {
  it('decodes complete authoritative assembly state', () => {
    expect(
      decodeVarkhulAssemblies([
        {
          bossId: 7,
          phase: 'links',
          fx: 10,
          fz: 20,
          hp: 0,
          mhp: 100,
          win: 0,
          round: 0,
          rounds: 1,
          rem: 24,
          cores: [{ id: 'core', x: 1, z: 2, cid: null, del: 1 }],
          assign: [
            { pid: 4, sym: 2, role: 1, lock: 0 },
            { pid: 5, sym: 1, role: 0, lock: 1 },
          ],
          pads: [
            {
              sym: 2,
              x: 3,
              z: 4,
              r: 3,
              p: 0.5,
              ar: 0,
              hr: 1,
              ta: 1.2,
              aa: 1.25,
              c: 2,
              al: 1,
              lock: 0,
            },
          ],
        },
      ]),
    ).toEqual([
      {
        bossId: 7,
        phase: 'links',
        forgeX: 10,
        forgeZ: 20,
        forgeHp: 0,
        forgeMaxHp: 100,
        deliveryWindowRemaining: 0,
        round: 0,
        rounds: 1,
        remaining: 24,
        cores: [{ id: 'core', x: 1, z: 2, carrierId: null, delivered: true }],
        assignments: [
          { playerId: 4, symbol: 2, role: 'hammer', locked: false },
          { playerId: 5, symbol: 1, role: 'anvil', locked: true },
        ],
        pads: [
          {
            symbol: 2,
            x: 3,
            z: 4,
            radius: 3,
            progress: 0.5,
            locked: false,
            anvilReady: false,
            hammerReady: true,
            targetAngle: 1.2,
            armAngle: 1.25,
            control: 'brake',
            aligned: true,
          },
        ],
      },
    ]);
  });

  it('drops a whole assembly when any nested actionable row is malformed', () => {
    const base = {
      bossId: 7,
      phase: 'links',
      fx: 10,
      fz: 20,
      hp: 40,
      mhp: 100,
      win: 2,
      round: 0,
      rounds: 1,
      rem: 20,
      cores: [],
      assign: [],
      pads: [],
    };
    expect(
      decodeVarkhulAssemblies([{ ...base, pads: [{ sym: 8, x: 0, z: 0, r: 3, p: 0, lock: 0 }] }]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([{ ...base, assign: [{ pid: 1, sym: 0, role: 3, lock: 0 }] }]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        {
          ...base,
          pads: [
            { sym: 0, x: 0, z: 0, r: 3, p: 0, ar: 2, hr: 0, ta: 0, aa: 1, c: 0, al: 0, lock: 0 },
          ],
        },
      ]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        {
          ...base,
          pads: [
            {
              sym: 0,
              x: 0,
              z: 0,
              r: 3,
              p: 0,
              ar: 0,
              hr: 0,
              ta: Number.NaN,
              aa: 1,
              c: 0,
              al: 0,
              lock: 0,
            },
          ],
        },
      ]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        {
          ...base,
          pads: [
            {
              sym: 0,
              x: 0,
              z: 0,
              r: 3,
              p: 0,
              ar: 0,
              hr: 0,
              ta: 0,
              aa: Number.POSITIVE_INFINITY,
              c: 0,
              al: 0,
              lock: 0,
            },
          ],
        },
      ]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        {
          ...base,
          pads: [
            { sym: 0, x: 0, z: 0, r: 3, p: 0, ar: 0, hr: 0, ta: 0, aa: 1, c: 0, al: 2, lock: 0 },
          ],
        },
      ]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        {
          ...base,
          pads: [
            { sym: 0, x: 0, z: 0, r: 3, p: 0, ar: 0, hr: 2, ta: 0, aa: 1, c: 0, al: 0, lock: 0 },
          ],
        },
      ]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        {
          ...base,
          pads: [
            { sym: 0, x: 0, z: 0, r: 3, p: 0, ar: 0, hr: 0, ta: 0, aa: 1, c: 4, al: 0, lock: 0 },
          ],
        },
      ]),
    ).toEqual([]);
    expect(decodeVarkhulAssemblies([{ ...base, assign: [{ pid: 1, sym: 0, lock: 0 }] }])).toEqual(
      [],
    );
    expect(decodeVarkhulAssemblies([{ ...base, phase: 'future' }])).toEqual([]);
  });

  it('maps every authoritative Hammer control without tolerant defaults', () => {
    const row = (control: number) => ({
      bossId: 7,
      phase: 'links',
      fx: 0,
      fz: 0,
      hp: 0,
      mhp: 100,
      win: 0,
      round: 0,
      rounds: 1,
      rem: 10,
      cores: [],
      assign: [],
      pads: [
        { sym: 0, x: 0, z: 0, r: 3, p: 0, ar: 0, hr: 0, ta: 0, aa: 1, c: control, al: 0, lock: 0 },
      ],
    });
    expect(
      [0, 1, 2, 3].map((control) => decodeVarkhulAssemblies([row(control)])[0].pads[0].control),
    ).toEqual(['off', 'counterclockwise', 'brake', 'clockwise']);
  });

  it('accepts the timed convergence phase before symbols are assigned', () => {
    expect(
      decodeVarkhulAssemblies([
        {
          bossId: 7,
          phase: 'convergence',
          fx: 10,
          fz: 20,
          hp: 0,
          mhp: 100,
          win: 0,
          round: 0,
          rounds: 1,
          rem: 4,
          cores: [],
          assign: [],
          pads: [],
        },
      ]),
    ).toMatchObject([{ phase: 'convergence', remaining: 4, assignments: [] }]);
  });

  it('decodes meteor countdowns and drops invalid footprints', () => {
    expect(
      decodeVarkhulAnvilMeteors([
        { id: 'm', x: 1, z: 2, r: 3.5, dur: 1.8, rem: 1.2, lead: 0 },
        { id: 'bad', x: 1, z: 2, r: 0, dur: 1.8, rem: 1.2, lead: 0 },
      ]),
    ).toEqual([
      {
        id: 'm',
        x: 1,
        z: 2,
        radius: 3.5,
        duration: 1.8,
        remaining: 1.2,
        warningLead: 0,
      },
    ]);
  });
});
