import { describe, expect, it } from 'vitest';
import {
  decodeVarkhulAnvilMeteors,
  decodeVarkhulAssemblies,
} from '../src/net/varkhul_assembly_wire';

function runeRows(overrides: Record<number, Record<string, unknown>> = {}) {
  return Array.from({ length: 10 }, (_, symbol) => ({
    sym: symbol,
    x: symbol * 2,
    z: symbol * -3,
    r: 3.3,
    ta: symbol * 0.2,
    ga: symbol * 0.2 + 0.4,
    c: symbol === 2 ? 1 : symbol === 3 ? 2 : 0,
    al: 0,
    lock: symbol === 1 ? 1 : 0,
    ...overrides[symbol],
  }));
}

function assemblyRow(overrides: Record<string, unknown> = {}) {
  return {
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
      { pid: 4, sym: 2, lock: 0 },
      { pid: 5, sym: 1, lock: 1 },
    ],
    runes: runeRows(),
    ...overrides,
  };
}

describe('Varkhul assembly wire', () => {
  it('decodes ten authoritative room runes and both radial controls', () => {
    const decoded = decodeVarkhulAssemblies([assemblyRow()]);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]).toMatchObject({
      bossId: 7,
      phase: 'links',
      forgeX: 10,
      forgeZ: 20,
      forgeHp: 0,
      forgeMaxHp: 100,
      assignments: [
        { playerId: 4, symbol: 2, locked: false },
        { playerId: 5, symbol: 1, locked: true },
      ],
    });
    expect(decoded[0].runes).toHaveLength(10);
    expect(decoded[0].runes[1]).toMatchObject({
      symbol: 1,
      assignedPlayerId: 5,
      locked: true,
      control: 'off',
      aligned: false,
    });
    expect(decoded[0].runes[1].targetAngle).toBeCloseTo(0.2, 8);
    expect(decoded[0].runes[1].glyphAngle).toBeCloseTo(0.6, 8);
    expect(decoded[0].runes[2]).toMatchObject({
      assignedPlayerId: 4,
      control: 'counterclockwise',
      aligned: false,
    });
    expect(decoded[0].runes[2].targetAngle).toBeCloseTo(0.4, 8);
    expect(decoded[0].runes[2].glyphAngle).toBeCloseTo(0.8, 8);
    expect(decoded[0].runes[3]).toMatchObject({ assignedPlayerId: null, control: 'clockwise' });
  });

  it('drops the whole assembly for malformed, duplicate, incomplete, or inconsistent rune state', () => {
    expect(decodeVarkhulAssemblies([assemblyRow({ runes: runeRows({ 4: { sym: 10 } }) })])).toEqual(
      [],
    );
    expect(decodeVarkhulAssemblies([assemblyRow({ runes: runeRows({ 4: { sym: 3 } }) })])).toEqual(
      [],
    );
    expect(decodeVarkhulAssemblies([assemblyRow({ runes: runeRows().slice(0, 9) })])).toEqual([]);
    expect(
      decodeVarkhulAssemblies([assemblyRow({ runes: runeRows({ 2: { ga: Number.NaN } }) })]),
    ).toEqual([]);
    expect(decodeVarkhulAssemblies([assemblyRow({ runes: runeRows({ 2: { c: 3 } }) })])).toEqual(
      [],
    );
    expect(
      decodeVarkhulAssemblies([assemblyRow({ assign: [{ pid: 4, sym: 1, lock: 0 }] })]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        assemblyRow({
          assign: [
            { pid: 4, sym: 0, lock: 0 },
            { pid: 4, sym: 2, lock: 0 },
          ],
        }),
      ]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        assemblyRow({
          assign: [
            { pid: 4, sym: 2, lock: 0 },
            { pid: 5, sym: 2, lock: 0 },
          ],
        }),
      ]),
    ).toEqual([]);
    expect(
      decodeVarkhulAssemblies([
        assemblyRow({ phase: 'convergence', assign: [], runes: [...runeRows(), runeRows()[0]] }),
      ]),
    ).toEqual([]);
    expect(decodeVarkhulAssemblies([assemblyRow({ phase: 'future' })])).toEqual([]);
  });

  it('accepts convergence before symbols and rune rows are assigned', () => {
    expect(
      decodeVarkhulAssemblies([
        assemblyRow({ phase: 'convergence', rem: 4, assign: [], runes: [] }),
      ]),
    ).toMatchObject([{ phase: 'convergence', remaining: 4, assignments: [], runes: [] }]);
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
