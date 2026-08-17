import { describe, expect, it } from 'vitest';
import { GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import {
  type CompilePriorityNode,
  compilePriorityForTarget,
} from '../src/render/compile_priority_core';

const node = (
  entityId?: unknown,
  parent: CompilePriorityNode | null = null,
): CompilePriorityNode => ({
  userData: entityId === undefined ? {} : { entityId },
  parent,
});

describe('compilePriorityForTarget', () => {
  it('rides ACTIONABLE_VIEW when the target itself is the player target', () => {
    expect(compilePriorityForTarget(node(7), 7)).toBe(GPU_WORK_PRIORITY.ACTIONABLE_VIEW);
  });

  it('walks the ancestry: a payload under the targeted entity is actionable', () => {
    const payload = node(undefined, node(undefined, node(7)));
    expect(compilePriorityForTarget(payload, 7)).toBe(GPU_WORK_PRIORITY.ACTIONABLE_VIEW);
  });

  it('rides LIVE_VIEW for any other entity and for untagged roots', () => {
    expect(compilePriorityForTarget(node(8, node(9)), 7)).toBe(GPU_WORK_PRIORITY.LIVE_VIEW);
    expect(compilePriorityForTarget(node(), 7)).toBe(GPU_WORK_PRIORITY.LIVE_VIEW);
  });

  it('never matches a null player target against an untagged node', () => {
    expect(compilePriorityForTarget(node(), null)).toBe(GPU_WORK_PRIORITY.LIVE_VIEW);
    expect(compilePriorityForTarget(node(7), null)).toBe(GPU_WORK_PRIORITY.LIVE_VIEW);
  });
});
