import { describe, expect, it, vi } from 'vitest';
import { createPrewarmResumeStartGate } from '../src/render/prewarm_resume_start_gate_core';

describe('prewarm resume start gate', () => {
  it('holds deferred GPU work until the first-paint owner releases it', async () => {
    const gate = createPrewarmResumeStartGate();
    const resumed = vi.fn();
    void gate.wait.then(resumed);

    await Promise.resolve();
    expect(resumed).not.toHaveBeenCalled();

    gate.release();
    await gate.wait;
    expect(resumed).toHaveBeenCalledOnce();
  });

  it('is safe to release more than once', async () => {
    const gate = createPrewarmResumeStartGate();
    gate.release();
    gate.release();
    await expect(gate.wait).resolves.toBeUndefined();
  });
});
