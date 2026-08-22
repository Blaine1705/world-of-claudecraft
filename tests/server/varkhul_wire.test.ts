import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { varkhulEncounterWireJson } from '../../server/varkhul_wire';
import { decodeVarkhulAssemblies } from '../../src/net/varkhul_assembly_wire';

describe('Varkhul snapshot wire fragment', () => {
  it('builds the realm projection once per broadcast before viewer filtering', () => {
    const source = readFileSync(new URL('../../server/game.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/const varkhulEncounterWorld:[\s\S]*?activeVarkhulAssemblies/);
    expect(source).toMatch(/varkhulEncounterWireJson\(\s*varkhulEncounterWorld,/);
  });

  it('interest-scopes every mechanic family and preserves stable compact fields', () => {
    const json = varkhulEncounterWireJson(
      {
        activeVarkhulForgestormWarnings: [
          { id: 101, sourceId: 1, x: 3.126, z: 4.234, radius: 4, duration: 2.5, remaining: 1.4 },
          { id: 102, sourceId: 1, x: 200, z: 4, radius: 4, duration: 2.5, remaining: 1 },
        ],
        activeVarkhulCinderFires: [
          { id: '1:cinder-fire:2:0', sourceId: 1, x: 5.126, z: 6.234, radius: 2.4 },
        ],
        activeVarkhulCinderOrbProjectiles: [],
        activeVarkhulAnvilMeteors: [],
        activeVarkhulAssemblies: [],
      },
      { x: 0, z: 0 },
      50,
    );
    expect(JSON.parse(`{${json.slice(1)}}`)).toEqual({
      varkhulForgestorm: [{ id: 101, sourceId: 1, x: 3.13, z: 4.23, r: 4, dur: 2.5, rem: 1.4 }],
      varkhulCinderFires: [{ id: '1:cinder-fire:2:0', sourceId: 1, x: 5.13, z: 6.23, r: 2.4 }],
    });
  });

  it('serializes all ten room runes with the new role-free compact contract', () => {
    const runes = Array.from({ length: 10 }, (_, symbol) => ({
      symbol,
      x: symbol * 2.126,
      z: symbol * -3.234,
      radius: 3.3,
      assignedPlayerId: symbol === 2 ? 9 : null,
      locked: symbol === 2,
      targetAngle: symbol * 0.2,
      glyphAngle: symbol * 0.2 + 0.4,
      control: symbol === 2 ? ('clockwise' as const) : ('off' as const),
      aligned: symbol === 2,
    }));
    const json = varkhulEncounterWireJson(
      {
        activeVarkhulForgestormWarnings: [],
        activeVarkhulCinderFires: [],
        activeVarkhulCinderOrbProjectiles: [],
        activeVarkhulAnvilMeteors: [],
        activeVarkhulAssemblies: [
          {
            bossId: 7,
            phase: 'links',
            forgeX: 10,
            forgeZ: 20,
            forgeHp: 0,
            forgeMaxHp: 100,
            cores: [],
            deliveryWindowRemaining: 0,
            assignments: [{ playerId: 9, symbol: 2, locked: true }],
            runes,
            round: 0,
            rounds: 1,
            remaining: 18,
          },
        ],
      },
      { x: 0, z: 0 },
      50,
    );
    const parsed = JSON.parse(`{${json.slice(1)}}`);
    const assembly = parsed.varkhulAssemblies[0];
    expect(assembly.assign).toEqual([{ pid: 9, sym: 2, lock: 1 }]);
    expect(assembly.runes).toHaveLength(10);
    expect(assembly.runes[2]).toMatchObject({
      sym: 2,
      x: 4.25,
      z: -6.47,
      r: 3.3,
      ta: 0.4,
      ga: 0.8,
      c: 2,
      al: 1,
      lock: 1,
    });
    expect(Object.keys(assembly.runes[0]).sort()).toEqual(
      ['sym', 'x', 'z', 'r', 'ta', 'ga', 'c', 'al', 'lock'].sort(),
    );
    expect(JSON.stringify(assembly).length).toBeLessThan(1_400);
    expect(decodeVarkhulAssemblies(parsed.varkhulAssemblies)[0].runes[2]).toMatchObject({
      symbol: 2,
      assignedPlayerId: 9,
      targetAngle: 0.4,
      glyphAngle: 0.8,
      control: 'clockwise',
      aligned: true,
      locked: true,
    });
  });
});
