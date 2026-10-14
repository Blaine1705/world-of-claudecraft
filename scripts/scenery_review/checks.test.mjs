import assert from 'node:assert/strict';
import { test } from 'node:test';
import { valid } from './checks.mjs';

function fixture() {
  const before = {
    visibility: 'visible',
    governor: false,
    buffer: { width: 1920, height: 1080 },
    quality: { geometry: 1 },
    tier: 'medium',
    glRenderer: 'ANGLE (NVIDIA GeForce RTX 3060)',
    queuePending: 0,
    queueActive: 0,
    pendingZones: 0,
    waitingTails: [],
    queueUnits: 12,
    programs: 100,
  };
  return {
    before,
    sample: {
      submitted: 1200,
      callbacks: 1200,
      skips: 0,
      start: structuredClone(before),
      points: [structuredClone(before)],
      end: structuredClone(before),
    },
  };
}
const gpu = /RTX\s*3060/i;
test('accepts stable submitted frames on the expected GPU', () => {
  const { sample, before } = fixture();
  assert.equal(valid(sample, before, gpu), true);
});
test('rejects a different GPU, a background tab and a changed drawing buffer', () => {
  for (const mutation of [
    (p) => {
      p.glRenderer = 'SwiftShader';
    },
    (p) => {
      p.visibility = 'hidden';
    },
    (p) => {
      p.buffer.width = 1280;
    },
  ]) {
    const { sample, before } = fixture();
    mutation(sample.points[0]);
    assert.equal(valid(sample, before, gpu), false);
  }
});
test('rejects transient preparation and quality changes inside the window', () => {
  for (const mutation of [
    (p) => {
      p.queuePending = 1;
    },
    (p) => {
      p.waitingTails = ['preview'];
    },
    (p) => {
      p.quality.geometry = 0.5;
    },
    (p) => {
      p.governor = true;
    },
    (p) => {
      p.tier = 'low';
    },
  ]) {
    const { sample, before } = fixture();
    mutation(sample.points[0]);
    assert.equal(valid(sample, before, gpu), false);
  }
});
test('rejects shader compilation and completed new preparation units', () => {
  for (const key of ['programs', 'queueUnits']) {
    const { sample, before } = fixture();
    sample.end[key]++;
    assert.equal(valid(sample, before, gpu), false);
  }
});
test('rejects a zero-frame window and excessive skipped callbacks', () => {
  const first = fixture();
  first.sample.submitted = 0;
  assert.equal(valid(first.sample, first.before, gpu), false);
  const second = fixture();
  second.sample.skips = 20;
  assert.equal(valid(second.sample, second.before, gpu), false);
});
