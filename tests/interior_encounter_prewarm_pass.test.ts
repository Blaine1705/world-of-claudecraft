// The pass module driven for real against a fake host. Its siblings pin source
// text; this one EXECUTES it, because the questions that matter (does a second
// attach rebuild the visuals, does a failed pass retry, does a shutdown stop
// the work) cannot be read off the source.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startInteriorEncounterPrewarm } from '../src/render/interior_encounter_prewarm_pass';

function fakeHost() {
  const compiled: string[] = [];
  const uploaded: THREE.Texture[] = [];
  const host = {
    shutdownStarted: false,
    sim: {
      player: { pos: { x: 103_300, y: 4, z: -1246 } },
    },
    scene: new THREE.Scene(),
    // The shared runBackgroundPrewarm only COMPILES when parallel shader
    // compile exists; without it, it deliberately leaves the debt lazy. The
    // machine this prewarm was measured on has it, so that is the path to drive.
    asyncCompileSupported: true,
    backgroundGpuWork: {
      run: async <T>(work: () => T | Promise<T>) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return work();
      },
    },
    webgl: { initTexture: (texture: THREE.Texture) => uploaded.push(texture) },
    compilePrewarmColorPrograms: async (root: THREE.Object3D) => {
      compiled.push(root.name || root.type);
    },
    compileShadowPrograms: async () => {},
    renderBoundedPrewarmRoot: () => {},
    compiled,
    uploaded,
  };
  return host;
}

// The pass drains through requestIdleCallback; drive it by hand so a test never
// waits on a real idle period.
function installImmediateIdle(): () => void {
  const win = globalThis as unknown as {
    requestIdleCallback?: (cb: (deadline: unknown) => void) => number;
  };
  const had = 'requestIdleCallback' in win;
  const previous = win.requestIdleCallback;
  win.requestIdleCallback = (cb: (deadline: unknown) => void) => {
    setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 5 }), 0);
    return 1;
  };
  return () => {
    if (had) win.requestIdleCallback = previous;
    else win.requestIdleCallback = undefined;
  };
}

const drain = async (): Promise<void> => {
  for (let i = 0; i < 200; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('interior encounter prewarm host contract', () => {
  it('names only members the renderer actually declares', () => {
    // The pass reaches its host through a cast, because most of what it needs is
    // private on the Renderer and no typed parameter could accept it. That cast
    // is load-bearing: a rename in renderer.ts would compile clean and break the
    // feature at runtime. This is the check that cannot exist in the type system.
    const host = readFileSync(
      new URL('../src/render/interior_encounter_prewarm_host.ts', import.meta.url),
      'utf8',
    );
    const body = host.slice(host.indexOf('export interface InteriorEncounterPrewarmHost {'));
    const members = [...body.matchAll(/^ {2}(\w+)[?:(<]/gm)].map((match) => match[1]);
    expect(members.length).toBeGreaterThanOrEqual(9);
    expect(members).toContain('compilePrewarmColorPrograms');
    expect(members).toContain('renderBoundedPrewarmRoot');

    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const missing = members.filter(
      (member) =>
        !new RegExp(
          // A field, a method, or a constructor-parameter property (`sim`).
          `^ {2,4}(?:private |public |protected |readonly )*(?:async )?${member}\\b`,
          'm',
        ).test(renderer),
    );
    expect(missing, `renderer.ts declares no such member: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('interior encounter prewarm pass (driven)', () => {
  let restoreIdle: () => void;

  beforeEach(() => {
    restoreIdle = installImmediateIdle();
  });
  afterEach(() => {
    restoreIdle();
    vi.restoreAllMocks();
  });

  it('compiles and retains the Nythraxis floor visuals, and builds no character rig', async () => {
    const host = fakeHost();
    startInteriorEncounterPrewarm('nythraxis', host);
    await drain();
    expect(host.compiled).toContain('nythraxis-grave-prewarm');
    expect(host.compiled.some((name) => /soul|player|character/i.test(name))).toBe(false);
  });

  it('warms an interior once, however many times it attaches', async () => {
    const host = fakeHost();
    startInteriorEncounterPrewarm('nythraxis', host);
    await drain();
    const afterFirst = host.compiled.length;
    startInteriorEncounterPrewarm('nythraxis', host);
    await drain();
    expect(host.compiled.length).toBe(afterFirst);
  });

  it('compiles and retains Varkhul, pillars, Tempering Ray, portals, and the Assembly', async () => {
    const host = fakeHost();
    startInteriorEncounterPrewarm('ignivar_depths', host);
    await drain();
    expect(host.compiled).toContain('varkhul-encounter-prewarm-entity');
    expect(host.compiled).toContain('varkhul-assembly-prewarm');
    expect(host.compiled).toContain('varkhul-forge-beam-prewarm');
    expect(host.compiled).toContain('varkhul-tempering-ray-prewarm');
    expect(host.compiled).toContain('varkhul-forge-portal-prewarm');
    expect(host.compiled).toContain('varkhul-worldfire-prewarm');

    const afterFirst = host.compiled.length;
    startInteriorEncounterPrewarm('ignivar_depths', host);
    await drain();
    expect(host.compiled).toHaveLength(afterFirst);
  });

  it('compiles and retains the Ignivar mechanic visuals beside the Varkhul set', async () => {
    // These are otherwise built lazily during per-frame encounter sync, after
    // the view compile-gate enumeration, so first mechanic onset would link
    // their programs (the unique Judgment charred-ground shader included) in a
    // live frame. Each staged unit compiles as its own child of the pass group.
    const host = fakeHost();
    startInteriorEncounterPrewarm('ignivar_depths', host);
    await drain();
    expect(host.compiled).toContain('ignivar-encounter-prewarm-entity');
    expect(host.compiled).toContain('ignivar-rotating-rays-prewarm');
    expect(host.compiled).toContain('ignivar-forge-judgment-prewarm');

    // A second attach of the same interior rebuilds and recompiles nothing.
    const afterFirst = host.compiled.length;
    startInteriorEncounterPrewarm('ignivar_depths', host);
    await drain();
    expect(host.compiled).toHaveLength(afterFirst);
  });

  it('compiles the Ignivar mechanic visuals in the Crucible arena and nothing of Varkhul', async () => {
    const host = fakeHost();
    startInteriorEncounterPrewarm('ignivar', host);
    await drain();
    expect(host.compiled).toContain('ignivar-encounter-prewarm-entity');
    expect(host.compiled).toContain('ignivar-rotating-rays-prewarm');
    expect(host.compiled).toContain('ignivar-forge-judgment-prewarm');
    expect(host.compiled.filter((name) => name.startsWith('varkhul-'))).toEqual([]);
  });

  it('retries an interior whose first prewarm pass failed', async () => {
    // The interior key is claimed BEFORE the work runs, so without the failure
    // arm giving it back a pass that rejected (a compile that threw, a queue
    // rejection during a graphics rebuild) left the visuals cold for the whole
    // session and they linked at first draw instead. The injected throw stands
    // in for any of those: it fails the first pass and only the first.
    const host = fakeHost();
    const pos = host.sim.player.pos;
    let failNext = true;
    Object.defineProperty(host.sim.player, 'pos', {
      get() {
        if (!failNext) return pos;
        failNext = false;
        throw new Error('prewarm pass failed');
      },
    });

    startInteriorEncounterPrewarm('nythraxis', host);
    await drain();
    expect(host.compiled).toEqual([]);

    // The same interior attaches again and the build runs this time.
    startInteriorEncounterPrewarm('nythraxis', host);
    await drain();
    expect(host.compiled.length).toBeGreaterThan(0);

    // ... and a pass that SUCCEEDED still claims the interior: no third build.
    const afterRetry = host.compiled.length;
    startInteriorEncounterPrewarm('nythraxis', host);
    await drain();
    expect(host.compiled).toHaveLength(afterRetry);
  });

  it('ignores an interior with no spec, and a host already shutting down', async () => {
    const host = fakeHost();
    startInteriorEncounterPrewarm('crypt', host);
    await drain();
    expect(host.compiled).toEqual([]);

    const dead = fakeHost();
    dead.shutdownStarted = true;
    startInteriorEncounterPrewarm('nythraxis', dead);
    await drain();
    expect(dead.compiled).toEqual([]);
  });

  it('places its hidden group where the camera is, never at the world origin', async () => {
    const host = fakeHost();
    const added: THREE.Object3D[] = [];
    host.scene.add = ((object: THREE.Object3D) => {
      added.push(object);
      return host.scene;
    }) as typeof host.scene.add;

    startInteriorEncounterPrewarm('nythraxis', host);
    await drain();

    expect(added.length).toBeGreaterThan(0);
    for (const group of added) {
      // A dungeon interior sits far from the origin: a group left there is
      // frustum-culled and its bounded warm render draws nothing.
      expect(group.position.x).toBe(host.sim.player.pos.x);
      expect(group.position.z).toBe(host.sim.player.pos.z - 24);
      expect(group.visible).toBe(false);
    }
  });
});
