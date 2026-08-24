import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type RigidCameraPivot, rigidCameraPivotInto } from '../src/render/camera_pivot_core';

const rendererSource = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

const pivot = (): RigidCameraPivot => ({
  playerX: 0,
  playerY: 0,
  playerZ: 0,
  eyeY: 0,
  cameraX: 0,
  cameraY: 0,
  cameraZ: 0,
});

describe('rigid camera pivot', () => {
  it('translates camera and look target exactly with every displayed-player movement', () => {
    const out = pivot();
    const yaw = 0.73;
    const pitch = -0.28;
    const distance = 9;
    rigidCameraPivotInto(out, 4, 3, -8, yaw, pitch, distance, Infinity);
    const first = { ...out };

    rigidCameraPivotInto(out, -2, 7, 5, yaw, pitch, distance, Infinity);
    expect(out.playerX - first.playerX).toBe(-6);
    expect(out.playerY - first.playerY).toBe(4);
    expect(out.playerZ - first.playerZ).toBe(13);
    expect(out.cameraX - first.cameraX).toBeCloseTo(-6, 12);
    expect(out.cameraY - first.cameraY).toBeCloseTo(4, 12);
    expect(out.cameraZ - first.cameraZ).toBeCloseTo(13, 12);
    expect(out.eyeY).toBe(9);
  });

  it('is memoryless across reversals and applies only the underwater height ceiling', () => {
    const out = pivot();
    rigidCameraPivotInto(out, 0, 2, 0, 0, 0, 8, Infinity);
    rigidCameraPivotInto(out, 10, 2, 0, 0, 0, 8, Infinity);
    expect(out.playerX).toBe(10);
    expect(out.cameraX).toBe(10);
    expect(out.cameraZ).toBe(-8);

    rigidCameraPivotInto(out, -3, 2, 0, 0, Math.PI / 4, 8, 5);
    expect(out.playerX).toBe(-3);
    expect(out.cameraX).toBe(-3);
    expect(out.cameraY).toBe(5);
    expect(out.cameraZ).toBeCloseTo(-Math.SQRT1_2 * 8, 12);
  });

  it('keeps the renderer wired directly to the pure rigid pivot', () => {
    expect(rendererSource).not.toContain('camera_boom_core');
    expect(rendererSource).not.toContain('camBoom');
    expect(rendererSource).not.toContain('camFeel.lead');
    expect(rendererSource).toContain('rigidCameraPivotInto(');
    expect(rendererSource).toContain('this.camera.position.set(cx, Math.max(cy, groundY), cz);');
    expect(rendererSource).toContain('this.cameraLookAt.set(px, eyeY, pz);');
  });
});
