// The Balgath pair as shipped: the boss (public/models/creatures/balgath_cyclops.glb) and the
// Knucklebone of Balgath's Shape of the Foreman (public/models/chars/forms/balgath_form.glb).
//
// Both come out of ONE Blender factory (scripts/assets/balgath_cyclops/: build.py builds the
// boss, form.py the form beside it) and one ship step (ship.mjs: the glow ramp, the
// optimize pass, KTX2). The form is the boss's own body cut to about a quarter of his
// triangles, on his own 56-bone rig, but with clips of its OWN for the gaits: his walk and
// run are a giant's lumber timed for thirteen yards of granite, and driven at a player's
// 7 yd/s they whirred in place. Its Walk and Run are re-keyed for a player-sized stride, so
// the legs plant; this file measures that off the shipped file.
//
// The bytes are pinned. A re-export or a re-ship (any change to the factory, the raw
// exports, ship.mjs or its encoder) means re-running ship.mjs, then
// `node scripts/build_media_manifest.mjs generate`, then re-pinning BYTES and SHA256 below.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createGlbIO } from '../scripts/anim/pose_blend.mjs';
import { VISUALS } from '../src/render/characters/manifest';
import { FOREMAN_SHAPE_SCALE } from '../src/sim/entity';
import { RUN_SPEED } from '../src/sim/types';
import { loadRigPoser } from './helpers/gltf_pose';

vi.setConfig({ testTimeout: 120_000 });

const ROOT = path.join(__dirname, '..');
const BOSS = 'public/models/creatures/balgath_cyclops.glb';
const FORM = 'public/models/chars/forms/balgath_form.glb';

const PINS = {
  [BOSS]: {
    bytes: 3_816_948,
    sha256: '8db6af7889b5798fd87c4a24b5c117eb98efafd761a200a867af90f65d3bcc8d',
  },
  [FORM]: {
    bytes: 1_580_444,
    sha256: 'a65a9ed6f4939e698c441e3d161f4fb772b0b3f23a0a100d564ee96d447ba6cb',
  },
} as const;

/** The clips the form carries: its own gaits plus the boss's swings, slams, glare and roar. */
const FORM_CLIPS = [
  'Idle',
  'Walk',
  'Run',
  'Balgath_Swipe',
  'Balgath_Punch',
  'Balgath_Clobber',
  'Balgath_Barrowsweep',
  'Balgath_Hammer',
  'Balgath_Stomp',
  'Balgath_Smash',
  'Balgath_EyeFlare',
  'Balgath_Roar',
  'Hit',
  'Jump',
  'Death',
];

/** Standing height of both rigs in their own units (the build's idle measurement). */
const RIG_HEIGHT = 13.96;

async function root(file: string) {
  return (await createGlbIO().read(path.join(ROOT, file))).getRoot();
}

function triangles(r: Awaited<ReturnType<typeof root>>): number {
  let n = 0;
  for (const mesh of r.listMeshes())
    for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? 0) / 3;
  return n;
}

describe('the shipped Balgath pair', () => {
  it('pins both files byte for byte, the form well under the boss', () => {
    for (const [file, pin] of Object.entries(PINS)) {
      const bytes = readFileSync(path.join(ROOT, file));
      expect(bytes.length, file).toBe(pin.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(pin.sha256);
    }
    expect(PINS[FORM].bytes).toBeLessThan(PINS[BOSS].bytes / 2);
  });

  it('cuts the form to under a third of his triangles on the very same rig', async () => {
    const boss = await root(BOSS);
    const form = await root(FORM);
    expect(triangles(form)).toBeLessThan(triangles(boss) / 3);
    const joints = (r: typeof boss) =>
      r
        .listSkins()[0]
        .listJoints()
        .map((j) => j.getName());
    expect(joints(form)).toHaveLength(56);
    expect(joints(form)).toEqual(joints(boss));
  });

  it('ships the form its own clip set, death and gaits included', async () => {
    const names = (await root(FORM)).listAnimations().map((a) => a.getName());
    expect([...names].sort()).toEqual([...FORM_CLIPS].sort());
    // ...and the def names only clips the file carries.
    const clips = VISUALS.form_foreman.clips;
    const named = [
      clips.idle,
      clips.walk,
      clips.run,
      clips.death,
      clips.cast,
      clips.jump,
      clips.flourish,
      ...clips.attack,
      ...(clips.abilityAttack ?? []),
      ...(clips.hit ?? []),
    ];
    for (const clip of named) expect(names, `${clip}`).toContain(clip);
  });

  it('keeps every embedded texture KTX2 and the eye on the glow ramp', async () => {
    for (const file of [BOSS, FORM]) {
      const r = await root(file);
      for (const t of r.listTextures()) expect(t.getMimeType(), file).toBe('image/ktx2');
      const glow = r.listMaterials().find((m) => m.getName() === 'BalgathGlow');
      expect(glow?.getEmissiveTexture(), file).not.toBeNull();
      expect(glow?.getBaseColorTexture(), file).not.toBeNull();
    }
  });

  it("plants the form's feet at a player's run, inside the default clamps", async () => {
    // The owner's call: the legs have to move properly when running in the form. A planted
    // foot slides back at exactly the speed the body must travel, so the def's refs must be
    // that speed through the form's normalize (3.0 over the rig's height) and its
    // FOREMAN_SHAPE_SCALE, and a player's run must play the cycle near its natural rate.
    const def = VISUALS.form_foreman;
    const chain = (def.height / RIG_HEIGHT) * FOREMAN_SHAPE_SCALE;
    const poser = await loadRigPoser(path.join(ROOT, FORM), path.join(ROOT, FORM));
    for (const [clip, ref] of [
      ['Walk', def.walkRef],
      ['Run', def.runRef],
    ] as const) {
      const planted = plantedSpeed(poser, clip) * chain;
      expect(ref, clip).toBeDefined();
      expect(planted / (ref as number), `${clip}: planted ${planted.toFixed(2)}`).toBeGreaterThan(
        0.95,
      );
      expect(planted / (ref as number)).toBeLessThan(1.05);
    }
    const rate = RUN_SPEED / (def.runRef as number);
    expect(rate, 'the run cycle would whir').toBeLessThan(1.6);
    expect(rate, 'the run cycle would crawl').toBeGreaterThan(0.8);
    // The old donor-driven form needed its ceilings lifted to 3.9x to keep up; this one
    // runs inside the defaults.
    expect(def.runTimeScaleMax).toBeUndefined();
    expect(def.walkTimeScaleMax).toBeUndefined();
  });

  it('wears the same measured eye anchor as the boss, on the glow iris', async () => {
    const boss = VISUALS.mob_balgath_cyclops.eyeGlow;
    const form = VISUALS.form_foreman.eyeGlow;
    expect(form?.bone).toBe(boss?.bone);
    expect(form?.offset).toEqual(boss?.offset);
    expect(form?.selfLitMaterial).toBe('BalgathGlow');
    expect(boss?.selfLitMaterial).toBe('BalgathGlow');
    // The anchor sits on the front of the iris: close to the nearest glow vertex in bind
    // space (world(Head) applied to the bone-local offset).
    for (const file of [BOSS, FORM]) {
      const r = await root(file);
      const head = r.listNodes().find((n) => n.getName() === 'Head');
      const m = head?.getWorldMatrix() ?? [];
      const o = boss?.offset ?? [0, 0, 0];
      const anchor = [0, 1, 2].map(
        (i) => m[i] * o[0] + m[4 + i] * o[1] + m[8 + i] * o[2] + m[12 + i],
      );
      const node = r.listNodes().find((n) =>
        n
          .getMesh()
          ?.listPrimitives()
          .some((p) => p.getMaterial()?.getName() === 'BalgathGlow'),
      );
      const prim = node
        ?.getMesh()
        ?.listPrimitives()
        .find((p) => p.getMaterial()?.getName() === 'BalgathGlow');
      const skin = node?.getSkin();
      // Quantized positions: world(joint0) * IBM(joint0) is the dequantize-into-bind map.
      const ibm = skin?.getInverseBindMatrices()?.getElement(0, new Array(16).fill(0)) ?? [];
      const j0 = skin?.listJoints()[0].getWorldMatrix() ?? [];
      const toBind = mul(j0, ibm);
      const pos = prim?.getAttribute('POSITION');
      let best = Number.POSITIVE_INFINITY;
      const el = [0, 0, 0];
      for (let i = 0; i < (pos?.getCount() ?? 0); i++) {
        pos?.getElement(i, el);
        const p = [0, 1, 2].map(
          (k) => toBind[k] * el[0] + toBind[4 + k] * el[1] + toBind[8 + k] * el[2] + toBind[12 + k],
        );
        best = Math.min(best, Math.hypot(p[0] - anchor[0], p[1] - anchor[1], p[2] - anchor[2]));
      }
      expect(best, `${file}: the eye glow floats off the iris`).toBeLessThan(0.15);
    }
  });
});

function mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

/** Median horizontal speed of each foot over its contact samples, averaged. */
function plantedSpeed(poser: Awaited<ReturnType<typeof loadRigPoser>>, clip: string): number {
  const dur = poser.duration(clip);
  const out: number[] = [];
  for (const foot of ['L_Toes', 'R_Toes']) {
    const track: number[][] = [];
    for (let i = 0; i <= 240; i++) {
      const t = (dur * i) / 240;
      const p = poser.pose(clip, t).at(foot);
      track.push([t, p[1], p[0], p[2]]);
    }
    const ys = track.map((s) => s[1]);
    const floor = Math.min(...ys);
    const band = 0.03 * (Math.max(...ys) - floor) + 1e-6;
    const v: number[] = [];
    for (let i = 1; i < track.length; i++) {
      if (track[i][1] > floor + band || track[i - 1][1] > floor + band) continue;
      const dt = track[i][0] - track[i - 1][0];
      v.push(Math.hypot(track[i][2] - track[i - 1][2], track[i][3] - track[i - 1][3]) / dt);
    }
    v.sort((a, b) => a - b);
    out.push(v[Math.floor(v.length / 2)]);
  }
  return out.reduce((a, b) => a + b, 0) / out.length;
}
