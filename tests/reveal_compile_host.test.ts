// The one compile host every streamed-decor reveal gate shares
// (src/render/reveal_compile_host.ts). Its whole policy is a priority and an
// order: an IMMINENT key (the decor an arrival's camera landed among) rides at
// LIVE_VIEW so the driver links it ahead of the rest of the reveal lane, an
// ordinary reveal stays at VISIBLE_PREWARM under the live entity gates, and in
// both cases the link comes before the upload, which comes before the touch.
// The link itself is cut into one gate piece per material group of the root
// (compile_gate_pieces.ts), each running the colour arm then the shadow arm
// on its own nodes, all under the one gate.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import type { CompileGateResult } from '../src/render/compile_gate';
import { createRevealCompileHost, REVEAL_GATE_PREP_KIND } from '../src/render/reveal_compile_host';
import { REVEAL_GATE_WATCHDOG_MS, REVEAL_SOFT_DEADLINE_MIN_MS } from '../src/render/reveal_gate';

const SETTLED: CompileGateResult = { failed: false, timedOut: false };

/** Records every arm the host drives, in order, with the priority it used. */
function recordingDeps(predictRevealMs = 0, result: CompileGateResult = SETTLED) {
  const calls: {
    arm: string;
    priority: number;
    label?: string;
    gate?: CompileGateResult;
    node?: THREE.Object3D;
    pieces?: number;
  }[] = [];
  const deps = {
    gate(pieces: Array<() => Promise<unknown>>, options: { priority: number; label: string }) {
      calls.push({
        arm: 'gate',
        priority: options.priority,
        label: options.label,
        pieces: pieces.length,
      });
      // serial, like the local fallback: the pieces' arms land in order
      return pieces
        .reduce<Promise<unknown>>((chain, piece) => chain.then(piece), Promise.resolve())
        .then(() => result);
    },
    compileColor(node: THREE.Object3D) {
      calls.push({ arm: 'color', priority: Number.NaN, node });
      return Promise.resolve();
    },
    compileShadow(node: THREE.Object3D) {
      calls.push({ arm: 'shadow', priority: Number.NaN, node });
      return Promise.resolve();
    },
    upload(_target: object, priority: number) {
      calls.push({ arm: 'upload', priority });
      return Promise.resolve();
    },
    touch(_target: object, priority: number, gate: CompileGateResult) {
      calls.push({ arm: 'touch', priority, gate });
      return Promise.resolve();
    },
    predictRevealMs: () => predictRevealMs,
  };
  return { calls, host: createRevealCompileHost(deps) };
}

/** A one-material root: one piece, one colour arm, one shadow arm. */
function oneMaterialRoot(name = 'eastbrookTownMicroOpaqueBatch'): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

const root = oneMaterialRoot();

describe('reveal compile host priority', () => {
  it('submits an IMMINENT key at LIVE_VIEW, link, upload and touch alike', async () => {
    const { calls, host } = recordingDeps();
    await host.compile(root, true);
    const priorities = calls
      .filter((call) => call.arm === 'gate' || call.arm === 'upload' || call.arm === 'touch')
      .map((call) => call.priority);
    expect(priorities).toEqual([
      GPU_WORK_PRIORITY.LIVE_VIEW,
      GPU_WORK_PRIORITY.LIVE_VIEW,
      GPU_WORK_PRIORITY.LIVE_VIEW,
    ]);
  });

  it('submits an ordinary reveal at VISIBLE_PREWARM, link, upload and touch alike', async () => {
    const { calls, host } = recordingDeps();
    await host.compile(root, false);
    const priorities = calls
      .filter((call) => call.arm === 'gate' || call.arm === 'upload' || call.arm === 'touch')
      .map((call) => call.priority);
    expect(priorities).toEqual([
      GPU_WORK_PRIORITY.VISIBLE_PREWARM,
      GPU_WORK_PRIORITY.VISIBLE_PREWARM,
      GPU_WORK_PRIORITY.VISIBLE_PREWARM,
    ]);
  });

  it('keeps the imminent lane under the actionable gates and above every other reveal', () => {
    // Cosmetic scenery may go first among the reveals, never ahead of a mob or
    // a player the camera can act on.
    expect(GPU_WORK_PRIORITY.LIVE_VIEW).toBeLessThan(GPU_WORK_PRIORITY.ACTIONABLE_VIEW);
    expect(GPU_WORK_PRIORITY.LIVE_VIEW).toBeGreaterThan(GPU_WORK_PRIORITY.VISIBLE_PREWARM);
  });

  it('links, then uploads, then touches, whatever the priority', async () => {
    // A touch before the link warms nothing, and an upload after the touch is
    // measured by the touch's own driver round trip instead of being its own
    // budgeted piece.
    for (const imminent of [true, false]) {
      const { calls, host } = recordingDeps();
      await host.compile(root, imminent);
      expect(calls.map((call) => call.arm)).toEqual(['gate', 'color', 'shadow', 'upload', 'touch']);
    }
  });

  it('cuts the link into one gate piece per material group, colour then shadow per node', async () => {
    // A town kit root: two batches share one material, a third wears another,
    // and the bare group carries none. Two pieces, every node compiled in
    // place (the arms get the NODE, never the root), the shared-material
    // batches inside the same piece.
    const kit = new THREE.Group();
    kit.name = 'eastbrookTownKit';
    const shared = new THREE.MeshStandardMaterial();
    const first = new THREE.Mesh(new THREE.BufferGeometry(), shared);
    const second = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    const third = new THREE.Mesh(new THREE.BufferGeometry(), shared);
    kit.add(first, second, third);
    const { calls, host } = recordingDeps();
    await host.compile(kit, false);
    expect(calls[0]).toMatchObject({
      arm: 'gate',
      pieces: 2,
      label: 'reveal-gate:eastbrookTownKit',
    });
    expect(calls.slice(1, 7).map((call) => `${call.arm}:${call.node?.uuid}`)).toEqual([
      `color:${first.uuid}`,
      `shadow:${first.uuid}`,
      `color:${third.uuid}`,
      `shadow:${third.uuid}`,
      `color:${second.uuid}`,
      `shadow:${second.uuid}`,
    ]);
    expect(calls.slice(7).map((call) => call.arm)).toEqual(['upload', 'touch']);
  });

  it('hands the tail the gate own result, so a timed-out link proves nothing ready', async () => {
    // The tail's readiness comes from the settle and nothing else: on a gate
    // that timed out the driver is still linking, and marking there would let
    // the walk touch a program whose first use blocks on that very link.
    for (const result of [
      SETTLED,
      { failed: false, timedOut: true },
      { failed: true, timedOut: false },
    ]) {
      const { calls, host } = recordingDeps(0, result);
      await host.compile(root, false);
      expect(calls.find((call) => call.arm === 'touch')?.gate).toBe(result);
    }
  });

  it('labels every unit under the one prep kind the cost model is keyed on', async () => {
    const { calls, host } = recordingDeps();
    await host.compile(root, true);
    expect(calls[0].label).toBe(`${REVEAL_GATE_PREP_KIND}:${root.name}`);
    const { calls: unnamed, host: other } = recordingDeps();
    const group = new THREE.Group();
    group.add(oneMaterialRoot(''));
    await other.compile(group, false);
    expect(unnamed[0].label).toBe(`${REVEAL_GATE_PREP_KIND}:Group`);
  });
});

describe('reveal compile host soft deadline', () => {
  it('reports the learned cost times the root count, floored and clamped', () => {
    const { host } = recordingDeps(400);
    expect(host.expectedMs?.('town', 1)).toBe(REVEAL_SOFT_DEADLINE_MIN_MS);
    expect(host.expectedMs?.('town', 10)).toBe(4_000);
    expect(host.expectedMs?.('town', 1_000)).toBe(REVEAL_GATE_WATCHDOG_MS);
  });
});
