import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { varkhulEncounterWireJson } from '../../server/varkhul_wire';

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
        activeVarkhulCinderOrbProjectiles: [
          {
            id: '1:cinder-orbs:2:0:0',
            sourceId: 1,
            x: 7.126,
            z: 8.234,
            dirX: Math.SQRT1_2,
            dirZ: -Math.SQRT1_2,
            radius: 1.1,
            duration: 5.5,
            remaining: 4.9,
          },
        ],
        activeVarkhulAnvilMeteors: [],
        activeVarkhulAssemblies: [],
      },
      { x: 0, z: 0 },
      50,
    );

    expect(JSON.parse(`{${json.slice(1)}}`)).toEqual({
      varkhulForgestorm: [{ id: 101, sourceId: 1, x: 3.13, z: 4.23, r: 4, dur: 2.5, rem: 1.4 }],
      varkhulCinderFires: [
        {
          id: '1:cinder-fire:2:0',
          sourceId: 1,
          x: 5.13,
          z: 6.23,
          r: 2.4,
        },
      ],
      varkhulCinderOrbs: [
        {
          id: '1:cinder-orbs:2:0:0',
          sourceId: 1,
          x: 7.13,
          z: 8.23,
          dx: 0.71,
          dz: -0.71,
          r: 1.1,
          dur: 5.5,
          rem: 4.9,
        },
      ],
    });
  });

  it('serializes Heroic meteor warnings and the full spatial assembly interface', () => {
    const json = varkhulEncounterWireJson(
      {
        activeVarkhulForgestormWarnings: [],
        activeVarkhulCinderFires: [],
        activeVarkhulCinderOrbProjectiles: [],
        activeVarkhulAnvilMeteors: [
          {
            id: 'meteor:1',
            x: 4,
            z: 5,
            radius: 3.5,
            duration: 1.8,
            remaining: 1.2,
            warningLead: 0,
          },
        ],
        activeVarkhulAssemblies: [
          {
            bossId: 7,
            phase: 'links',
            forgeX: 10,
            forgeZ: 20,
            forgeHp: 0,
            forgeMaxHp: 100,
            cores: [{ id: 'core:1', x: 2, z: 3, carrierId: 9, delivered: false }],
            deliveryWindowRemaining: 0,
            assignments: [{ playerId: 9, symbol: 2, role: 'hammer', locked: false }],
            pads: [
              {
                symbol: 2,
                x: 14,
                z: 24,
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
            round: 1,
            rounds: 2,
            remaining: 18,
          },
        ],
      },
      { x: 0, z: 0 },
      50,
    );

    const parsed = JSON.parse(`{${json.slice(1)}}`);
    expect(parsed).toMatchObject({
      varkhulAnvilMeteors: [{ id: 'meteor:1', x: 4, z: 5, r: 3.5, dur: 1.8, rem: 1.2, lead: 0 }],
      varkhulAssemblies: [
        {
          bossId: 7,
          phase: 'links',
          fx: 10,
          fz: 20,
          hp: 0,
          mhp: 100,
          round: 1,
          rounds: 2,
          cores: [{ id: 'core:1', cid: 9, del: 0 }],
          assign: [{ pid: 9, sym: 2, role: 1, lock: 0 }],
          pads: [{ sym: 2, r: 3, p: 0.5, ar: 0, hr: 1, ta: 1.2, aa: 1.25, c: 2, al: 1, lock: 0 }],
        },
      ],
    });
    expect(Object.keys(parsed.varkhulAssemblies[0].pads[0]).sort()).toEqual(
      ['aa', 'al', 'ar', 'c', 'hr', 'lock', 'p', 'r', 'sym', 'ta', 'x', 'z'].sort(),
    );
  });
});
