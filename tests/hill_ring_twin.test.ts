// The King of the Hill circle's warm twin (src/render/hill_ring.ts): the
// first hill a session sees hands a hidden twin, built by the live ring's own
// builder, to the renderer's compile gate, once, and keeps it for the session,
// while the live ring itself is never gated, hidden or delayed. The real-GL
// half (zero programs linked at the live ring's first draw, canvas and render
// target) is tests/browser/hill_ring_programs.browser.test.ts.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HillRingVisuals } from '../src/render/hill_ring';
import { materialProgramSignature, prewarmProgramContentKeys } from '../src/render/prewarm_policy';
import type { HillInfo } from '../src/world_api/world_pvp';

function hill(over: Partial<HillInfo> = {}): HillInfo {
  return {
    zoneId: 'z',
    x: 120,
    z: -40,
    radius: 50,
    phase: 'warning',
    minutesLeft: 15,
    standing: 'counted',
    inZone: true,
    inside: false,
    holder: 'none',
    holderCount: 0,
    yourCount: 0,
    challenger: 'none',
    challengerCount: 0,
    contest: 0,
    ...over,
  };
}

const unevenGround = (x: number, z: number): number => Math.sin(x * 0.1) * 3 + Math.cos(z * 0.07);

function rig(withGate = true) {
  const scene = new THREE.Scene();
  const submitted: THREE.Object3D[] = [];
  const gate = withGate
    ? (target: THREE.Object3D) => {
        submitted.push(target);
        return Promise.resolve();
      }
    : undefined;
  const visuals = new HillRingVisuals(scene, gate, unevenGround);
  const liveRing = () => scene.getObjectByName('hill-ring') ?? null;
  return { scene, submitted, visuals, liveRing };
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) out.push(obj as THREE.Mesh);
  });
  return out;
}

function programKey(mesh: THREE.Mesh): string {
  const material = mesh.material as THREE.MeshBasicMaterial;
  const color = mesh.geometry.getAttribute('color');
  const [content] = prewarmProgramContentKeys(
    {
      isSkinnedMesh: (mesh as THREE.SkinnedMesh).isSkinnedMesh === true,
      isInstancedMesh: (mesh as THREE.InstancedMesh).isInstancedMesh === true,
      hasMorphPositions: mesh.geometry.morphAttributes.position !== undefined,
      hasTangents: mesh.geometry.getAttribute('tangent') !== undefined,
      hasNormals: mesh.geometry.getAttribute('normal') !== undefined,
      vertexColorItemSize: color ? color.itemSize : 0,
      castShadow: mesh.castShadow,
    },
    [materialProgramSignature(material)],
  );
  return `${content}|tm${material.toneMapped}|p${material.precision}|pa${material.premultipliedAlpha}`;
}

const keySet = (root: THREE.Object3D): string[] => [...new Set(meshesOf(root).map(programKey))];

describe('hill ring warm twin', () => {
  it('submits nothing while no hill has been seen', () => {
    const { submitted, visuals, liveRing } = rig();
    for (let i = 0; i < 5; i++) {
      visuals.sync(null);
      visuals.update(0.05);
    }
    expect(submitted).toHaveLength(0);
    expect(liveRing()).toBeNull();
  });

  it.each([
    ['the warning', hill()],
    ['an already risen hill (reconnect, /dev hill)', hill({ phase: 'active', holder: 'other' })],
  ])('compiles one hidden, detached twin at the first sighting of %s', (_arm, info) => {
    const { submitted, visuals, liveRing } = rig();
    visuals.sync(info);
    expect(submitted).toHaveLength(1);
    const twin = submitted[0];
    expect(twin.name).toBe('hill-ring-twin');
    expect(twin.visible).toBe(false);
    expect(twin.parent).toBeNull();
    expect(meshesOf(twin)).toHaveLength(2);
    expect(submitted).not.toContain(liveRing());
  });

  it('never gates, hides or delays the live ring', () => {
    const { scene, submitted, visuals, liveRing } = rig();
    visuals.sync(hill());
    const live = liveRing();
    expect(live?.parent).toBe(scene);
    expect(live?.visible).toBe(true);
    for (const mesh of meshesOf(live as THREE.Object3D)) expect(mesh.visible).toBe(true);
    for (const target of submitted) {
      let reached = false;
      target.traverse((obj) => {
        if (obj === live) reached = true;
      });
      expect(reached).toBe(false);
    }
  });

  it('draws the live ring the same with or without a compile gate', () => {
    const gated = rig(true);
    const bare = rig(false);
    for (const r of [gated, bare]) {
      r.visuals.sync(hill({ phase: 'active', holder: 'you', challenger: 'other' }));
      r.visuals.update(0.4);
    }
    const summary = (root: THREE.Object3D | null) =>
      meshesOf(root as THREE.Object3D).map((m) => ({
        visible: m.visible,
        renderOrder: m.renderOrder,
        vertices: m.geometry.getAttribute('position').count,
        color: (m.material as THREE.MeshBasicMaterial).color.getHex(),
        opacity: (m.material as THREE.MeshBasicMaterial).opacity,
      }));
    expect(bare.submitted).toHaveLength(0);
    expect(summary(gated.liveRing())).toEqual(summary(bare.liveRing()));
    expect(gated.liveRing()?.visible).toBe(true);
  });

  it('compiles once per session and never disposes the twin across hills', () => {
    const { submitted, visuals, liveRing } = rig();
    visuals.sync(hill());
    const twin = submitted[0];
    const disposed: string[] = [];
    for (const mesh of meshesOf(twin)) {
      (mesh.material as THREE.Material).addEventListener('dispose', () => disposed.push('mat'));
      mesh.geometry.addEventListener('dispose', () => disposed.push('geo'));
    }
    const firstLive = liveRing();
    const firstLiveDisposed: string[] = [];
    for (const mesh of meshesOf(firstLive as THREE.Object3D)) {
      (mesh.material as THREE.Material).addEventListener('dispose', () =>
        firstLiveDisposed.push('mat'),
      );
    }
    visuals.sync(hill({ phase: 'active' }));
    visuals.sync(null);
    visuals.sync(hill({ x: -300, z: 410 }));
    visuals.sync(hill({ x: -300, z: 410, phase: 'active', holder: 'you' }));
    visuals.sync(null);
    expect(firstLiveDisposed).toHaveLength(2);
    expect(submitted).toHaveLength(1);
    expect(disposed).toHaveLength(0);
    expect(twin.parent).toBeNull();
  });

  it('shares the live ring program key in every live state', () => {
    const { submitted, visuals, liveRing } = rig();
    visuals.sync(hill());
    const twinKeys = keySet(submitted[0]);
    expect(twinKeys).toHaveLength(1);
    const states: HillInfo[] = [
      hill(),
      hill({ phase: 'active' }),
      hill({ phase: 'active', holder: 'you' }),
      hill({ phase: 'active', holder: 'other', challenger: 'you', contest: 4 }),
    ];
    for (const state of states) {
      visuals.sync(state);
      for (let i = 0; i < 7; i++) visuals.update(0.3);
      expect(keySet(liveRing() as THREE.Object3D)).toEqual(twinKeys);
    }
  });

  it('tells a different program apart (the parity pin can fail)', () => {
    const { submitted, visuals } = rig();
    visuals.sync(hill());
    const selectionShaped = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 32),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
    );
    expect(keySet(selectionShaped)).not.toEqual(keySet(submitted[0]));
  });

  it('warns on a rejected gate, retries at the next hill and keeps drawing the live ring', async () => {
    const scene = new THREE.Scene();
    let calls = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const visuals = new HillRingVisuals(
        scene,
        () => {
          calls++;
          return Promise.reject(new Error('link failed'));
        },
        unevenGround,
      );
      visuals.sync(hill());
      expect(scene.getObjectByName('hill-ring')?.visible).toBe(true);
      visuals.sync(hill({ phase: 'active' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
      visuals.sync(null);
      visuals.sync(hill({ x: 9, z: 9 }));
      expect(calls).toBe(2);
      expect(scene.getObjectByName('hill-ring')?.visible).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
