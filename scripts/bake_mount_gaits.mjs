// Bake procedural gait clips (Idle/Walk/Run/Death) into the rigged Tripo
// mount GLBs, replacing the Tripo quadruped retarget output. That retarget
// (rig model v2.5) returns a single near-static "walk" that animates only 4-5
// of the 20-33 joints, so mounts glided with frozen legs. These clips are
// authored directly against each rig's own bind pose: every rotation key is
// rest * delta, so the pose can never leave the authored bind space.
//
//   node scripts/bake_mount_gaits.mjs            (all rigged mounts)
//   node scripts/bake_mount_gaits.mjs valorsteed (one)
//
// Rewrites public/models/mounts/<key>.glb in place. Idempotent: existing
// animations are dropped and regenerated from the (unchanged) bind data.
// The clipless prop-lane mounts (snail, hover cycle, griffin) keep their
// procedural bob (src/render/mount_visuals.ts) and are not touched here.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// ---------------------------------------------------------------------------
// Quaternion helpers ([x, y, z, w], Hamilton product; R(a mul b) = R(a)R(b))
// ---------------------------------------------------------------------------
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qaxis = (axis, angle) => {
  const h = angle / 2;
  const s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
};
const qnorm = (q) => {
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
const rotv = (q, v) => {
  const [x, y, z, w] = q;
  const uvx = y * v[2] - z * v[1];
  const uvy = z * v[0] - x * v[2];
  const uvz = x * v[1] - y * v[0];
  const uuvx = y * uvz - z * uvy;
  const uuvy = z * uvx - x * uvz;
  const uuvz = x * uvy - y * uvx;
  return [v[0] + 2 * (w * uvx + uuvx), v[1] + 2 * (w * uvy + uuvy), v[2] + 2 * (w * uvz + uuvz)];
};

const DEG = Math.PI / 180;
const AXES = { pitch: [1, 0, 0], yaw: [0, 1, 0], roll: [0, 0, 1] };

// ---------------------------------------------------------------------------
// Per-mount rig maps. Bone names as authored by the Tripo auto-rig (raw, the
// "tripo::" prefixes are sanitized by GLTFLoader at load, not here). `fwd`
// flips swing so a positive angle moves feet toward the model's nose:
// valorsteed faces -Z, the other three face +Z.
//
// legs: [upperBone, lowerBone|null, phase (cycle fraction), ampScale, 'rear'?]
// ---------------------------------------------------------------------------
const RIGS = {
  valorsteed: {
    root: 'tripo::Root',
    fwd: 1,
    // one shared front-leg chain (the auto-rig gave both forelegs one chain),
    // so the horse canters: forelegs together, hindlegs together, half a
    // cycle apart, with a rocking-horse body pitch.
    legs: [
      ['tripo::0_Left_Limb_0', 'tripo::0_Left_Limb_1', 0, 1],
      ['tripo::Spine_3', 'tripo::0_Right_Limb_0', 0.5, 1],
      ['bone_10', 'tripo::1_Left_Limb_0', 0.5, 1],
    ],
    rock: { bone: 'tripo::Root', walk: 2.5, run: 4.5 },
    head: { bone: 'bone_13', amp: 4 },
    tail: { bone: 'bone_4', axis: 'yaw', amp: 10 },
  },
  grag_bear: {
    root: 'tripo::Root',
    fwd: -1,
    // full quadruped trot: diagonal pairs (FL+RR, FR+RL). A bear lumbers,
    // it does not scamper: keep the leg swing well under the horse's.
    legs: [
      ['bone_8', 'bone_9', 0, 0.55], // front left
      ['tripo::Spine_3', 'tripo::Spine_4', 0.5, 0.55], // front right
      ['bone_18', 'bone_19', 0.5, 0.55], // rear left
      ['bone_22', 'bone_23', 0, 0.55], // rear right
    ],
    sway: { bone: 'tripo::0_Left_Limb_0', walk: 2.5, run: 3.5 }, // lumbering roll
    head: { bone: 'tripo::Head_0', amp: 3.5 },
  },
  shadowjump_toad: {
    root: 'tripo::Root',
    fwd: -1,
    hop: true, // Walk/Run are hop cycles: crouch, launch, land
    // rear flagged explicitly: the big legs read stilt-like when they swing
    // toward full extension, so both pairs stay folded through the hop.
    legs: [
      ['tripo::1_Right_Limb_0', 'tripo::1_Right_Limb_1', 0, 0.85, 'rear'],
      ['tripo::1_Left_Limb_0', 'tripo::1_Left_Limb_1', 0, 0.85, 'rear'],
      ['tripo::Spine_2', 'tripo::0_Right_Limb_0', 0, 0.6], // front reach
      ['bone_7', 'tripo::0_Left_Limb_0', 0, 0.6],
    ],
    head: { bone: 'tripo::Head_0', amp: 3 },
  },
};

// gait parameters (angles in degrees, translations in model units; the
// models are ~0.8 units tall pre-normalization)
const GAITS = {
  Idle: { dur: 3.6, keys: 25 },
  Walk: { dur: 0.9, keys: 19, upper: 26, lower: 16, bob: 0.01, hopH: 0.05 },
  Run: { dur: 0.55, keys: 15, upper: 40, lower: 24, bob: 0.02, hopH: 0.09 },
  Death: { dur: 1.0, keys: 5 },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const keysArg = process.argv.slice(2);
const targets = keysArg.length ? keysArg : Object.keys(RIGS);

for (const key of targets) {
  const cfg = RIGS[key];
  if (!cfg) {
    console.error(`unknown rigged mount "${key}" (have: ${Object.keys(RIGS).join(', ')})`);
    process.exit(1);
  }
  const path = `public/models/mounts/${key}.glb`;
  const doc = await io.read(path);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();

  // node lookup + rest-pose world rotations (bind pose: node TRS = bind here)
  const nodes = new Map();
  for (const n of root.listNodes()) nodes.set(n.getName(), n);
  const parentOf = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const worldRot = (node) => {
    let q = [0, 0, 0, 1];
    for (let n = node; n; n = parentOf.get(n)) q = qmul([...n.getRotation()], q);
    return qnorm(q);
  };
  const bone = (name) => {
    const n = nodes.get(name);
    if (!n) throw new Error(`${key}: bone "${name}" not found`);
    return n;
  };

  for (const anim of root.listAnimations()) anim.dispose();

  const makeClip = (name) => {
    const g = GAITS[name];
    const anim = doc.createAnimation(name);
    const times = Float32Array.from({ length: g.keys }, (_, i) => (i / (g.keys - 1)) * g.dur);
    const input = doc
      .createAccessor(`${name}_t`)
      .setType('SCALAR')
      .setArray(times)
      .setBuffer(buffer);

    const addRot = (node, fn) => {
      const rest = [...node.getRotation()];
      const rwp = worldRot(parentOf.get(node));
      const inv = qconj(rwp);
      const out = new Float32Array(g.keys * 4);
      let prev = null;
      for (let i = 0; i < g.keys; i++) {
        const { axis, angle } = fn(times[i] / g.dur);
        let q = qnorm(qmul(qmul(qmul(inv, qaxis(AXES[axis], angle)), rwp), rest));
        // keep neighbors on the same hemisphere so LERP never goes the long way
        if (prev && q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3] < 0) {
          q = q.map((v) => -v);
        }
        prev = q;
        out.set(q, i * 4);
      }
      const acc = doc
        .createAccessor(`${name}_${node.getName()}_r`)
        .setType('VEC4')
        .setArray(out)
        .setBuffer(buffer);
      const sampler = doc
        .createAnimationSampler()
        .setInterpolation('LINEAR')
        .setInput(input)
        .setOutput(acc);
      anim.addSampler(sampler);
      anim.addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(node)
          .setTargetPath('rotation')
          .setSampler(sampler),
      );
    };

    const addRootY = (fn) => {
      const node = bone(cfg.root);
      const rest = [...node.getTranslation()];
      const inv = qconj(worldRot(parentOf.get(node)));
      const out = new Float32Array(g.keys * 3);
      for (let i = 0; i < g.keys; i++) {
        const dy = rotv(inv, [0, fn(times[i] / g.dur), 0]);
        out.set([rest[0] + dy[0], rest[1] + dy[1], rest[2] + dy[2]], i * 3);
      }
      const acc = doc
        .createAccessor(`${name}_root_ty`)
        .setType('VEC3')
        .setArray(out)
        .setBuffer(buffer);
      const sampler = doc
        .createAnimationSampler()
        .setInterpolation('LINEAR')
        .setInput(input)
        .setOutput(acc);
      anim.addSampler(sampler);
      anim.addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(node)
          .setTargetPath('translation')
          .setSampler(sampler),
      );
    };

    const wave = (u, phase = 0) => Math.sin((u + phase) * Math.PI * 2);

    if (name === 'Idle') {
      if (cfg.head)
        addRot(bone(cfg.head.bone), (u) => ({ axis: 'pitch', angle: 2.5 * DEG * wave(u) }));
      if (cfg.tail)
        addRot(bone(cfg.tail.bone), (u) => ({
          axis: cfg.tail.axis,
          angle: 8 * DEG * wave(u, 0.2),
        }));
      if (cfg.tail2)
        addRot(bone(cfg.tail2.bone), (u) => ({
          axis: cfg.tail2.axis,
          angle: 7 * DEG * wave(u, 0.2 + (cfg.tail2.phase ?? 0)),
        }));
      addRootY((u) => 0.006 * wave(u));
    } else if (name === 'Death') {
      addRootY((u) => -0.01 * Math.min(1, u * 2));
    } else if (cfg.hop) {
      // Walk/Run as a hop: crouch into the jump, extend through the air.
      // Rear legs fold at the crouch (u=0) and extend mid-cycle; the body
      // arcs with a soft |sin| so it never dips below its rest height.
      for (const [upper, lower, , scale, tag] of cfg.legs) {
        const rear = tag === 'rear';
        const amp = g.upper * scale * DEG * cfg.fwd;
        addRot(bone(upper), (u) => ({
          axis: 'pitch',
          angle: -amp * 0.6 * Math.cos(u * Math.PI * 2),
        }));
        if (lower)
          addRot(bone(lower), (u) => ({
            axis: 'pitch',
            angle: (rear ? 0.55 : -0.6) * amp * 0.7 * Math.cos((u + 0.1) * Math.PI * 2),
          }));
      }
      if (cfg.head)
        addRot(bone(cfg.head.bone), (u) => ({
          axis: 'pitch',
          angle: cfg.head.amp * DEG * wave(u, 0.25),
        }));
      addRootY((u) => g.hopH * Math.max(0, Math.sin(u * Math.PI * 2)) ** 0.7);
    } else {
      for (const [upper, lower, phase, scale] of cfg.legs) {
        const ampU = g.upper * scale * DEG * cfg.fwd;
        const ampL = g.lower * scale * DEG * cfg.fwd;
        addRot(bone(upper), (u) => ({ axis: 'pitch', angle: ampU * wave(u, phase) }));
        if (lower)
          addRot(bone(lower), (u) => ({ axis: 'pitch', angle: ampL * wave(u, phase + 0.14) }));
      }
      if (cfg.rock) {
        const amp = (name === 'Run' ? cfg.rock.run : cfg.rock.walk) * DEG;
        addRot(bone(cfg.rock.bone), (u) => ({ axis: 'pitch', angle: amp * wave(u, 0.25) }));
      }
      if (cfg.sway) {
        const amp = (name === 'Run' ? cfg.sway.run : cfg.sway.walk) * DEG;
        addRot(bone(cfg.sway.bone), (u) => ({ axis: 'roll', angle: amp * wave(u) }));
      }
      if (cfg.head)
        addRot(bone(cfg.head.bone), (u) => ({
          axis: 'pitch',
          angle: cfg.head.amp * DEG * wave(u, 0.25) * 2 * 0.5,
        }));
      if (cfg.tail)
        addRot(bone(cfg.tail.bone), (u) => ({
          axis: cfg.tail.axis,
          angle: cfg.tail.amp * DEG * wave(u),
        }));
      if (cfg.tail2)
        addRot(bone(cfg.tail2.bone), (u) => ({
          axis: cfg.tail2.axis,
          angle: cfg.tail2.amp * DEG * wave(u, cfg.tail2.phase ?? 0),
        }));
      // two body-bob beats per stride cycle (each pair of footfalls)
      addRootY((u) => g.bob * (1 - Math.cos(u * Math.PI * 4)) * 0.5);
    }
    return anim;
  };

  for (const clip of ['Idle', 'Walk', 'Run', 'Death']) makeClip(clip);
  await io.write(path, doc);
  console.log(`${path}: baked Idle/Walk/Run/Death onto ${root.listNodes().length} nodes`);
}
