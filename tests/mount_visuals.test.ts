import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { tintedMaterial } from '../src/render/characters/assets';
import { VISUALS } from '../src/render/characters/manifest';
import { gfxInternalsForTest } from '../src/render/gfx';
import {
  MOUNT_LAMP_COLOR,
  MOUNT_LAMP_DISTANCE,
  MOUNT_LAMP_INTENSITY,
  MOUNT_VISUAL_SPECS,
  mountBobY,
  mountLampFlicker,
  mountSeatLift,
  mountVisualSpec,
} from '../src/render/mount_visuals';
import { MOUNT_KEYS } from '../src/sim/content/mounts';

describe('mount visual specs cover the sim catalog', () => {
  it('has a spec for every MountKey and nothing else', () => {
    expect(Object.keys(MOUNT_VISUAL_SPECS).sort()).toEqual([...MOUNT_KEYS].sort());
  });

  it('every spec points at a registered lazyPreload VisualDef', () => {
    for (const key of MOUNT_KEYS) {
      const spec = MOUNT_VISUAL_SPECS[key];
      const def = VISUALS[spec.visualKey];
      expect(def, `VISUALS[${spec.visualKey}] missing for mount ${key}`).toBeDefined();
      expect(def.lazyPreload, `${spec.visualKey} must be lazyPreload (never boot-swept)`).toBe(
        true,
      );
      expect(def.url).toBe(`models/mounts/${key}.glb`);
      // The mount never swings: the rider's one-shots carry mounted combat.
      expect(def.clips.attack).toEqual([]);
    }
  });

  it('seats sit inside the mount body (above ground, below the crown)', () => {
    for (const key of MOUNT_KEYS) {
      const spec = MOUNT_VISUAL_SPECS[key];
      const def = VISUALS[spec.visualKey];
      expect(spec.seat, `${key} seat`).toBeGreaterThan(0.5);
      expect(spec.seat, `${key} seat above its own crown`).toBeLessThan(def.height);
    }
  });

  it('resolves specs by sim mountKey and returns null/0 when dismounted', () => {
    expect(mountVisualSpec('valorsteed')?.visualKey).toBe('mount_valorsteed');
    expect(mountVisualSpec('')).toBeNull();
    expect(mountVisualSpec('not_a_mount')).toBeNull();
    expect(mountSeatLift('grag_bear')).toBeGreaterThan(0);
    expect(mountSeatLift('')).toBe(0);
  });

  it('preserves authored vertex colors when Low converts mount materials to Lambert', () => {
    const restoreGfx = gfxInternalsForTest.overrideSettings({ standardMaterials: false });
    try {
      const source = new THREE.MeshStandardMaterial({
        color: 0x8c65a7,
        vertexColors: true,
      });
      const converted = tintedMaterial(source, null, 0);
      expect(converted).toBeInstanceOf(THREE.MeshLambertMaterial);
      expect((converted as THREE.MeshLambertMaterial).vertexColors).toBe(true);
      expect((converted as THREE.MeshLambertMaterial).color.getHex()).not.toBe(0xffffff);
    } finally {
      restoreGfx();
    }
  });
});

// The Lambert conversion above changes what Low renders for EVERY GLB that ships
// authored COLOR_0, not just the mount that surfaced the bug. Pin that set so the
// blast radius stays written down: a mount re-exported with or without a baked
// vertex-color pass moves in or out of the fix, and the Highwatch stable horse
// rides along because it reuses the Valorsteed GLB.
describe('the Low vertex-color path covers every mount GLB that ships COLOR_0', () => {
  const REPO_ROOT = path.join(__dirname, '..');

  /** The attribute names declared across a GLB's mesh primitives. */
  function glbAttributes(url: string): Set<string> {
    const bytes = readFileSync(path.join(REPO_ROOT, 'public', url));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as {
      meshes?: { primitives?: { attributes: Record<string, number> }[] }[];
    };
    const attributes = new Set<string>();
    for (const mesh of json.meshes ?? []) {
      for (const primitive of mesh.primitives ?? []) {
        for (const name of Object.keys(primitive.attributes)) attributes.add(name);
      }
    }
    return attributes;
  }

  const mountUrls = [
    ...new Set(
      Object.values(VISUALS)
        .map((def) => def.url)
        .filter((url) => url.startsWith('models/mounts/')),
    ),
  ].sort();

  it('carries authored COLOR_0 on exactly the Terrorspark Groundshaker and the Valorsteed', () => {
    expect(mountUrls.length).toBeGreaterThanOrEqual(8);
    const withVertexColors = mountUrls.filter((url) => glbAttributes(url).has('COLOR_0'));
    expect(withVertexColors).toEqual([
      'models/mounts/terrorspark_groundshaker.glb',
      'models/mounts/valorsteed.glb',
    ]);
    // Not vacuous: every mount GLB is really parsed, and POSITION proves it.
    for (const url of mountUrls) expect(glbAttributes(url).has('POSITION'), url).toBe(true);
  });

  it('puts the ambient stable horse on the Valorsteed GLB, so Low moves it too', () => {
    expect(VISUALS.mob_stable_horse.url).toBe('models/mounts/valorsteed.glb');
    expect(VISUALS.mount_valorsteed.url).toBe('models/mounts/valorsteed.glb');
  });
});

describe('procedural bob math', () => {
  it('rigged mounts never bob (their clips carry the motion)', () => {
    const spec = MOUNT_VISUAL_SPECS.valorsteed;
    expect(mountBobY(spec, 0.37, true)).toBe(0);
    expect(mountBobY(spec, 1.9, false)).toBe(0);
  });

  it('the hover cycle floats even while standing, both directions', () => {
    const spec = MOUNT_VISUAL_SPECS.aether_hover_cycle;
    const at = (t: number) => mountBobY(spec, t, false);
    // quarter and three-quarter cycle of a 1.1 Hz sine: opposite signs
    const quarter = 0.25 / spec.bobHz;
    expect(at(quarter)).toBeCloseTo(spec.bobAmp, 5);
    expect(at(3 * quarter)).toBeCloseTo(-spec.bobAmp, 5);
  });

  it('the griffin is gait-rigged (its clips carry the motion, no bob)', () => {
    const spec = MOUNT_VISUAL_SPECS.stormfeather_griffin;
    expect(spec.rigged).toBe(true);
    expect(mountBobY(spec, 0.7, true)).toBe(0);
  });

  it('the gobbler is gait-rigged with the saddle over the hips (authored strut clips)', () => {
    const spec = MOUNT_VISUAL_SPECS.thunderstrut_gobbler;
    expect(spec.rigged).toBe(true);
    expect(spec.seat).toBe(2.05);
    expect(spec.seatFwd).toBe(-0.15);
    expect(spec.fx).toBeNull();
    expect(mountBobY(spec, 0.7, true)).toBe(0);
  });

  it('the tank is gait-rigged with a stable rear saddle and no procedural effect', () => {
    const spec = MOUNT_VISUAL_SPECS.terrorspark_groundshaker;
    const def = VISUALS.mount_terrorspark_groundshaker;
    expect(spec).toMatchObject({
      visualKey: 'mount_terrorspark_groundshaker',
      seat: 2.38,
      seatFwd: -0.3,
      rigged: true,
      bobAmp: 0,
      fx: null,
    });
    expect(def).toMatchObject({
      url: 'models/mounts/terrorspark_groundshaker.glb',
      height: 2.8,
      walkRef: 3,
      runRef: 4.4,
      lazyPreload: true,
    });
    expect(mountBobY(spec, 0.7, true)).toBe(0);
  });

  it('the snail glides flat (no bob at all)', () => {
    const spec = MOUNT_VISUAL_SPECS.stalkglider_snail;
    expect(mountBobY(spec, 0.5, true)).toBe(0);
  });

  it('the Lanternback Troll seats its rider ON the throne pan, not through it', () => {
    const spec = MOUNT_VISUAL_SPECS.lanternback_troll;
    const def = VISUALS.mount_lanternback_troll;
    expect(spec).toMatchObject({
      visualKey: 'mount_lanternback_troll',
      seat: 5.15,
      seatFwd: -0.36,
      rigged: true,
      bobAmp: 0,
      fx: null,
    });
    expect(def).toMatchObject({
      url: 'models/mounts/lanternback_troll.glb',
      height: 7,
      walkRef: 5.6,
      runRef: 12.6,
      lazyPreload: true,
    });
    // Fitted against a live probe: the throne's seat pan sits 3.656 above
    // ground and the sit pose carries the rider's hip 0.087 above their root,
    // so the lift has to clear the pan. Below it the throne's side panel
    // swallows the rider's whole lower body.
    const SEAT_PAN_ABOVE_GROUND = 3.656 * 1.4;
    const SIT_POSE_HIP_ABOVE_ROOT = 0.087 * 1.4;
    expect(spec.seat + SIT_POSE_HIP_ABOVE_ROOT).toBeGreaterThan(SEAT_PAN_ABOVE_GROUND);
    // ...but not so far that he floats: keep it inside a hand's width.
    expect(spec.seat + SIT_POSE_HIP_ABOVE_ROOT - SEAT_PAN_ABOVE_GROUND).toBeLessThan(0.35);
    // The mount carries no procedural bob; the authored lope owns the bounce.
    expect(mountBobY(spec, 0.7, true)).toBe(0);
  });

  it('the Lanternback Troll is the only mount that carries lamps, one per chain', () => {
    for (const key of MOUNT_KEYS) {
      const lamps = MOUNT_VISUAL_SPECS[key].lamps;
      if (key === 'lanternback_troll') {
        expect(lamps.map((l) => l.bone)).toEqual(['lantern_l', 'lantern_r']);
        // Both chains are identical, so both lamps share one measured offset
        // straight down the bone (0.681 of a 1.02-unit bone, in MODEL units).
        for (const lamp of lamps) {
          expect(lamp.offset[1]).toBeCloseTo(0.681, 3);
          expect(Math.abs(lamp.offset[0])).toBeLessThan(0.02);
          expect(Math.abs(lamp.offset[2])).toBeLessThan(0.02);
        }
      } else {
        expect(lamps, `${key} must carry no lamps`).toEqual([]);
      }
    }
    // Warm sodium, a touch under a wall torch, on the standard decay-2 falloff.
    expect(MOUNT_LAMP_COLOR).toBe(0xff8c32);
    expect(MOUNT_LAMP_INTENSITY).toBe(6.5);
    expect(MOUNT_LAMP_DISTANCE).toBe(17);
  });

  it('lamp flicker stays inside the band that keeps the light budget stable', () => {
    // A lamp that guttered to zero would flip the budget's shine decision on
    // and off; one that spiked would bloom. Sample a long stretch densely.
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 20000; i++) {
      for (const lamp of [0, 1]) {
        const v = mountLampFlicker(i * 0.0037, lamp);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    expect(lo).toBeGreaterThan(0.77);
    expect(hi).toBeLessThan(1.15);
    // Deterministic, so a headless render is reproducible.
    expect(mountLampFlicker(3.25, 0)).toBe(mountLampFlicker(3.25, 0));
    // The two lamps are detuned: pulsing in lockstep is what gives a scripted
    // flicker away. Over a real stretch they must diverge substantially.
    let maxSplit = 0;
    for (let i = 0; i < 4000; i++) {
      const t = i * 0.0037;
      maxSplit = Math.max(maxSplit, Math.abs(mountLampFlicker(t, 0) - mountLampFlicker(t, 1)));
    }
    expect(maxSplit).toBeGreaterThan(0.15);
  });

  it('pins the ambient particle effects: snail slime, hover-cycle exhaust', () => {
    expect(MOUNT_VISUAL_SPECS.stalkglider_snail.fx).toBe('slime');
    expect(MOUNT_VISUAL_SPECS.aether_hover_cycle.fx).toBe('exhaust');
    expect(MOUNT_VISUAL_SPECS.valorsteed.fx).toBeNull();
    expect(MOUNT_VISUAL_SPECS.stormfeather_griffin.fx).toBeNull();
    expect(MOUNT_VISUAL_SPECS.terrorspark_groundshaker.fx).toBeNull();
  });
});
