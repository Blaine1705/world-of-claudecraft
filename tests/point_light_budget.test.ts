import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFireLightAdopter } from '../src/render/fire_light_registry';
import {
  applyPointLightBudget,
  countDrawnPointLights,
  flickerContributingFireLights,
  pointLightPadCount,
  type RankedPointLight,
} from '../src/render/point_light_budget';

const RANGE_SQ = 100 * 100;

function rankedLight(x: number, z: number, base: number | null = 5): RankedPointLight {
  const light = new THREE.PointLight(0xffffff, base ?? 5, 10, 2);
  light.position.set(x, 0, z);
  return { light, d2: 0, worldPos: new THREE.Vector3(x, 0, z), base, dynamic: false };
}

function visibleCount(ranked: RankedPointLight[]): number {
  return ranked.filter((entry) => entry.light.visible).length;
}

describe('pointLightPadCount', () => {
  it('fills the whole budget when no real lights exist', () => {
    expect(pointLightPadCount(0, 6)).toBe(6);
  });

  it('tops up when fewer real lights than the budget exist', () => {
    expect(pointLightPadCount(4, 6)).toBe(2);
  });

  it('adds nothing once the budget is met or exceeded', () => {
    expect(pointLightPadCount(6, 6)).toBe(0);
    expect(pointLightPadCount(9, 6)).toBe(0);
  });
});

describe('applyPointLightBudget', () => {
  it('keeps exactly min(ranked, visibleCount) lights visible, pads pin the total', () => {
    for (const count of [0, 2, 6, 9]) {
      const ranked: RankedPointLight[] = [];
      for (let i = 0; i < count; i++) ranked.push(rankedLight(i * 2, 0));
      applyPointLightBudget(ranked, 0, 0, 6, 6, RANGE_SQ);
      expect(visibleCount(ranked)).toBe(Math.min(count, 6));
      expect(visibleCount(ranked) + pointLightPadCount(ranked.length, 6)).toBe(6);
    }
  });

  it('sorts by distance so the visible set is the nearest one', () => {
    const a = rankedLight(1, 0);
    const b = rankedLight(2, 0);
    const c = rankedLight(3, 0);
    const ranked = [c, b, a];
    applyPointLightBudget(ranked, 0, 0, 2, 2, RANGE_SQ);
    expect(a.light.visible).toBe(true);
    expect(b.light.visible).toBe(true);
    expect(c.light.visible).toBe(false);
  });

  it('keeps the prior full-rank order when discarded-tail lights later tie', () => {
    const a = rankedLight(4, 0);
    const b = rankedLight(1, 0);
    const c = rankedLight(3, 0);
    const d = rankedLight(2, 0);
    const ranked = [a, b, c, d];

    applyPointLightBudget(ranked, 0, 0, 2, 2, RANGE_SQ);
    expect(ranked.map((entry) => entry.light)).toEqual([b.light, d.light, c.light, a.light]);

    c.worldPos.set(1, 0, 0);
    a.worldPos.set(-1, 0, 0);
    b.worldPos.set(10, 0, 0);
    d.worldPos.set(11, 0, 0);
    applyPointLightBudget(ranked, 0, 0, 2, 1, RANGE_SQ);

    expect(ranked.slice(0, 2).map((entry) => entry.light)).toEqual([c.light, a.light]);
    expect(c.light.intensity).toBe(5);
    expect(a.light.intensity).toBe(0);
  });

  it('only lights inside the live budget and range shine', () => {
    const near = rankedLight(1, 0);
    const mid = rankedLight(5, 0);
    const far = rankedLight(500, 0);
    // Already sorted by distance, so this stays green regardless of the sort guard.
    const ranked = [near, mid, far];
    applyPointLightBudget(ranked, 0, 0, 6, 2, RANGE_SQ);
    expect(near.light.intensity).toBe(5);
    expect(mid.light.intensity).toBe(5);
    expect(far.light.intensity).toBe(0);
    expect(far.light.visible).toBe(true); // counted, but contributes nothing
  });

  it('sorts by distance when the live budget truncates fewer lights than visibleCount', () => {
    // liveBudget(2) < ranked.length(3) <= visibleCount(6): a sort guard keyed off
    // visibleCount alone would skip sorting here even though the live budget still
    // truncates the ranked list, so array order (not distance) would pick the
    // winners. All three lights sit inside range so only the live-budget cutoff
    // is under test.
    const near = rankedLight(1, 0);
    const mid = rankedLight(5, 0);
    const farInRange = rankedLight(50, 0);
    const ranked = [farInRange, near, mid]; // misordered: farthest listed first
    applyPointLightBudget(ranked, 0, 0, 6, 2, RANGE_SQ);
    expect(near.light.intensity).toBe(5);
    expect(mid.light.intensity).toBe(5);
    expect(farInRange.light.intensity).toBe(0);
  });

  it('leaves base-less (externally driven) light intensity alone while shining', () => {
    const driven = rankedLight(1, 0, null);
    driven.light.intensity = 7;
    applyPointLightBudget([driven], 0, 0, 6, 6, RANGE_SQ);
    expect(driven.light.intensity).toBe(7);
    const outOfRange = rankedLight(500, 0, null);
    outOfRange.light.intensity = 7;
    applyPointLightBudget([outOfRange], 0, 0, 6, 6, RANGE_SQ);
    expect(outOfRange.light.intensity).toBe(0);
  });

  it('flickers only fire lights that survive the live budget and range', () => {
    const near = rankedLight(1, 0, null);
    const overBudget = rankedLight(2, 0, null);
    const uncounted = rankedLight(3, 0, null);
    near.fireIndex = 4;
    overBudget.fireIndex = 5;
    uncounted.fireIndex = 6;
    near.light.userData.baseIntensity = 8;
    overBudget.light.intensity = 91;
    uncounted.light.intensity = 92;
    const ranked = [uncounted, overBudget, near];

    applyPointLightBudget(ranked, 0, 0, 2, 1, RANGE_SQ);
    flickerContributingFireLights(ranked, 0.75, 2, 1, RANGE_SQ);

    expect(near.light.intensity).toBe(8 + Math.sin(0.75 * 11 + 4 * 1.7) * 2.5 * (8 / 11));
    expect(overBudget.light.intensity).toBe(0);
    expect(uncounted.light.intensity).toBe(92);
  });

  it('does not flicker view lights or counted fire lights outside range', () => {
    const fire = rankedLight(1, 0, null);
    const view = rankedLight(2, 0, null);
    const outOfRange = rankedLight(500, 0, null);
    fire.fireIndex = 2;
    outOfRange.fireIndex = 3;
    view.light.intensity = 77;
    outOfRange.light.intensity = 78;
    const ranked = [fire, view, outOfRange];

    applyPointLightBudget(ranked, 0, 0, 6, 6, RANGE_SQ);
    flickerContributingFireLights(ranked, 0.5, 6, 6, RANGE_SQ);

    expect(fire.light.intensity).toBe(11 + Math.sin(0.5 * 11 + 2 * 1.7) * 2.5);
    expect(view.light.intensity).toBe(77);
    expect(outOfRange.light.intensity).toBe(0);
  });

  // The pin's blind spot (found via BENCH_LIGHT_AUDIT on the geared-arrival
  // bench): three's render counts a point light iff its WHOLE ancestor chain
  // is visible, but the budget only drove light.visible. A budget-chosen
  // light under a group the world hid (zone streaming, far-LOD wrap, a
  // compile gate) kept its counted slot while the render dropped it, so the
  // drawn numPointLights wandered 4..10 and every new value relinked every
  // lit material in view.
  describe('drawn-eligibility (hidden ancestors, detached lights)', () => {
    function inScene(scene: THREE.Object3D, entry: RankedPointLight, parent?: THREE.Object3D) {
      (parent ?? scene).add(entry.light);
      return entry;
    }

    it('a light under a hidden ancestor gives its slot to the next eligible light', () => {
      const scene = new THREE.Scene();
      const hiddenGroup = new THREE.Group();
      hiddenGroup.visible = false;
      scene.add(hiddenGroup);
      const near = inScene(scene, rankedLight(1, 0), hiddenGroup);
      const mid = inScene(scene, rankedLight(5, 0));
      const far = inScene(scene, rankedLight(9, 0));
      const ranked = [near, mid, far];

      const drawn = applyPointLightBudget(ranked, 0, 0, 2, 2, RANGE_SQ, scene);

      expect(drawn).toBe(2);
      expect(mid.light.visible).toBe(true);
      expect(far.light.visible).toBe(true);
      expect(near.light.visible).toBe(false);
    });

    it('a light not attached under the scene root is not drawn-eligible', () => {
      const scene = new THREE.Scene();
      const attached = inScene(scene, rankedLight(2, 0));
      const detached = rankedLight(1, 0); // never added to the scene
      const ranked = [detached, attached];

      const drawn = applyPointLightBudget(ranked, 0, 0, 2, 2, RANGE_SQ, scene);

      expect(drawn).toBe(1);
      expect(attached.light.visible).toBe(true);
      expect(detached.light.visible).toBe(false);
    });

    it('returns the drawn count so pads can pin the render-visible total', () => {
      const scene = new THREE.Scene();
      const hidden = new THREE.Group();
      hidden.visible = false;
      scene.add(hidden);
      const ranked = [
        inScene(scene, rankedLight(1, 0), hidden),
        inScene(scene, rankedLight(2, 0), hidden),
        inScene(scene, rankedLight(3, 0)),
      ];

      const drawn = applyPointLightBudget(ranked, 0, 0, 6, 6, RANGE_SQ, scene);

      // One eligible light drawn; pads must fill the remaining five so the
      // scene's traverseVisible point-light count stays exactly visibleCount.
      expect(drawn).toBe(1);
      expect(pointLightPadCount(drawn, 6)).toBe(5);
    });

    it('re-admits a light the frame its ancestor is revealed', () => {
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      group.visible = false;
      scene.add(group);
      const gated = inScene(scene, rankedLight(1, 0), group);
      const other = inScene(scene, rankedLight(5, 0));
      const ranked = [gated, other];

      expect(applyPointLightBudget(ranked, 0, 0, 1, 1, RANGE_SQ, scene)).toBe(1);
      expect(other.light.visible).toBe(true);
      expect(gated.light.visible).toBe(false);

      group.visible = true;
      expect(applyPointLightBudget(ranked, 0, 0, 1, 1, RANGE_SQ, scene)).toBe(1);
      expect(gated.light.visible).toBe(true);
      expect(other.light.visible).toBe(false);
    });

    it('without a scene root every ranked light stays eligible (legacy shape)', () => {
      const ranked = [rankedLight(1, 0), rankedLight(2, 0)];
      const drawn = applyPointLightBudget(ranked, 0, 0, 6, 6, RANGE_SQ);
      expect(drawn).toBe(2);
      expect(visibleCount(ranked)).toBe(2);
    });
  });

  describe('countDrawnPointLights (the bounded prewarm mask)', () => {
    function addTo(parent: THREE.Object3D, entry: RankedPointLight): RankedPointLight {
      parent.add(entry.light);
      return entry;
    }

    it('re-derives the drawn count when a transient mask hides chosen ancestors', () => {
      // The zone-prewarm bounded render hides most top-level scene children
      // transiently, OUT OF BAND of the budget pass: view lights under those
      // children leave Three's counted set, NUM_POINT_LIGHTS drifts below the
      // pinned total, and the bounded render synchronously links a program
      // variant the live render never draws (measured: prewarm units with a
      // link cost ~119 ms on a 3090; units without, 0.3 ms).
      const scene = new THREE.Scene();
      const viewGroup = new THREE.Group();
      scene.add(viewGroup);
      const viewLight = addTo(viewGroup, rankedLight(1, 0));
      const rootLight = addTo(scene, rankedLight(2, 0));
      const ranked = [viewLight, rootLight];
      applyPointLightBudget(ranked, 0, 0, 6, 6, RANGE_SQ, scene);
      expect(countDrawnPointLights(ranked, scene)).toBe(2);

      // The bounded mask hides the view group; no budget pass runs in between.
      viewGroup.visible = false;
      const boundedDrawn = countDrawnPointLights(ranked, scene);
      expect(boundedDrawn).toBe(1);
      // The pad top-up restores the exact pinned total the compile lane
      // linked against, so the bounded render draws the same variant.
      expect(boundedDrawn + pointLightPadCount(boundedDrawn, 6)).toBe(6);
    });

    it('does not count a light the budget itself turned off', () => {
      const scene = new THREE.Scene();
      const near = addTo(scene, rankedLight(1, 0));
      const far = addTo(scene, rankedLight(9, 0));
      const ranked = [near, far];
      applyPointLightBudget(ranked, 0, 0, 1, 1, RANGE_SQ, scene);
      expect(far.light.visible).toBe(false);
      expect(countDrawnPointLights(ranked, scene)).toBe(1);
    });

    it('does not count a detached light', () => {
      const scene = new THREE.Scene();
      const attached = addTo(scene, rankedLight(1, 0));
      const detached = rankedLight(2, 0);
      attached.light.visible = true;
      detached.light.visible = true;
      expect(countDrawnPointLights([attached, detached], scene)).toBe(1);
    });
  });

  it('wires the bounded prewarm render to re-pin the pads in its masked state', () => {
    // The bounded render's visibility mask hides entity views (and their
    // lights) without a budget pass: it must recount drawn lights in ITS
    // state, pad up to the same pinned total the compile lane linked against
    // BEFORE rendering, and restore the live pad state afterwards. Dropping
    // any half silently reinstates the synchronous mid-unit program links.
    const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const methodStart = source.indexOf('private renderBoundedPrewarmRoot(');
    const methodEnd = source.indexOf('private renderPrewarmPass(', methodStart);
    expect(methodStart).toBeGreaterThan(-1);
    expect(methodEnd).toBeGreaterThan(methodStart);
    const method = source.slice(methodStart, methodEnd);
    expect(method).toContain('countDrawnPointLights(this.lightRank, this.scene)');
    expect(method).toContain('pointLightPadCount(');
    expect(method).toContain('GFX.maxPointLights');
    const sceneMaskIndex = method.indexOf('boundedPrewarmVisibility');
    // The recount must observe BOTH mask levels: the scene-level mask and the
    // group-level one (a recount between the two would still miss the drift).
    const groupMaskIndex = method.indexOf('entry === childRoot');
    const countIndex = method.indexOf('countDrawnPointLights');
    const padWriteIndex = method.indexOf('this.lightPads[i].visible = i < boundedPadCount');
    const renderIndex = method.indexOf('this.webgl.render(');
    const finallyIndex = method.indexOf('} finally {');
    const restoreIndex = method.indexOf('previousPadVisibility[');
    expect(sceneMaskIndex).toBeGreaterThan(-1);
    expect(groupMaskIndex).toBeGreaterThan(sceneMaskIndex);
    expect(countIndex).toBeGreaterThan(groupMaskIndex);
    // The pad WRITE must land between the recount and the render: pinned
    // separately because the count/pad substrings also appear in comments.
    expect(padWriteIndex).toBeGreaterThan(countIndex);
    expect(renderIndex).toBeGreaterThan(padWriteIndex);
    // The pad restore must live in the finally: restored only after the render
    // would leak raised pads into live frames on a throw.
    expect(finallyIndex).toBeGreaterThan(renderIndex);
    expect(restoreIndex).toBeGreaterThan(finallyIndex);
  });

  it('wires the drawn-count pin: scene root in, pads on the drawn count out', () => {
    // The whole-scene relink fix has two wiring halves that no unit case can
    // see: the renderer must pass its scene so ancestry is checked against the
    // real root, and the pads must fill against the DRAWN count, not the
    // chosen count. Dropping either silently reinstates the arrival freeze.
    // The pass moved out of renderer.ts into fire_light_registry.ts under the
    // monolith ratchet; the two halves are pinned where they now live, and the
    // renderer half is pinned to the scene it hands in.
    const source = readFileSync(
      new URL('../src/render/fire_light_registry.ts', import.meta.url),
      'utf8',
    );
    const methodStart = source.indexOf('export function runFireLightBudgetPass(');
    const methodEnd = source.indexOf('pass.pads[i].visible = i < padCount;', methodStart);
    // A renamed end marker must fail here, never silently widen the slice to
    // the rest of the file (which would let the pins match anywhere).
    expect(methodStart).toBeGreaterThan(-1);
    expect(methodEnd).toBeGreaterThan(methodStart);
    const method = source.slice(methodStart, methodEnd);

    expect(method).toContain('const drawnCount = applyPointLightBudget(');
    expect(method).toContain('pass.scene,');
    expect(method).toContain('pointLightPadCount(drawnCount, pass.visibleCount)');
    expect(method).not.toContain('pointLightPadCount(ranked.length');

    // The renderer must still hand its OWN scene in, so ancestry is checked
    // against the real root rather than a detached one.
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    expect(renderer).toContain('scene: this.scene,');
  });

  it('wires mid-session fx lights into the same ranked budget', () => {
    // An fx that mints a point light mid-session (the warlock infernal) must
    // hand it to the renderer's registration seam: marked dynamic, hidden until
    // the first budget pass ranks it, in the SAME viewLights pool with the rank
    // marked dirty, and spliced back out on release. Any half dropped puts an
    // unranked visible light in the scene, which changes numPointLights and
    // relinks every lit material in view.
    const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const registerStart = source.indexOf('private registerBudgetPointLight(');
    const releaseStart = source.indexOf('private releaseBudgetPointLight(');
    const budgetStart = source.indexOf('private budgetFireLights(');
    expect(registerStart).toBeGreaterThan(-1);
    expect(releaseStart).toBeGreaterThan(registerStart);
    expect(budgetStart).toBeGreaterThan(releaseStart);

    const register = source.slice(registerStart, releaseStart);
    expect(register).toContain('light.userData.budgetDynamic = true;');
    expect(register).toContain('light.visible = false;');
    expect(register).toContain('this.viewLights.push(light);');
    expect(register).toContain('this.lightRankDirty = true;');

    const release = source.slice(releaseStart, budgetStart);
    expect(release).toContain('this.viewLights.indexOf(light)');
    expect(release).toContain('this.viewLights.splice(index, 1);');
    expect(release).toContain('this.lightRankDirty = true;');

    // And the warlock meteor fx is actually handed that seam.
    const fxStart = source.indexOf('this.warlockMeteorFx = new WarlockMeteorFx(');
    const fxEnd = source.indexOf('this.necromancyGroundFx = new NecromancyGroundFx(', fxStart);
    expect(fxStart).toBeGreaterThan(-1);
    expect(fxEnd).toBeGreaterThan(fxStart);
    const construction = source.slice(fxStart, fxEnd);
    expect(construction).toContain('register: (light) => this.registerBudgetPointLight(light),');
    expect(construction).toContain('release: (light) => this.releaseBudgetPointLight(light),');
  });

  it('a post-pass fx lifecycle change re-run restores the pinned total (landing and expiry)', () => {
    // Frame order on a meteor landing: budget pass first, then the fx update
    // releases the visible fall light and registers the hidden impact light.
    // Without a recovery pass the frame renders one light short of the pinned
    // total, numPointLights moves, and every lit material relinks. The
    // recovery re-run (budget plus pads) must restore the total in-frame.
    const VISIBLE = 4;
    const ranked: RankedPointLight[] = [];
    for (let i = 0; i < 6; i++) ranked.push(rankedLight(i * 2 + 2, 0));
    const fall = new THREE.PointLight(0xffffff, 9, 26, 1.7);
    const fallEntry: RankedPointLight = {
      light: fall,
      d2: 0,
      worldPos: new THREE.Vector3(1, 0, 0),
      base: null,
      dynamic: false,
    };
    ranked.push(fallEntry);

    let drawn = applyPointLightBudget(ranked, 0, 0, VISIBLE, VISIBLE, RANGE_SQ);
    expect(fall.visible).toBe(true);
    expect(visibleCount(ranked) + pointLightPadCount(drawn, VISIBLE)).toBe(VISIBLE);

    // Landing: the fx releases the visible fall light and registers the
    // impact light hidden (the registration seam hides it on the way in).
    ranked.splice(ranked.indexOf(fallEntry), 1);
    const impact = new THREE.PointLight(0xffffff, 14, 28, 1.5);
    impact.visible = false;
    ranked.push({
      light: impact,
      d2: 0,
      worldPos: new THREE.Vector3(0.5, 0, 0),
      base: null,
      dynamic: true,
    });

    // The defect: without the recovery pass the rendered total dips by one.
    expect(visibleCount(ranked) + pointLightPadCount(drawn, VISIBLE)).toBe(VISIBLE - 1);

    drawn = applyPointLightBudget(ranked, 0, 0, VISIBLE, VISIBLE, RANGE_SQ);
    expect(visibleCount(ranked) + pointLightPadCount(drawn, VISIBLE)).toBe(VISIBLE);

    // Impact expiry releases its light too; the re-run restores again.
    ranked.pop();
    drawn = applyPointLightBudget(ranked, 0, 0, VISIBLE, VISIBLE, RANGE_SQ);
    expect(visibleCount(ranked) + pointLightPadCount(drawn, VISIBLE)).toBe(VISIBLE);
  });

  it('both frame paths re-run the budget after the meteor fx update', () => {
    // The meteor fx is the one budget-light owner updating after the pass: a
    // landing or expiry frame must re-run the budget before rendering, or the
    // pinned visible total dips for exactly that frame.
    const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const sites = [
      ...source.matchAll(/this\.warlockMeteorFx\.update\(dt, this\.reducedMotion\(\)\);/g),
    ];
    expect(sites.length).toBe(2);
    const windows = sites.map((site) => {
      const from = (site.index ?? 0) + site[0].length;
      const next = source.indexOf('this.necromancyGroundFx.update(', from);
      expect(next).toBeGreaterThan(from);
      return source.slice(from, next);
    });
    // The prewarm frame path budgets without flicker, the live sync path with:
    // each recovery call must mirror its own path's primary pass exactly.
    expect(windows[0]).toContain(
      'if (this.lightRankDirty) this.budgetFireLights(p.pos.x, p.pos.z);',
    );
    expect(windows[1]).toContain(
      'if (this.lightRankDirty) this.budgetFireLights(p.pos.x, p.pos.z, true);',
    );
  });

  it('wires contributor flicker after the renderer completes selection', () => {
    const source = readFileSync(
      new URL('../src/render/fire_light_registry.ts', import.meta.url),
      'utf8',
    );
    const methodStart = source.indexOf('export function runFireLightBudgetPass(');
    const methodEnd = source.indexOf('pass.pads[i].visible = i < padCount;', methodStart);
    const method = source.slice(methodStart, methodEnd);
    const selection = method.indexOf('applyPointLightBudget(');
    const flickerGate = method.indexOf('if (pass.flickerTime !== null) {');
    const flickerCall = method.indexOf('flickerContributingFireLights(');

    expect(methodStart).toBeGreaterThan(-1);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(selection).toBeGreaterThan(-1);
    expect(flickerGate).toBeGreaterThan(selection);
    expect(flickerCall).toBeGreaterThan(flickerGate);
    // The flicker arm is only reached because the renderer asks for it on the
    // live frame path; pin that call where it lives.
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    expect(renderer).toContain('this.budgetFireLights(p.pos.x, p.pos.z, true);');
  });
});

describe('fire-light adoption sink', () => {
  // three counts a light into numPointLights the moment it is visible, whatever
  // its intensity, and that count sits in every material's program cache key: a
  // light visible before the budget ranks it changes the count for the frames in
  // between and relinks every material drawn in them (measured at 100 to 200 ms
  // per relink). Adoption has to hide AND dirty, and these drive the real
  // factory so dropping either line in production turns them red.
  function adopterOver(registry: THREE.PointLight[]) {
    let dirty = 0;
    const adopter = createFireLightAdopter(
      () => registry,
      () => {
        dirty++;
      },
    );
    return { adopter, dirtyCount: () => dirty };
  }

  it('hides an adopted light and marks the rank dirty in the same step', () => {
    const registry: THREE.PointLight[] = [];
    const { adopter, dirtyCount } = adopterOver(registry);
    const light = new THREE.PointLight(0xffffff, 9, 24, 2);
    expect(light.visible, 'three creates a point light visible').toBe(true);

    adopter.adopt(light);

    expect(light.visible).toBe(false);
    expect(registry).toEqual([light]);
    expect(dirtyCount()).toBe(1);
  });

  it('adopts every light of a multi-light sink push', () => {
    // The rebuild guard compares rank length against a COUNT, so the dirty mark
    // cannot be skipped: a balanced add-and-remove would leave a stale rank.
    const registry: THREE.PointLight[] = [];
    const { adopter, dirtyCount } = adopterOver(registry);
    const lights = [
      new THREE.PointLight(0xffffff, 1, 4, 2),
      new THREE.PointLight(0xffffff, 2, 5, 2),
      new THREE.PointLight(0xffffff, 3, 6, 2),
    ];

    expect(adopter.sink.push(...lights)).toBe(3);

    expect(lights.every((light) => light.visible === false)).toBe(true);
    expect(registry).toEqual(lights);
    expect(dirtyCount()).toBe(3);
  });

  it('reads the registry through the getter, so a reassigned array still adopts', () => {
    // renderer.ts assigns `this.fireLights = props.fireLights` after the adopter
    // is constructed; a captured array would silently adopt into a dead one.
    let registry: THREE.PointLight[] = [];
    const adopter = createFireLightAdopter(
      () => registry,
      () => {},
    );
    const replaced: THREE.PointLight[] = [];
    registry = replaced;
    const light = new THREE.PointLight(0xffffff, 5, 10, 2);

    adopter.adopt(light);

    expect(replaced).toEqual([light]);
  });

  it('wires every post-construction registry mutation through adoption', () => {
    // Source-scan, because no unit case can see whether a CALL SITE bypassed the
    // seam. A bare `this.fireLights.push` after the constructor's mass hide, or a
    // retire that forgets the dirty mark, reinstates the relink bug.
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    expect(renderer).toContain(
      'for (const light of view.glowLights ?? []) this.fireLightAdopter.adopt(light)',
    );
    expect(renderer).toContain(
      'for (const light of this.jailScene.glowLights) this.fireLightAdopter.adopt(light)',
    );
    // retireInteriorGroup must dirty the rank on REMOVAL: the guard is a count,
    // so an add and a remove of equal size would leave the rank stale.
    const retireStart = renderer.indexOf('private retireInteriorGroup(');
    const retireEnd = renderer.indexOf('private ensureDungeons(', retireStart);
    expect(retireStart).toBeGreaterThan(-1);
    expect(retireEnd).toBeGreaterThan(retireStart);
    const retire = renderer.slice(retireStart, retireEnd);
    expect(retire).toContain('this.fireLights.splice(i, 1);');
    expect(retire).toContain('this.lightRankDirty = true;');
  });

  it('gives the jail gate light to the budget with its authored intensity', () => {
    // Source-scan: buildJailScene mints canvas textures, so it cannot run in
    // this suite's plain-Node env. The light used to be in NO registry while its
    // group is toggled every frame AFTER the budget pass, so it moved
    // numPointLights whenever the jail came into camera range. Adoption also
    // puts it under the fire flicker, which centres on userData.baseIntensity
    // (11 when unset), so the authored 9 has to travel with it.
    const jail = readFileSync(new URL('../src/render/jail_scene.ts', import.meta.url), 'utf8');
    expect(jail).toContain('glowLights: THREE.PointLight[];');
    expect(jail).toContain('light.userData.baseIntensity = 9;');
    expect(jail).toContain('glowLights.push(light);');
    const declaration = jail.indexOf('const light = new THREE.PointLight(0x86b4ff, 9, 24, 2);');
    expect(declaration, 'the jail gate light moved or changed its authored value').toBeGreaterThan(
      -1,
    );
    expect(jail.indexOf('light.userData.baseIntensity = 9;')).toBeGreaterThan(declaration);
  });
});
