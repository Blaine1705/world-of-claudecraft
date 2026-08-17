// The compile gate's touch tail as budgeted PIECES
// (src/render/linked_program_touch_lane.ts): one queue unit per linked program
// instead of one unit for the whole target, which is what lets a per-frame
// admission let two through in a frame with headroom and none in a frame
// without.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import type { LinkedProgramLike, MaterialPropertiesLike } from '../src/render/linked_program_touch';
import {
  LINKED_PROGRAM_TOUCH_LABEL,
  type LinkedProgramTouchQueue,
  linkedProgramTouchPriority,
  runLinkedProgramTouchLane,
} from '../src/render/linked_program_touch_lane';

interface RecordedUnit {
  priority: number | undefined;
  label: string | undefined;
}

function stubQueue(): LinkedProgramTouchQueue & {
  units: RecordedUnit[];
  order: string[];
} {
  const units: RecordedUnit[] = [];
  const order: string[] = [];
  return {
    units,
    order,
    run<T>(work: () => T | Promise<T>, priority?: number, label?: string): Promise<T> {
      units.push({ priority, label });
      order.push(`start:${units.length}`);
      const value = work();
      order.push(`end:${units.length}`);
      return Promise.resolve(value);
    },
  };
}

function program(ready: boolean): LinkedProgramLike & { uniforms: ReturnType<typeof vi.fn> } {
  const uniforms = vi.fn();
  return { isReady: () => ready, getUniforms: uniforms, getAttributes: vi.fn(), uniforms };
}

function targetWith(programs: Map<string, LinkedProgramLike>): {
  properties: MaterialPropertiesLike;
  target: THREE.Object3D;
} {
  const material = new THREE.MeshStandardMaterial({ name: 'body' });
  const target = new THREE.Group();
  target.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  return {
    properties: { get: (queried) => ({ programs: queried === material ? programs : undefined }) },
    target,
  };
}

describe('runLinkedProgramTouchLane', () => {
  it('issues one labelled unit per ready program, at the tail-piece priority, one at a time', async () => {
    const first = program(true);
    const second = program(true);
    const linking = program(false);
    const { properties, target } = targetWith(
      new Map([
        ['skinned', first],
        ['far', second],
        // still linking: touching it would block on the link, which is the
        // stall the gate exists to move off the frame
        ['pending', linking],
      ]),
    );
    const queue = stubQueue();

    await expect(runLinkedProgramTouchLane(queue, properties, target, 30)).resolves.toBe(2);

    // A LIVE_VIEW gate's pieces ride BELOW every link submission (TAIL_PIECE):
    // a cheap prologue that starts async driver work goes ahead of a piece
    // that only finishes one.
    expect(queue.units).toEqual([
      { priority: GPU_WORK_PRIORITY.TAIL_PIECE, label: LINKED_PROGRAM_TOUCH_LABEL },
      { priority: GPU_WORK_PRIORITY.TAIL_PIECE, label: LINKED_PROGRAM_TOUCH_LABEL },
    ]);
    // sequential: the pieces are main-thread work, so overlapping them would
    // only make one frame carry several driver round trips
    expect(queue.order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
    expect(first.uniforms).toHaveBeenCalledTimes(1);
    expect(second.uniforms).toHaveBeenCalledTimes(1);
    expect(linking.uniforms).not.toHaveBeenCalled();
  });

  it('collects once up front, so a piece admitted later never re-touches an earlier one', async () => {
    const touched = program(true);
    const { properties, target } = targetWith(new Map([['skinned', touched]]));
    const walks: unknown[] = [];
    const counting: MaterialPropertiesLike = {
      get: (material) => {
        walks.push(material);
        return properties.get(material);
      },
    };

    await runLinkedProgramTouchLane(stubQueue(), counting, target, 20);

    expect(walks).toHaveLength(1);
    expect(touched.uniforms).toHaveBeenCalledTimes(1);
  });

  it('queues nothing for a target with no linked programs', async () => {
    const queue = stubQueue();
    const { properties, target } = targetWith(new Map());

    await expect(runLinkedProgramTouchLane(queue, properties, target, 20)).resolves.toBe(0);

    expect(queue.units).toEqual([]);
  });

  it('stops the lane when a piece rejects, rather than warming past a dead context', async () => {
    const { properties, target } = targetWith(
      new Map([
        ['a', program(true)],
        ['b', program(true)],
      ]),
    );
    const failing: LinkedProgramTouchQueue = {
      run: () => Promise.reject(new Error('queue shut down')),
    };

    await expect(runLinkedProgramTouchLane(failing, properties, target, 20)).rejects.toThrow(
      'queue shut down',
    );
  });

  it('keeps an actionable gate pieces at the actionable floor and drops every other gate to TAIL_PIECE', async () => {
    expect(linkedProgramTouchPriority(GPU_WORK_PRIORITY.ACTIONABLE_VIEW)).toBe(
      GPU_WORK_PRIORITY.ACTIONABLE_VIEW,
    );
    expect(linkedProgramTouchPriority(GPU_WORK_PRIORITY.LIVE_VIEW)).toBe(
      GPU_WORK_PRIORITY.TAIL_PIECE,
    );
    expect(linkedProgramTouchPriority(GPU_WORK_PRIORITY.VISIBLE_PREWARM)).toBe(
      GPU_WORK_PRIORITY.TAIL_PIECE,
    );
    // Below every link submission, the boot-debt resume included, and above
    // the cosmetic warmers.
    expect(GPU_WORK_PRIORITY.TAIL_PIECE).toBeLessThan(GPU_WORK_PRIORITY.BOOT_DEBT);
    expect(GPU_WORK_PRIORITY.TAIL_PIECE).toBeGreaterThan(GPU_WORK_PRIORITY.BACKGROUND);
    const actionable = program(true);
    const { properties, target } = targetWith(new Map([['skinned', actionable]]));
    const queue = stubQueue();
    await runLinkedProgramTouchLane(queue, properties, target, GPU_WORK_PRIORITY.ACTIONABLE_VIEW);
    expect(queue.units).toEqual([
      { priority: GPU_WORK_PRIORITY.ACTIONABLE_VIEW, label: LINKED_PROGRAM_TOUCH_LABEL },
    ]);
  });
});
