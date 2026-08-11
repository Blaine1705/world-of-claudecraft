// Guard for GEOMETRY compression coverage across the shipped GLB set
// (issue #3287). Sibling of tests/glb_texture_compression.test.ts, which owns
// the TEXTURE half of the same pipeline step.
//
// Every shipped GLB is quantized (KHR_mesh_quantization) and meshopt-encoded
// (EXT_meshopt_compression), with one documented directory exemption spelled
// out at the scan below; the runtime loader wires MeshoptDecoder
// unconditionally (src/render/assets/loader.ts setMeshoptDecoder), so this is a
// pure download and first-load win, felt most on mobile and slow connections.
//
// WHY THIS SUITE EXISTS. The gap it closes was structural, not accidental:
// scripts/assets/compress_glb_textures.mjs used to re-apply meshopt only where
// the source already had it (`if (cls.hadMeshopt)`), so any model produced
// outside build_assets.mjs, i.e. the whole Tripo asset-pipeline output,
// permanently skipped geometry compression while still collecting its KTX2
// textures, and every new asset regressed the same way in silence. 118 shipped
// GLBs, 32.4 MB, had reached the tree that way. A coverage scan alone would not
// have stopped the next one, so the second test here drives the real converter
// over a freshly authored GLB and pins that it compresses a file that never had
// meshopt, not merely one that did.
//
// The fix, whenever this turns red:
//   node scripts/assets/compress_glb_textures.mjs && node scripts/build_media_manifest.mjs generate
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMeshQuantization } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';
import {
  classifyGlb,
  GEOMETRY_ADD_EXCLUDED_DIRS,
  geometryAddExcludedPath,
  geometryPassViolations,
  glbJsonChunk,
  meshoptEncodable,
} from '../scripts/assets/lib/glb_texture_compression_core.mjs';
import { WEAPON_VFX } from '../src/render/weapon_vfx';

const ROOT = path.resolve(__dirname, '..');
const MODELS = path.join(ROOT, 'public', 'models');

function* walkGlbs(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkGlbs(p);
    else if (e.name.endsWith('.glb')) yield p;
  }
}

// Same leak filter tests/glb_texture_compression.test.ts applies: the SFX
// studio security suite plants a sfx-studio-security-<pid>.glb symlink in
// public/models during the parallel run, and it is not a shipped model.
const isPlantedSymlink = (file: string) =>
  /^sfx-studio-security-\d+\.glb$/.test(path.basename(file));

describe('GLB geometry compression coverage', () => {
  it('meshopt-compresses and quantizes every shipped GLB outside the grip exemption', () => {
    const meshCount = (json: { meshes?: unknown[] }) => (json.meshes ?? []).length;
    const rawGeometry: string[] = [];
    const unquantized: string[] = [];
    const notEncodable: string[] = [];
    const clipBanks: string[] = [];
    const gripExempt: string[] = [];
    let compressed = 0;
    for (const file of walkGlbs(MODELS)) {
      if (isPlantedSymlink(file)) continue;
      const json = glbJsonChunk(fs.readFileSync(file));
      const rel = path.relative(ROOT, file);
      const used: string[] = json.extensionsUsed ?? [];
      // A GLB with no accessors has nothing for the codec to encode, so it
      // could never satisfy this scan. There are none today; the branch keeps
      // a future one from reading as a pipeline gap. It is asserted below to
      // stay empty so it cannot quietly become a dumping ground.
      if (!meshoptEncodable(json)) {
        notEncodable.push(rel);
        continue;
      }
      if (meshCount(json) === 0) clipBanks.push(rel);
      // The one sanctioned geometry exception, and it is a directory rather
      // than a list because the reason is a property of the whole family: a
      // variant weapon's mesh ORIGIN is its grip point
      // (src/render/characters/assets.ts, "we do NOT recenter"), quantization
      // recentres onto the bounding box, and 36 weapons carry a hand-tuned
      // WEAPON_GRIP_OVERRIDES nudge calibrated against the old origin. The
      // pass still RE-APPLIES the codec to a weapon that already has it, so
      // the 38 already-compressed weapons are held to the rule below.
      if (geometryAddExcludedPath(rel) && !used.includes('EXT_meshopt_compression')) {
        gripExempt.push(rel);
        continue;
      }
      if (!used.includes('EXT_meshopt_compression')) rawGeometry.push(rel);
      // Quantization is a MESH transform: the animation-only clip banks
      // (bow_anims.glb, the *_ability_anims / *_hit_variety_anims set) carry
      // sampler accessors and no meshes, so they are meshopt-encoded without
      // KHR_mesh_quantization and that is correct, not a gap.
      else if (meshCount(json) > 0 && !used.includes('KHR_mesh_quantization'))
        unquantized.push(rel);
      else compressed++;
    }
    expect(rawGeometry).toEqual([]);
    expect(unquantized).toEqual([]);
    expect(notEncodable).toEqual([]);
    // The clip banks are a real, named subset, not an escape hatch: pin that
    // they are mesh-less rather than letting "no meshes" excuse anything, and
    // keep the floor at the real count so none of them can quietly leave the
    // walk (tests/CLAUDE.md).
    expect(clipBanks.length, 'animation-only GLBs seen').toBeGreaterThanOrEqual(61);
    for (const rel of clipBanks) expect(rel).toMatch(/anim/i);
    // The grip exemption is BOUNDED, not open. Three separate pins, because the
    // count alone would let the DIRECTORY LIST grow and read as a normal edit:
    // the list itself is pinned to its literal, the member count is exact so a
    // new uncompressed weapon cannot join silently, and each member is checked
    // against a literal prefix rather than against geometryAddExcludedPath,
    // which built this list and so could never contradict it. Lifting the
    // exemption means recalibrating the grip overrides first; see the note above.
    expect(GEOMETRY_ADD_EXCLUDED_DIRS).toEqual(['public/models/weapons/']);
    expect(gripExempt.length, 'weapons exempt from the geometry pass').toBe(65);
    for (const rel of gripExempt) expect(rel.startsWith('public/models/weapons/')).toBe(true);
    // Tight vacuity floor (tests/CLAUDE.md): a deleted or renamed file drops
    // out of the walk silently, so the count sits at the real set size. 1193
    // at introduction: 1258 shipped GLBs minus the 65 grip-exempt weapons.
    // New models only add to it.
    expect(compressed).toBeGreaterThanOrEqual(1193);
  });

  it('keeps the WEAPON_VFX exception about textures, not about the whole file', () => {
    // deriveEmissive draws each skin's baseColor into a canvas, so those
    // textures stay drawable webp (tests/glb_texture_compression.test.ts owns
    // that half). Before #3287 that exception was implemented as a removal from
    // the converter's file walk, which silently made it a GEOMETRY exception
    // too. It is now a per-file flag, so the two questions are independent:
    // the skins live under models/weapons and are exempt from the geometry ADD
    // for the grip reason above, not because their textures are drawable. So
    // all 23 still ship raw geometry today; what changed is WHY, and that the
    // texture exception no longer decides it.
    const skins = Object.keys(WEAPON_VFX);
    expect(skins.length).toBeGreaterThan(0);
    for (const key of skins) {
      const file = path.join(MODELS, 'weapons', `${key}.glb`);
      const json = glbJsonChunk(fs.readFileSync(file));
      const mimes = (json.images ?? []).map((i) => i.mimeType);
      expect(mimes.length, `${key}: has embedded textures`).toBeGreaterThan(0);
      expect(mimes, `${key}: textures stay drawable`).not.toContain('image/ktx2');
    }
    // The semantic pin, independent of where the skins happen to live: a
    // texture-excluded file still owes geometry compression.
    const raw = { extensionsUsed: [], images: [{ mimeType: 'image/webp' }], accessors: [{}] };
    expect(classifyGlb(raw, { textureExcluded: true })).toMatchObject({
      needsTextures: false,
      needsMeshopt: true,
    });
    expect(classifyGlb(raw, { textureExcluded: true, geometryAddExcluded: true })).toMatchObject({
      needsTextures: false,
      needsMeshopt: false,
    });
  });

  it('keeps the shape of a GLB that was ALREADY quantized', async () => {
    // rift_portal.glb was the one shipped model already carrying
    // KHR_mesh_quantization without meshopt. Re-quantizing its integer POSITION
    // accessor in place flattened every x and z to zero: a 4.7 MB vertical line
    // whose meshes, nodes, materials and vertex count were all still correct,
    // so every structural check passed and the model shipped destroyed. The
    // converter now dequantizes back to float first.
    //
    // The fixture is hand-authored as UNSIGNED_SHORT with normalized OFF, plus a
    // node scale that maps it back to world units, because that is the state
    // rift_portal was really in. Building it with quantize() instead produces a
    // NORMALIZED accessor, and re-quantizing one of those is harmless: the
    // converter's output is then byte-identical with and without the dequantize
    // call, so such a fixture pins nothing at all.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wocc-requant-'));
    try {
      const doc = new Document();
      const buffer = doc.createBuffer();
      // A deliberately anisotropic box in quantized integer space, 4 x 1 x 9
      // once the node scale is applied, so a collapsed axis cannot hide.
      const S = 0.000116344134;
      const xi = Math.round(4 / S);
      const yi = Math.round(1 / S);
      const zi = Math.round(9 / S);
      const corners: number[] = [];
      for (const z of [0, zi])
        for (const y of [0, yi]) for (const x of [0, xi]) corners.push(x, y, z);
      const position = doc
        .createAccessor('POSITION')
        .setType('VEC3')
        .setArray(new Uint16Array(corners))
        .setNormalized(false)
        .setBuffer(buffer);
      const indices = doc
        .createAccessor('indices')
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]))
        .setBuffer(buffer);
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', position)
        .setIndices(indices)
        .setMaterial(doc.createMaterial('mat'));
      doc
        .createScene('Scene')
        .addChild(
          doc
            .createNode('box_node')
            .setMesh(doc.createMesh('box').addPrimitive(prim))
            .setScale([S, S, S]),
        );
      // Declared, not derived: the state rift_portal shipped in is quantized
      // geometry WITHOUT meshopt, which no gltf-transform pass produces on its own.
      doc.createExtension(KHRMeshQuantization).setRequired(true);
      const file = path.join(dir, 'prequantized.glb');
      // Extensions must be registered on the WRITER or KHR_mesh_quantization
      // never reaches the file and the fixture silently tests nothing.
      fs.writeFileSync(
        file,
        Buffer.from(await new NodeIO().registerExtensions(ALL_EXTENSIONS).writeBinary(doc)),
      );

      const before = glbJsonChunk(fs.readFileSync(file));
      expect(before.extensionsUsed ?? []).toContain('KHR_mesh_quantization');
      expect(before.extensionsUsed ?? []).not.toContain('EXT_meshopt_compression');

      execFileSync(
        process.execPath,
        [path.join(ROOT, 'scripts', 'assets', 'compress_glb_textures.mjs'), '--dir', dir],
        { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
      );

      const after = glbJsonChunk(fs.readFileSync(file));
      expect(after.extensionsUsed ?? []).toContain('EXT_meshopt_compression');
      // The 4 x 1 x 9 box must still be 4 x 1 x 9 shaped.
      const proportions = (json: typeof before) => {
        const a = (json.accessors ?? [])[
          (json.meshes ?? [])[0]?.primitives?.[0]?.attributes?.POSITION as number
        ];
        const extent = (a?.max ?? []).map((v: number, i: number) =>
          Math.abs(v - (a?.min ?? [])[i]),
        );
        const largest = Math.max(...extent);
        return extent.map((v: number) => Number((v / largest).toFixed(3)));
      };
      expect(proportions(after)).toEqual(proportions(before));
      expect(geometryPassViolations(before, after)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('compresses a freshly authored GLB that never had meshopt', async () => {
    // The regression that motivated #3287 was not a stale file, it was the
    // converter declining to ADD the codec. Drive the real script end to end
    // over a GLB built here with neither meshopt nor quantization, in its own
    // --dir so nothing in public/ is touched. No textures, so the ktx binary
    // the KTX2 path needs is not required to run this.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wocc-meshopt-'));
    try {
      const doc = new Document();
      const buffer = doc.createBuffer();
      const position = doc
        .createAccessor('POSITION')
        .setType('VEC3')
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]))
        .setBuffer(buffer);
      const indices = doc
        .createAccessor('indices')
        .setType('SCALAR')
        .setArray(new Uint16Array([0, 1, 2, 1, 3, 2]))
        .setBuffer(buffer);
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', position)
        .setIndices(indices)
        .setMaterial(doc.createMaterial('mat'));
      const mesh = doc.createMesh('plate').addPrimitive(prim);
      const node = doc.createNode('plate_node').setMesh(mesh);
      doc.createScene('Scene').addChild(node);

      const file = path.join(dir, 'fresh.glb');
      fs.writeFileSync(file, Buffer.from(await new NodeIO().writeBinary(doc)));

      const before = glbJsonChunk(fs.readFileSync(file));
      expect(before.extensionsUsed ?? []).not.toContain('EXT_meshopt_compression');
      expect(classifyGlb(before)).toMatchObject({ needsMeshopt: true, skip: false });

      execFileSync(
        process.execPath,
        [path.join(ROOT, 'scripts', 'assets', 'compress_glb_textures.mjs'), '--dir', dir],
        { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
      );

      const after = glbJsonChunk(fs.readFileSync(file));
      expect(after.extensionsUsed ?? []).toContain('EXT_meshopt_compression');
      expect(after.extensionsUsed ?? []).toContain('KHR_mesh_quantization');
      // The pass preserved the model. Assert positively as well as through the
      // guard: the guard returning nothing is only as strong as the guard.
      expect(geometryPassViolations(before, after)).toEqual([]);
      expect((after.nodes ?? []).map((n) => n.name)).toContain('plate_node');
      expect((after.meshes ?? []).map((m) => m.name)).toEqual(['plate']);
      expect((after.nodes ?? []).filter((n) => n.mesh !== undefined)).toHaveLength(1);
      // A second run is a no-op: the converter must not rewrite an
      // already-compressed file on every call.
      const settled = fs.readFileSync(file);
      execFileSync(
        process.execPath,
        [path.join(ROOT, 'scripts', 'assets', 'compress_glb_textures.mjs'), '--dir', dir],
        { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
      );
      expect(fs.readFileSync(file).equals(settled), 'second run rewrote the file').toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);
});

describe('geometry pass structural guard', () => {
  // The converter aborts a file rather than write it when the pass did more
  // than compress. The guard checks IDENTITY, not counts: quantize
  // legitimately inserts anonymous transform nodes and copies a shared skin
  // per quantized mesh, and a count-only guard must either refuse those (which
  // is how CombatMech.glb, staff_d.glb and solheim_last_light_of_the_dawn.glb
  // were refused) or, loosened to "may grow", stop noticing a REPLACEMENT.
  const rig = (name: string) => ({ name, joints: [1, 2] });
  const base = {
    meshes: [{ name: 'body' }],
    nodes: [{ name: 'root', mesh: 0, children: [1] }, { name: 'hips' }, { name: 'spine' }],
    skins: [rig('Rig_Medium')],
    animations: [{ name: 'Idle' }],
  };

  it('accepts an anonymous wrapper node that parents the node it wrapped', () => {
    const after = {
      ...base,
      nodes: [...base.nodes, { translation: [0, 1, 0], scale: [2, 2, 2], children: [0] }],
    };
    expect(geometryPassViolations(base, after)).toEqual([]);
  });

  it('accepts a mesh lifted into an anonymous transform node', () => {
    // staff_d.glb: the named node keeps its children, its mesh moves to an
    // anonymous sibling carrying the dequantization TRS.
    const after = {
      ...base,
      nodes: [
        { name: 'root', children: [1, 3] },
        { name: 'hips' },
        { name: 'spine' },
        { translation: [0, 0.28, 0], scale: [1.2, 1.2, 1.2], mesh: 0 },
      ],
    };
    expect(geometryPassViolations(base, after)).toEqual([]);
  });

  it('accepts a shared skin copied once per quantized mesh', () => {
    // CombatMech.glb: 1 rig becomes 8 copies of the SAME rig.
    const after = { ...base, skins: [rig('Rig_Medium'), rig('Rig_Medium'), rig('Rig_Medium')] };
    expect(geometryPassViolations(base, after)).toEqual([]);
  });

  it('rejects a named node that disappeared', () => {
    // Driven backwards: the richer graph is the BEFORE, so `prop` is present in
    // the source and gone from the output. Appending rather than renaming keeps
    // the skin's joints (1, 2) resolving to the same names, so the rig check
    // stays quiet and this isolates the node-identity defect.
    const after = {
      ...base,
      nodes: [...base.nodes, { name: 'prop' }],
    };
    expect(geometryPassViolations(after, base).join(' ')).toContain(
      'named node "prop" lost (1 -> 0)',
    );
  });

  it('counts wrappers the pass ADDED, not wrappers the source already had', () => {
    // Many shipped GLBs already carry wrapper-shaped nodes (the whole
    // models/biome/cave_* family carries two or three). Counting the total would
    // hand each of them that many free slots for injected nodes, which is
    // exactly the corruption the count-based guard used to catch.
    const withWrapper = {
      ...base,
      nodes: [...base.nodes, { translation: [0, 1, 0], children: [1] }],
    };
    const injected = {
      ...withWrapper,
      nodes: [...withWrapper.nodes, { name: 'INJECTED', children: [0] }],
    };
    expect(geometryPassViolations(withWrapper, injected).join(' ')).toContain(
      '1 node(s) added, only 0 are quantization wrappers',
    );
    // A genuinely added wrapper on the same source is still accepted, so the
    // rejection above is about provenance and not about the pre-existing one.
    const alsoWrapped = {
      ...withWrapper,
      nodes: [...withWrapper.nodes, { translation: [0, 0, 2], children: [0] }],
    };
    expect(geometryPassViolations(withWrapper, alsoWrapped)).toEqual([]);
  });

  it('rejects an added node carrying no transform at all', () => {
    // A wrapper exists to carry a dequantization TRS; one without a transform
    // is an anonymous node the pass had no reason to invent.
    const after = { ...base, nodes: [...base.nodes, { children: [0] }] };
    expect(geometryPassViolations(base, after).join(' ')).toContain('are quantization wrappers');
  });

  it('rejects an added node that is not a transform carrier', () => {
    // Named, so it is something the pass invented rather than a wrapper.
    const after = { ...base, nodes: [...base.nodes, { name: 'extra', children: [0] }] };
    expect(geometryPassViolations(base, after).join(' ')).toContain(
      '1 node(s) added, only 0 are quantization wrappers',
    );
  });

  it('rejects a wrapper that smuggles extras, a skin or a baked matrix through', () => {
    const wrapper = { translation: [0, 1, 0], children: [0] };
    for (const smuggled of [{ extras: { seal: 'x' } }, { skin: 0 }, { matrix: new Array(16) }]) {
      const after = { ...base, nodes: [...base.nodes, { ...wrapper, ...smuggled }] };
      expect(geometryPassViolations(base, after).join(' '), JSON.stringify(smuggled)).toContain(
        'are quantization wrappers',
      );
    }
    // The same node WITHOUT the smuggled field is accepted, so each case above
    // fails on the field under test and not on the shape of the fixture.
    expect(geometryPassViolations(base, { ...base, nodes: [...base.nodes, wrapper] })).toEqual([]);
  });

  it('rejects a skin that is not a copy of a source rig', () => {
    const impostors: [string, { name: string; joints: number[] }][] = [
      ['a different rig', rig('Rig_Small')],
      ['the same name over fewer joints', { name: 'Rig_Medium', joints: [1] }],
      // Joint ORDER is part of a rig's identity: two skins over the same joints
      // in a different order bind different bones to different vertices.
      ['the same joints in a different order', { name: 'Rig_Medium', joints: [2, 1] }],
    ];
    for (const [label, impostor] of impostors) {
      const after = { ...base, skins: [base.skins[0], impostor] };
      expect(geometryPassViolations(base, after).join(' '), label).toContain(
        'is not a copy of a source rig',
      );
    }
  });

  it('rejects a primitive whose shape changed, even with the graph intact', () => {
    // The rift_portal.glb defect: POSITION max went from [13927, 16383, 14062]
    // to [0, 32767, 0], flattening the model to a line, while its meshes,
    // nodes, materials and vertex count all stayed correct. Every other check
    // in this guard passed.
    const shaped = (max: number[]) => ({
      ...base,
      accessors: [{ type: 'VEC3', min: [0, 0, 0], max }],
      meshes: [{ name: 'body', primitives: [{ attributes: { POSITION: 0 } }] }],
    });
    const before = shaped([13927, 16383, 14062]);
    expect(geometryPassViolations(before, shaped([0, 32767, 0])).join(' ')).toContain(
      'primitive 0 shape changed on axis x',
    );
    // A uniform rescale is NOT a shape change: the pass rescales accessors and
    // compensates on the node all the time.
    expect(geometryPassViolations(before, shaped([27854, 32766, 28124]))).toEqual([]);
    // A single axis stretched past the tolerance is.
    expect(geometryPassViolations(before, shaped([13927, 16383, 16383])).join(' ')).toContain(
      'shape changed on axis z',
    );
  });

  it('rejects a thin axis collapsing to zero, inside the drift tolerance', () => {
    // The blind spot a bare 2 percent tolerance leaves: an axis thinner than 2
    // percent of the largest can go to exactly zero without exceeding it. This
    // tree ships such shapes, the fishing rod's line being [0.0099, 1, 0.0099].
    const shaped = (max: number[]) => ({
      ...base,
      accessors: [{ type: 'VEC3', min: [0, 0, 0], max }],
      meshes: [{ name: 'body', primitives: [{ attributes: { POSITION: 0 } }] }],
    });
    const rod = shaped([99, 10000, 99]);
    expect(geometryPassViolations(rod, shaped([0, 10000, 0])).join(' ')).toContain(
      'primitive 0 shape changed on axis x',
    );
    // The same tiny axis merely drifting is still accepted, so the rule is
    // about collapse and not about thin models being off limits.
    expect(geometryPassViolations(rod, shaped([98, 10000, 99]))).toEqual([]);
  });

  it('rejects a named node the pass invented, even at an unchanged node count', () => {
    // countByName only reported losses, and the wrapper budget only runs when
    // the node count GREW, so swapping an unnamed node for a named one used to
    // pass both.
    const after = {
      ...base,
      nodes: [{ name: 'root', mesh: 0, children: [1] }, { name: 'hips' }, { name: 'INJECTED' }],
    };
    expect(geometryPassViolations(base, after).join(' ')).toContain(
      'named node "INJECTED" appeared',
    );
  });

  it('resolves an excluded path however it is spelled', () => {
    // A false here means the pass ADDS meshopt to a weapon and every grip breaks,
    // so the shapes a caller might plausibly pass must not slip through.
    for (const p of [
      'public/models/weapons/ice_fang.glb',
      './public/models/weapons/ice_fang.glb',
      'public\\models\\weapons\\ice_fang.glb',
      '/home/somebody/repo/public/models/weapons/ice_fang.glb',
    ]) {
      expect(geometryAddExcludedPath(p), p).toBe(true);
    }
    // A neighbouring directory is NOT excluded: the trailing slash does that work.
    expect(geometryAddExcludedPath('public/models/weapons_extra/x.glb')).toBe(false);
    expect(geometryAddExcludedPath('public/models/creatures/emberkin.glb')).toBe(false);
  });

  it('rejects a mesh that lost its last reference from the scene graph', () => {
    const after = { ...base, nodes: [{ name: 'root', children: [1] }, ...base.nodes.slice(1)] };
    expect(geometryPassViolations(after, base)).toEqual([
      expect.stringContaining('referenced meshes changed'),
    ]);
    expect(geometryPassViolations(base, after)).toEqual([
      expect.stringContaining('referenced meshes changed'),
    ]);
  });

  it('rejects a dropped mesh, animation, skin or extras-bearing node', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['meshes', { meshes: [] }],
      ['animations', { animations: [] }],
      ['nodesWithExtras', { nodes: [{ ...base.nodes[0], extras: { seal: 'x' } }] }],
    ];
    for (const [field, patch] of cases) {
      const violations = geometryPassViolations({ ...base, ...patch }, base);
      expect(violations.join(' '), field).toContain('structure changed');
    }
    expect(
      geometryPassViolations({ ...base, skins: [rig('a'), rig('a')] }, base).join(' '),
    ).toContain('1 skin(s) dropped');
  });
});
