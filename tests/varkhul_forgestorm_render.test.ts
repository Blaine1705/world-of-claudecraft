import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  buildVarkhulForgestormTelegraph,
  VarkhulForgestormVisuals,
} from '../src/render/varkhul_forgestorm_visual';
import { VARKHUL_MASTERPIECE_UNBOUND_AURA_ID } from '../src/sim/encounters/varkhul';
import type { ActiveVarkhulAssembly } from '../src/sim/varkhul_assembly';
import type { ActiveVarkhulForgestormWarning } from '../src/sim/varkhul_forgestorm';

const WARNING: ActiveVarkhulForgestormWarning = {
  id: 42_100_210,
  sourceId: 42,
  x: 7,
  z: -5,
  radius: 4,
  duration: 2.5,
  remaining: 2.5,
};

const WORLDFIRE_ASSEMBLY: ActiveVarkhulAssembly = {
  bossId: 42,
  difficulty: 'heroic',
  phase: 'done',
  forgeX: 100,
  forgeZ: 222,
  forgeHp: 100,
  forgeMaxHp: 100,
  forgeOverheat: 0,
  forgeBeamActiveMask: 0,
  forgeBeamWarmupRemaining: 0,
  forgeMeltdownRemaining: 0,
  forgeBeams: [],
  interceptBeam: null,
  cores: [],
  deliveryWindowRemaining: 0,
  assignments: [],
  runes: [],
  round: 0,
  rounds: 0,
  remaining: 0,
};

describe('Varkhul Forgestorm rendering', () => {
  it('builds the authoritative radius as tier-independent actionable geometry', () => {
    const low = buildVarkhulForgestormTelegraph(WARNING, 3);
    const ultra = buildVarkhulForgestormTelegraph(WARNING, 3);
    for (const visual of [low, ultra]) {
      expect(visual.userData).toMatchObject({
        actionable: true,
        warningId: WARNING.id,
        sourceId: WARNING.sourceId,
        radius: WARNING.radius,
      });
      expect(visual.position.toArray()).toEqual([WARNING.x, 3.09, WARNING.z]);
      const rim = visual.getObjectByName('varkhul-forgestorm-rim') as THREE.Mesh;
      const positions = rim.geometry.getAttribute('position');
      let maxRadius = 0;
      for (let index = 0; index < positions.count; index++) {
        maxRadius = Math.max(maxRadius, Math.hypot(positions.getX(index), positions.getZ(index)));
      }
      expect(maxRadius).toBeCloseTo(WARNING.radius, 5);
    }
  });

  it('reconciles snapshots by stable id and advances the countdown without reallocating', () => {
    const scene = new THREE.Scene();
    const groundY = vi.fn(() => 2);
    const visuals = new VarkhulForgestormVisuals(scene, groundY);
    visuals.sync([WARNING]);
    const group = scene.getObjectByName('varkhul-forgestorm-warning') as THREE.Group;
    visuals.sync([{ ...WARNING, remaining: 1.25 }]);
    visuals.update(0.1);
    expect(scene.getObjectByName('varkhul-forgestorm-warning')).toBe(group);
    expect(groundY).toHaveBeenCalledOnce();
    const countdown = group.getObjectByName('varkhul-forgestorm-countdown') as THREE.Mesh;
    expect(countdown.scale.x).toBeCloseTo(0.5);
    expect(countdown.scale.z).toBeCloseTo(0.5);
  });

  it('removes stale authoritative warnings and disposes the remaining set', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulForgestormVisuals(scene, () => 0);
    visuals.sync([WARNING, { ...WARNING, id: WARNING.id + 1, x: 12 }]);
    expect(scene.children).toHaveLength(2);
    visuals.sync([{ ...WARNING, id: WARNING.id + 1, x: 12 }]);
    expect(scene.children).toHaveLength(1);
    visuals.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('keeps countdown progress but settles the decorative rim pulse for reduced motion', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulForgestormVisuals(scene, () => 0);
    visuals.sync([{ ...WARNING, remaining: 1.25 }]);
    const group = scene.getObjectByName('varkhul-forgestorm-warning') as THREE.Group;
    const rim = group.getObjectByName('varkhul-forgestorm-rim') as THREE.Mesh;
    const countdown = group.getObjectByName('varkhul-forgestorm-countdown') as THREE.Mesh;

    visuals.update(0.5, true);
    const firstOpacity = (rim.material as THREE.Material).opacity;
    visuals.update(0.5, true);

    expect((rim.material as THREE.Material).opacity).toBe(firstOpacity);
    expect(countdown.scale.x).toBeCloseTo(0.5);
    expect(countdown.scale.z).toBeCloseTo(0.5);
  });

  it('wires Worldfire through the real Forgestorm compositor lifecycle', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulForgestormVisuals(scene, () => 0);
    visuals.syncWorld({
      activeVarkhulForgestormWarnings: [],
      activeVarkhulCinderFires: [],
      activeVarkhulCinderOrbProjectiles: [],
      activeVarkhulAssemblies: [WORLDFIRE_ASSEMBLY],
      player: { id: 1, pos: { x: 0, z: 0 }, auras: [] },
      entities: new Map([
        [
          42,
          {
            auras: [
              {
                id: VARKHUL_MASTERPIECE_UNBOUND_AURA_ID,
                remaining: 24,
                duration: 45,
              },
            ],
          },
        ],
      ]),
    });
    expect(scene.getObjectByName('varkhul-worldfire-42')).toBeTruthy();
    visuals.update(0.5, true);
    visuals.dispose();
    expect(scene.getObjectByName('varkhul-worldfire-42')).toBeUndefined();
  });

  it('reconciles the world projection in both renderer frame paths', () => {
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const visual = readFileSync(
      new URL('../src/render/varkhul_forgestorm_visual.ts', import.meta.url),
      'utf8',
    );
    expect(
      renderer.match(/this\.varkhulForgestormVisuals\?\.syncWorld\(this\.sim\)/g),
    ).toHaveLength(2);
    expect(visual).toContain('world.activeVarkhulCinderFires');
    expect(visual).toContain('world.activeVarkhulCinderOrbProjectiles');
    expect(visual).toContain('this.forgeBeamVisuals.sync(world.activeVarkhulAssemblies)');
    expect(visual).toContain('this.forgeBeamVisuals.update(dt, reducedMotion)');
    expect(visual).toContain('this.forgeBeamVisuals.dispose()');
    expect(visual).toContain('this.interceptBeamVisuals.sync(world.activeVarkhulAssemblies)');
    expect(visual).toContain('this.interceptBeamVisuals.update(dt, reducedMotion)');
    expect(visual).toContain('this.interceptBeamVisuals.dispose()');
    expect(visual).toContain(
      'this.worldfireVisuals.sync(world.activeVarkhulAssemblies, world.entities)',
    );
    expect(visual).toContain('this.worldfireVisuals.update(dt, reducedMotion)');
    expect(visual).toContain('this.worldfireVisuals.dispose()');
    expect(renderer).toContain('dispatchVarkhulForgeHammerAttack(ev');
    expect(renderer).toContain('this.triggerAttack(entityId, abilityId)');
    expect(renderer).toContain('new VarkhulForgestormVisuals(this.scene');
  });
});
