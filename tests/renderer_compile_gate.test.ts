import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as characters from '../src/render/characters';
import { type EntityView, Renderer } from '../src/render/renderer';

interface CompileGateHarness {
  gateViewOnCompile(view: EntityView, group: THREE.Group): Promise<void> | null;
  gateSwapOnCompile(target: THREE.Object3D): void;
  gateSwapFlagOnCompile(target: THREE.Object3D, onSettled: () => void): void;
  compileGate(target: THREE.Object3D): Promise<unknown>;
  attachZoneFeature(
    view: { group: THREE.Group; glowLights?: THREE.PointLight[]; cullGroups?: THREE.Group[] },
    freeze?: boolean,
  ): void;
}

function zoneFeatureHarness(): CompileGateHarness & Record<string, unknown> {
  const renderer = harness();
  const added: THREE.Object3D[] = [];
  renderer.scene = { add: (o: THREE.Object3D) => added.push(o) };
  renderer.sceneAdded = added;
  renderer.tmpV = new THREE.Vector3();
  renderer.fireLights = [];
  renderer.lastAttachedFeatureGroups = [];
  renderer.zoneFeatureGroups = [];
  renderer.lightRankDirty = false;
  return renderer;
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
    renderer.compileShadowPrograms = vi.fn(() => {
      order.push('shadow');
      return Promise.resolve();
    });
    // the touch tail reads renderer.properties for the target's materials
    const properties = { get: vi.fn(() => ({})) };
    renderer.webgl = { properties };
    const target = new THREE.Group();
    target.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));

    await renderer.compileGate(target);

    expect(order).toEqual(['color:false', 'shadow']);
    expect(properties.get).toHaveBeenCalledTimes(1);
    expect(renderer.compilePrewarmColorPrograms).toHaveBeenCalledWith(target, false);
    expect(renderer.compileShadowPrograms).toHaveBeenCalledWith(target);
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
    expect(gateMethod).toContain('this.compileShadowPrograms(target)');
    expect(gateMethod).toContain('touchLinkedPrograms(this.webgl.properties, target)');
    expect(gateMethod).not.toContain('this.webgl.compileAsync');
  });

  it('gates a zone feature attach and defers its distance-cull registration', async () => {
    const renderer = zoneFeatureHarness();
    let release!: () => void;
    renderer.compileGate = () => new Promise<void>((resolve) => (release = resolve));
    const group = new THREE.Group();

    renderer.attachZoneFeature({ group });

    expect(renderer.sceneAdded).toContain(group);
    expect(group.visible).toBe(false);
    // The per-frame fog sweep (updateZoneFeatureVisibility) must not see the
    // group until reveal, or it flips the hidden group visible mid-compile.
    expect(renderer.zoneFeatureGroups).toEqual([]);

    release();
    await flushGate();
    await flushGate();

    expect(group.visible).toBe(true);
    expect((renderer.zoneFeatureGroups as unknown[]).length).toBe(1);
  });

  it('attaches a zone feature directly when async compile is unsupported', () => {
    const renderer = zoneFeatureHarness();
    renderer.asyncCompileSupported = false;
    renderer.compileGate = () => {
      throw new Error('must not gate without async compile support');
    };
    const group = new THREE.Group();

    renderer.attachZoneFeature({ group });

    expect(group.visible).toBe(true);
    expect((renderer.zoneFeatureGroups as unknown[]).length).toBe(1);
  });

  it('routes every dungeon interior build through the gate-injected constructor', () => {
    const rendererSource = readFileSync(
      new URL('../src/render/renderer.ts', import.meta.url),
      'utf8',
    );
    // One construction point: ensureDungeons injects the live compile gate, so
    // a streamed interior (dungeon approach, delve module, rift floor) never
    // links its programs synchronously on its first visible frame.
    expect(rendererSource.split('new DungeonInteriors(').length - 1).toBe(1);
    const ensureStart = rendererSource.indexOf('private ensureDungeons(');
    expect(ensureStart).toBeGreaterThan(-1);
    const ensureBody = rendererSource.slice(ensureStart, rendererSource.indexOf('}', ensureStart));
    expect(ensureBody).toContain(
      'this.asyncCompileSupported ? (target) => this.compileGate(target) : undefined',
    );
    const dungeonSource = readFileSync(
      new URL('../src/render/dungeon.ts', import.meta.url),
      'utf8',
    );
    expect(dungeonSource).toContain(
      'await attachSceneGroupGated(this.scene, group, this.compileGate)',
    );
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

describe('the shadow arm compiles casters only', () => {
  // A non-caster mesh (a composed far mesh, a click proxy, a halo) has no
  // shadow-pass program. Left on the mesh during the shadow-camera compile
  // its colour material relinks as a fog-less twin the scene pass never
  // draws: four wasted driver links per far bake, queued ahead of the
  // programs the reveal actually waits on (measured on both GPUs).
  function shadowHarness() {
    const renderer = harness();
    renderer.sun = { shadow: { camera: new THREE.PerspectiveCamera() } };
    renderer.scene = { fog: { name: 'fog' } };
    renderer.prewarmDepthMaterials = new Map();
    renderer.prewarmDepthMaterial = (material: THREE.Material) => {
      const depth = new THREE.MeshDepthMaterial();
      depth.name = `depth:${material.name}`;
      return depth;
    };
    return renderer as typeof renderer & {
      compileShadowPrograms(root: THREE.Object3D): Promise<void>;
    };
  }

  it('swaps casters to depth materials and takes non-caster materials off for the prologue, restoring both BEFORE the awaited link', async () => {
    const renderer = shadowHarness();
    const seen: string[] = [];
    let compiledRoot: THREE.Object3D | null = null;
    let resolveLink!: (root: THREE.Object3D) => void;
    renderer.webgl = {
      getRenderTarget: () => null,
      setRenderTarget: () => {},
      compileAsync: (root: THREE.Object3D) => {
        compiledRoot = root;
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const material = mesh.material as THREE.Material | THREE.Material[] | null;
          seen.push(
            `${mesh.name}:${material === null ? 'null' : Array.isArray(material) ? material.map((m) => m.name).join('|') : material.name}`,
          );
        });
        return new Promise<THREE.Object3D>((resolve) => {
          resolveLink = resolve;
        });
      },
    };
    const wrap = new THREE.Group();
    const farMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    farMesh.name = 'far';
    (farMesh.material as THREE.Material).name = 'far_body';
    farMesh.castShadow = false;
    const proxy = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    proxy.name = 'proxy';
    (proxy.material as THREE.Material).name = 'shadow_only';
    proxy.castShadow = true;
    const multi = new THREE.Mesh(new THREE.BufferGeometry(), [
      new THREE.MeshStandardMaterial({ name: 'a' }),
      new THREE.MeshStandardMaterial({ name: 'b' }),
    ]);
    multi.name = 'multi';
    multi.castShadow = true;
    wrap.add(farMesh, proxy, multi);
    const farMaterial = farMesh.material;
    const proxyMaterial = proxy.material;
    const multiMaterial = multi.material;

    const pending = renderer.compileShadowPrograms(wrap);

    expect(compiledRoot).toBe(wrap);
    // during the prologue: casters wear their depth twins (each material of a
    // multi-material caster), the non-caster nothing
    expect(seen.sort()).toEqual(['far:null', 'multi:depth:a|depth:b', 'proxy:depth:shadow_only']);
    // and every material is back on its mesh while the link is still pending
    // (a late restore would draw a visible non-caster as NOTHING for the link)
    expect(farMesh.material).toBe(farMaterial);
    expect(proxy.material).toBe(proxyMaterial);
    expect(multi.material).toBe(multiMaterial);
    resolveLink(wrap);
    await pending;
  });

  it('restores every swap when the walk throws part-way', async () => {
    const renderer = shadowHarness();
    renderer.prewarmDepthMaterial = (material: THREE.Material) => {
      if (material.name === 'boom') throw new Error('unexpected slot');
      return new THREE.MeshDepthMaterial();
    };
    const compileAsync = vi.fn();
    renderer.webgl = { getRenderTarget: () => null, setRenderTarget: () => {}, compileAsync };
    const first = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    first.castShadow = false;
    const second = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ name: 'boom' }),
    );
    second.castShadow = true;
    const root = new THREE.Group();
    root.add(first, second);
    const firstMaterial = first.material;
    const secondMaterial = second.material;
    await expect(renderer.compileShadowPrograms(root)).rejects.toThrow('unexpected slot');
    expect(first.material).toBe(firstMaterial);
    expect(second.material).toBe(secondMaterial);
    expect(compileAsync).not.toHaveBeenCalled();
  });

  it('compiles nothing for a root without casters, and leaves its materials alone', async () => {
    const renderer = shadowHarness();
    const compileAsync = vi.fn(() => Promise.resolve());
    renderer.webgl = { getRenderTarget: () => null, setRenderTarget: () => {}, compileAsync };
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    mesh.castShadow = false;
    const material = mesh.material;
    const root = new THREE.Group();
    root.add(mesh);

    await renderer.compileShadowPrograms(root);

    expect(compileAsync).not.toHaveBeenCalled();
    expect(mesh.material).toBe(material);
  });
});

describe('the far-bake compile gate handed to character visuals', () => {
  // A composed body bakes its far LOD on its first far crossing, AFTER the
  // view's creation gate walked the rig, and a skin change rebuilds the far
  // set: both are new programs the view gate never saw. The visual owns the
  // reveal (its far/shadow flags are recomputed per frame), so the renderer
  // hands it gateSwapFlagOnCompile as a callback at every live build.

  it('installs the renderer gate on every visual createCharacterVisualWithRetry builds', () => {
    const renderer = harness();
    const sentinel = () => {};
    renderer.farBakeGate = sentinel;
    renderer.viewCreateRetry = {
      canAttempt: () => true,
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    const setFarBakeGate = vi.fn();
    vi.spyOn(characters, 'createCharacterVisual').mockReturnValue({
      setFarBakeGate,
    } as unknown as ReturnType<typeof characters.createCharacterVisual>);
    const entity = { id: 7 } as Parameters<typeof characters.createCharacterVisual>[0];

    const built = (
      renderer as unknown as {
        createCharacterVisualWithRetry(e: unknown, slot: string): unknown;
      }
    ).createCharacterVisualWithRetry(entity, 'view');

    expect(built).not.toBeNull();
    expect(setFarBakeGate).toHaveBeenCalledWith(sentinel);
    // and a failed build installs nothing (there is no visual to install on)
    vi.spyOn(characters, 'createCharacterVisual').mockReturnValue(null);
    setFarBakeGate.mockClear();
    (
      renderer as unknown as {
        createCharacterVisualWithRetry(e: unknown, slot: string): unknown;
      }
    ).createCharacterVisualWithRetry(entity, 'view');
    expect(setFarBakeGate).not.toHaveBeenCalled();
  });

  it('is gateSwapFlagOnCompile, bound once (source pin)', () => {
    // The gate is a class field (an arrow bound to the renderer), which an
    // Object.create harness cannot construct; pin its shape here and rely on
    // the gateSwapFlagOnCompile behaviours above for what it does.
    const rendererSource = readFileSync(
      new URL('../src/render/renderer.ts', import.meta.url),
      'utf8',
    );
    // ...and one crowd bake links at a time: the gate is enqueued on the
    // renderer's SerialGateLane, the caller's settle riding the lane's.
    expect(rendererSource).toContain(
      'private readonly farBakeGate: FarBakeGate = (target, onSettled) =>\n' +
        '    this.farBakeLane.enqueue((settled) => this.gateSwapFlagOnCompile(target, settled), onSettled);',
    );
    expect(rendererSource).toContain('private readonly farBakeLane = new SerialGateLane();');
    // Both live build paths install it: fresh builds and pool re-acquires.
    expect(rendererSource).toContain('visual.setFarBakeGate(this.farBakeGate);');
    expect(rendererSource).toContain('farBakeGate: () => this.farBakeGate,');
  });
});
