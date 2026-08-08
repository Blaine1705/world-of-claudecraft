import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EntityView, Renderer } from '../src/render/renderer';

interface CompileGateHarness {
  gateViewOnCompile(view: EntityView, group: THREE.Group): Promise<void> | null;
  gateSwapOnCompile(target: THREE.Object3D): void;
  gateSwapFlagOnCompile(target: THREE.Object3D, onSettled: () => void): void;
  compileGate(target: THREE.Object3D): Promise<unknown>;
}

function harness(): CompileGateHarness & Record<string, unknown> {
  const renderer = Object.create(Renderer.prototype) as CompileGateHarness &
    Record<string, unknown>;
  renderer.asyncCompileSupported = true;
  renderer.lifecycleGeneration = 7;
  renderer.shutdownStarted = false;
  return renderer;
}

async function flushGate(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.restoreAllMocks());

describe('Renderer live shader compile rejection recovery', () => {
  it('clears a new view gate and restores its visibility for first-draw fallback', async () => {
    const renderer = harness();
    const failure = new Error('view link rejected');
    renderer.compileGate = () => Promise.reject(failure);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const group = new THREE.Group();
    const view = { compilePending: false } as EntityView;

    const ready = renderer.gateViewOnCompile(view, group);
    expect(view.compilePending).toBe(true);
    expect(group.visible).toBe(false);
    await ready;

    expect(view.compilePending).toBe(false);
    expect(group.visible).toBe(true);
    expect(report).toHaveBeenCalledWith('Live shader compile gate failed', failure);
  });

  it('restores a view gate to its prior hidden state after rejection', async () => {
    const renderer = harness();
    renderer.compileGate = () => Promise.reject(new Error('hidden view link rejected'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const group = new THREE.Group();
    group.visible = false;
    const view = { compilePending: false } as EntityView;

    await renderer.gateViewOnCompile(view, group);

    expect(view.compilePending).toBe(false);
    expect(group.visible).toBe(false);
  });

  it('reveals a live material-swap target after successful compilation', async () => {
    const renderer = harness();
    renderer.compileGate = () => Promise.resolve();
    const target = new THREE.Group();

    renderer.gateSwapOnCompile(target);
    expect(target.visible).toBe(false);
    await flushGate();

    expect(target.visible).toBe(true);
  });

  it('settles a caller-owned live-swap flag after successful compilation', async () => {
    const renderer = harness();
    renderer.compileGate = () => Promise.resolve();
    const onSettled = vi.fn();

    renderer.gateSwapFlagOnCompile(new THREE.Group(), onSettled);
    await flushGate();

    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('restores a live material-swap target after rejection', async () => {
    const renderer = harness();
    const failure = new Error('swap link rejected');
    renderer.compileGate = () => Promise.reject(failure);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = new THREE.Group();

    renderer.gateSwapOnCompile(target);
    expect(target.visible).toBe(false);
    await flushGate();

    expect(target.visible).toBe(true);
    expect(report).toHaveBeenCalledWith('Live shader compile gate failed', failure);
  });

  it('clears the caller-owned live-swap flag after rejection', async () => {
    const renderer = harness();
    const failure = new Error('flagged swap link rejected');
    renderer.compileGate = () => Promise.reject(failure);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSettled = vi.fn();

    renderer.gateSwapFlagOnCompile(new THREE.Group(), onSettled);
    await flushGate();

    expect(onSettled).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith('Live shader compile gate failed', failure);
  });

  it('ignores a rejection from a stale renderer generation', async () => {
    const renderer = harness();
    let reject!: (error: unknown) => void;
    renderer.compileGate = () => new Promise((_resolve, rejectGate) => (reject = rejectGate));
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = new THREE.Group();

    renderer.gateSwapOnCompile(target);
    renderer.lifecycleGeneration = 8;
    reject(new Error('stale link rejection'));
    await flushGate();

    expect(target.visible).toBe(false);
    expect(report).not.toHaveBeenCalled();
  });

  it('links the tier-correct colour variant then the skinned shadow variant in one gate slot', async () => {
    const renderer = harness();
    const order: string[] = [];
    renderer.sim = { player: { targetId: null } };
    renderer.liveCompileGates = { run: (fn: () => Promise<unknown>) => fn() };
    renderer.compilePrewarmColorPrograms = vi.fn(
      (_root: THREE.Object3D, includeOffscreenVariant: boolean) => {
        order.push(`color:${includeOffscreenVariant}`);
        return Promise.resolve();
      },
    );
    renderer.compileSkinnedShadowPrograms = vi.fn(() => {
      order.push('shadow');
      return Promise.resolve();
    });
    const target = new THREE.Group();

    await renderer.compileGate(target);

    expect(order).toEqual(['color:false', 'shadow']);
    expect(renderer.compilePrewarmColorPrograms).toHaveBeenCalledWith(target, false);
    expect(renderer.compileSkinnedShadowPrograms).toHaveBeenCalledWith(target);
  });

  it('never compiles a live gate at the ambient render target (colour-space cache-key trap)', () => {
    const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const gateStart = source.indexOf('private compileGate(');
    const gateEnd = source.indexOf('private recoverRejectedCompileGate(', gateStart);
    expect(gateStart).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);
    const gateMethod = source.slice(gateStart, gateEnd);
    // Three keys a program on the bound target's output colour space, so a bare
    // compileAsync here links the canvas variant while composer tiers draw the
    // linear one: route through the same variant pair the boot prewarm uses.
    expect(gateMethod).toContain('this.compilePrewarmColorPrograms(target, false)');
    expect(gateMethod).toContain('this.compileSkinnedShadowPrograms(target)');
    expect(gateMethod).not.toContain('this.webgl.compileAsync');
  });

  it('ignores a rejection after renderer shutdown starts', async () => {
    const renderer = harness();
    let reject!: (error: unknown) => void;
    renderer.compileGate = () => new Promise((_resolve, rejectGate) => (reject = rejectGate));
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    const target = new THREE.Group();

    renderer.gateSwapOnCompile(target);
    renderer.shutdownStarted = true;
    reject(new Error('shutdown link rejection'));
    await flushGate();

    expect(target.visible).toBe(false);
    expect(report).not.toHaveBeenCalled();
  });
});
