// Pure helpers for the GLB texture KTX2 conversion (scripts/assets/
// compress_glb_textures.mjs) and its guard suite
// (tests/glb_texture_compression.test.ts). No gltf-transform or sharp imports
// here: the test imports this module directly, so it must stay light.

/** Read the raw JSON chunk of a GLB without decoding buffers. */
export function glbJsonChunk(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
}

/** What a conversion pass owes this file: which embedded images it would touch,
 *  whether it must add geometry compression, and whether it can be skipped
 *  without a write.
 *
 *  `textureExcluded` marks the sanctioned WEAPON_VFX partition (see
 *  weaponVfxModelKeys below). Those files keep drawable webp textures, but the
 *  exclusion is about TEXTURES only: EXT_meshopt_compression is a geometry
 *  codec the runtime loader decodes unconditionally
 *  (src/render/assets/loader.ts setMeshoptDecoder), so they take the geometry
 *  pass like everything else.
 *
 *  `needsMeshopt` is deliberately "the file does not already carry the
 *  extension", not "the file carried it and a rewrite would drop it". The
 *  narrower reading is what let every GLB produced outside build_assets.mjs
 *  (the Tripo asset-pipeline output) ship raw geometry forever while still
 *  collecting its KTX2 textures.
 *
 *  `geometryAddExcluded` is the weapons carve-out, and it is narrower than it
 *  looks: the pass may still RE-APPLY the codec to a weapon that already has
 *  it (a read decodes it, so a write without re-encoding would inflate the
 *  file), it may only not ADD it. Quantization recentres each mesh onto its
 *  bounding box and compensates on the node, but the renderer documents that a
 *  variant weapon's mesh origin IS the grip point
 *  (src/render/characters/assets.ts, "we do NOT recenter"), and 36 weapons
 *  carry a hand-tuned WEAPON_GRIP_OVERRIDES nudge calibrated against that
 *  origin. Recentring silently shifts every one of them: the sword hangs at
 *  the character's feet. Lifting this needs those overrides recalibrated
 *  first, which is eye work in the asset-pipeline inspector, not a code
 *  change. */
export function classifyGlb(json, { textureExcluded = false, geometryAddExcluded = false } = {}) {
  const images = json.images ?? [];
  const convertible = images.filter(
    (i) => i.mimeType === 'image/webp' || i.mimeType === 'image/png' || i.mimeType === 'image/jpeg',
  ).length;
  const used = json.extensionsUsed ?? [];
  const hadMeshopt = used.includes('EXT_meshopt_compression');
  const needsTextures = !textureExcluded && convertible > 0;
  const needsMeshopt = !hadMeshopt && !geometryAddExcluded;
  return {
    images: images.length,
    convertible,
    hadMeshopt,
    // Already-quantized geometry must be dequantized before the pass
    // re-quantizes it; see the note at the dequantize() call site.
    hadQuantization: used.includes('KHR_mesh_quantization'),
    needsTextures,
    needsMeshopt,
    skip: !needsTextures && !needsMeshopt,
  };
}

/** A GLB with no accessors at all carries no geometry or animation data for
 *  EXT_meshopt_compression to encode: gltf-transform's meshopt() returns
 *  before creating the extension, so such a file can never satisfy the
 *  coverage scan and is not a pipeline gap. Kept here so the converter and
 *  tests/glb_meshopt_coverage.test.ts agree on one rule. */
export function meshoptEncodable(json) {
  return (json.accessors ?? []).length > 0;
}

/** Models the pass may not ADD geometry compression to. One directory today:
 *  see the geometryAddExcluded note on classifyGlb. Kept here so the converter
 *  and tests/glb_meshopt_coverage.test.ts agree on one rule rather than each
 *  spelling the path out. */
export const GEOMETRY_ADD_EXCLUDED_DIRS = ['public/models/weapons/'];

export function geometryAddExcludedPath(relPath) {
  // Normalize rather than quietly answer "not excluded" for a shape it did not
  // expect: a false here means the pass ADDS meshopt to a weapon and every grip
  // in the game breaks, so an absolute path or a leading ./ must not slip
  // through. The repository prefix is what makes an absolute path resolvable.
  const posix = relPath.split('\\').join('/').replace(/^\.\//, '');
  const rooted = posix.includes('/public/models/')
    ? posix.slice(posix.indexOf('/public/models/') + 1)
    : posix;
  return GEOMETRY_ADD_EXCLUDED_DIRS.some((dir) => rooted.startsWith(dir));
}

/** Counts that must survive a texture-only conversion byte-for-byte. */
export function structuralSnapshot(json) {
  return {
    skins: json.skins?.length ?? 0,
    animations: json.animations?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    nodes: json.nodes?.length ?? 0,
    nodesWithExtras: (json.nodes ?? []).filter((n) => n.extras !== undefined).length,
    hasAssetExtras: json.asset?.extras !== undefined,
  };
}

export function snapshotMismatch(before, after) {
  const keys = Object.keys(before);
  const diffs = keys.filter((k) => before[k] !== after[k]);
  return diffs.length ? diffs : null;
}

/** A node quantize added to carry a dequantization TRS its source node could
 *  not absorb. It comes in two shapes, both anonymous and both carrying
 *  nothing but a transform and one payload:
 *    - it PARENTS the node it wrapped (exactly one child, no mesh), when that
 *      node's own transform is animated or shared;
 *    - it CARRIES the mesh lifted out of a node that has children of its own,
 *      which must keep their untransformed frame (staff_d.glb: the named
 *      `staff_D` stays as the parent, its mesh moves to an anonymous sibling).
 *  Either way it is skin-less, camera-less, extras-less and matrix-less, and it
 *  carries a TRS, since carrying one is its whole reason to exist.
 *
 *  This is a SHAPE test, not a proof that the wrapping is correct: it does not
 *  verify which node the wrapper parents. Pairing each added node with the node
 *  it lifted would need a stable identity across the pass, which quantize's
 *  index remapping does not give us. The caller compensates by requiring every
 *  named node to survive and every mesh to keep a reference, so a wrapper can
 *  only ever be added ALONGSIDE the original graph, never in place of part of
 *  it. */
function isQuantizationWrapper(node) {
  if (
    node.name !== undefined ||
    node.skin !== undefined ||
    node.camera !== undefined ||
    node.extras !== undefined ||
    node.matrix !== undefined
  )
    return false;
  if (node.translation === undefined && node.rotation === undefined && node.scale === undefined)
    return false;
  const children = (node.children ?? []).length;
  return node.mesh !== undefined ? children === 0 : children === 1;
}

/** Every mesh some node references, by name, as a multiset. Quantize re-parents
 *  meshes between nodes, so their node placement is not an invariant, but a
 *  mesh silently losing its last node reference (rendering nothing where
 *  something used to be) is exactly the corruption this guard is for.
 *
 *  Node reference, not reachability: a mesh on a node orphaned from every scene
 *  still counts here. Scene membership is not checked, in this guard or in the
 *  count-based one it replaced. */
function referencedMeshNames(json) {
  const names = (json.meshes ?? []).map((m, i) => m.name ?? `#${i}`);
  return (json.nodes ?? [])
    .filter((n) => n.mesh !== undefined)
    .map((n) => names[n.mesh] ?? `#${n.mesh}`)
    .sort();
}

function jointNames(json, skin) {
  return (skin.joints ?? []).map((i) => (json.nodes ?? [])[i]?.name ?? `#${i}`);
}

/** A skin's identity for the clone check: quantize gives each quantized mesh
 *  its own copy of the shared skin (its inverse bind matrices absorb that
 *  mesh's dequantization transform), so the copies must be the SAME rig, same
 *  name and same joints in the same order, never a different one. */
function skinIdentity(json, skin) {
  return JSON.stringify([skin.name ?? null, jointNames(json, skin)]);
}

/** Each primitive's POSITION extent per axis, as PROPORTIONS of its own largest
 *  axis, read from the declared accessor min/max. Proportions rather than sizes
 *  because a pass legitimately rescales an accessor and compensates on the node;
 *  what may never change is the model's shape. */
function positionProportions(json) {
  const acc = json.accessors ?? [];
  const out = [];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const a = acc[prim.attributes?.POSITION];
      if (!a?.min || !a?.max) continue;
      const extent = a.max.map((v, i) => Math.abs(v - a.min[i]));
      const largest = Math.max(...extent);
      out.push(largest > 0 ? extent.map((v) => v / largest) : extent.map(() => 0));
    }
  }
  return out;
}

function countByName(nodes) {
  const counts = new Map();
  for (const n of nodes ?? []) {
    if (n.name === undefined) continue;
    counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
  }
  return counts;
}

/** What a quantize + meshopt pass must preserve, checked by IDENTITY rather
 *  than by count.
 *
 *  structuralSnapshot alone cannot express this: it was written for a
 *  texture-only conversion, where nothing at all may move, and a geometry pass
 *  legitimately inserts wrapper nodes and clones skins (see the two helpers
 *  above). Counting would either reject those (the old behavior, which is how
 *  CombatMech.glb, staff_d.glb and solheim_last_light_of_the_dawn.glb were
 *  refused) or, if simply loosened to "may grow", stop noticing a node that
 *  was REPLACED rather than added. So: meshes, animations, extras-bearing
 *  nodes and asset extras stay exactly equal; every named node survives with
 *  its multiplicity; every mesh keeps a node reference; every node the pass
 *  ADDED is matched by a wrapper the pass ADDED, counted as a delta because many
 *  shipped GLBs already carry wrapper-shaped nodes (the whole models/biome/cave_*
 *  family carries two or three) and a total would hand those files a free budget
 *  for arbitrary injected ones; every skin present after is one of the rigs
 *  present before.
 *
 *  Returns a list of human-readable violations, empty when the pass is clean. */
export function geometryPassViolations(before, after) {
  const violations = [];
  const strict = (json) => {
    const { skins: _skins, nodes: _nodes, ...rest } = structuralSnapshot(json);
    return rest;
  };
  const moved = snapshotMismatch(strict(before), strict(after));
  if (moved) violations.push(`structure changed: ${moved.join(', ')}`);

  const namesBefore = countByName(before.nodes);
  const namesAfter = countByName(after.nodes);
  for (const [name, n] of namesBefore) {
    const m = namesAfter.get(name) ?? 0;
    if (m < n) violations.push(`named node "${name}" lost (${n} -> ${m})`);
  }
  // Gains too, not only losses. quantize never invents a NAMED node, so any new
  // name is something else, and the node-count check below cannot see it: a pass
  // that drops one unnamed node and adds one named node leaves the total
  // unchanged and would otherwise sail through.
  for (const [name, n] of namesAfter) {
    const m = namesBefore.get(name) ?? 0;
    if (n > m) violations.push(`named node "${name}" appeared (${m} -> ${n})`);
  }

  const meshesBefore = referencedMeshNames(before);
  const meshesAfter = referencedMeshNames(after);
  // Element-wise, never a joined string: a mesh name can contain any separator
  // character, and joining would let two different multisets compare equal.
  if (
    meshesBefore.length !== meshesAfter.length ||
    meshesBefore.some((name, i) => name !== meshesAfter[i])
  )
    violations.push(
      `referenced meshes changed: [${meshesBefore.join(', ')}] -> [${meshesAfter.join(', ')}]`,
    );

  // The check every structural test in this file would have passed while the
  // model was destroyed: rift_portal.glb came out of a re-quantization with
  // POSITION max [0, 32767, 0], every x and z flattened to zero, with its
  // meshes, nodes, materials and vertex count all intact.
  const propsBefore = positionProportions(before);
  const propsAfter = positionProportions(after);
  if (propsBefore.length !== propsAfter.length) {
    violations.push(`positioned primitives ${propsBefore.length} -> ${propsAfter.length}`);
  } else {
    for (const [i, was] of propsBefore.entries()) {
      const now = propsAfter[i];
      // Two rules, because the tolerance alone has a blind spot. 2 percent of
      // the largest axis catches ordinary drift (quantization error is orders
      // of magnitude below it). But an axis thinner than 2 percent of the
      // largest could go to EXACTLY zero inside that tolerance, and this tree
      // ships such shapes: the fishing rod's line is [0.0099, 1, 0.0099], and a
      // gate arch and a beach house are thinner still. A blade, a banner or a
      // decal collapsing to nothing is precisely the rift_portal failure at a
      // smaller scale, so a non-zero extent may never become zero, at any size.
      const off = was.findIndex((v, c) => (v > 0 && now[c] === 0) || Math.abs(v - now[c]) > 0.02);
      if (off >= 0)
        violations.push(
          `primitive ${i} shape changed on axis ${'xyz'[off]}: proportions ` +
            `[${was.map((v) => v.toFixed(3)).join(', ')}] -> [${now.map((v) => v.toFixed(3)).join(', ')}]`,
        );
    }
  }

  const gained = (after.nodes ?? []).length - (before.nodes ?? []).length;
  if (gained < 0) {
    violations.push(`${-gained} node(s) dropped`);
  } else if (gained > 0) {
    // The DELTA, never the total: a source that already carries wrapper-shaped
    // nodes, and many shipped GLBs do, would otherwise get that many free slots
    // for nodes the pass had no business inventing.
    const wrappersBefore = (before.nodes ?? []).filter(isQuantizationWrapper).length;
    const wrappersAfter = (after.nodes ?? []).filter(isQuantizationWrapper).length;
    const added = wrappersAfter - wrappersBefore;
    if (added < gained)
      violations.push(`${gained} node(s) added, only ${added} are quantization wrappers`);
  }

  const rigsBefore = new Set((before.skins ?? []).map((s) => skinIdentity(before, s)));
  if ((after.skins ?? []).length < (before.skins ?? []).length)
    violations.push(`${(before.skins ?? []).length - (after.skins ?? []).length} skin(s) dropped`);
  for (const s of after.skins ?? []) {
    if (!rigsBefore.has(skinIdentity(after, s)))
      violations.push(`skin "${s.name ?? '(unnamed)'}" is not a copy of a source rig`);
  }
  return violations;
}

// Armory skin models with a WEAPON_VFX rig stay webp: createWeaponVfx derives
// each skin's emissive map and de-baked albedo by drawing the baseColor image
// into a canvas (src/render/weapon_vfx.ts deriveEmissive), which a compressed
// texture cannot do. Those models are streamed on demand on the native iOS
// profile, so they cost nothing in the world-entry memory window anyway.
// tests/glb_texture_compression.test.ts re-derives this partition by importing
// WEAPON_VFX for real and fails if this extraction ever drifts.
export function weaponVfxModelKeys(source) {
  const start = source.indexOf('export const WEAPON_VFX');
  if (start < 0) throw new Error('WEAPON_VFX table not found');
  const body = source.slice(start, source.indexOf('\n};', start));
  const keys = [];
  for (const m of body.matchAll(/^ {2}(?:'([^']+)'|([a-z0-9_]+)):\s*\{/gm)) {
    keys.push(m[1] ?? m[2]);
  }
  if (keys.length === 0) throw new Error('WEAPON_VFX extraction matched no keys');
  return keys;
}
