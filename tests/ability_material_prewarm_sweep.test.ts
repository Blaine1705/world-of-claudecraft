// The sweep behind the ability-material prewarm: every spell visual that mints
// its materials LAZILY, on the first cast of the session, must be staged by the
// boot manifest, and a new one fails this file until it is.
//
// The measured defect: the pooled ability-VFX engines build every material in
// their constructor (that is why the boot entry only has to SPAWN them), but
// four visuals next to them keep a module-level cache filled by the first
// construction, which happens when the aura or cast goes live in view. The
// first Frost Nova root, Ice Block, Temporal Hourglass and fireball travel form
// therefore linked their programs inside a combat frame. Naming those four by
// hand would be the same trap one class down, so the corpus is walked instead.
//
// THE HEURISTICS, and they are deliberately two:
//   A. The BUNDLE idiom, over the whole of src/render: a module-scope
//      `let <name>: <Local>Materials | null = null`, whose type is a local
//      interface rather than a `THREE.*` class. That is the shape all four
//      share, and it separates a bundle of one visual's materials from the
//      `THREE.Material | null` singletons the zone and minigame scenery keeps
//      (mailbox, the Vale Cup kit, the Wildheart basin), which are built when
//      their zone builds, not on a cast.
//   B. ANY module-scope lazy material cache (a `| null` single, or a Map whose
//      values are THREE materials) inside the ABILITY-VISUAL corpus:
//      `*_visual.ts`, `*_fx.ts`, `*_vfx.ts`, `*_markers.ts`, and everything
//      under `ability_vfx/`. B is the wider net: it catches a new spell visual
//      that caches one material, or a Map keyed by school or colour.
//
// A hit is registered in ABILITY_MATERIAL_SOURCES or listed in EXCLUDED below
// with its reason, and the excluded ones stay visible here rather than being
// filtered out of the corpus.
//
// One near miss worth naming, outside the corpus by filename and so never a
// hit: `characters/halo.ts` keeps a Map of halo materials keyed by colour. It
// is minted by `buildHalo` when a rig whose VisualDef declares a halo is BUILT
// (the priest's Light is the only such def), which is the path the entity
// archetype prewarm entries already drive behind the loading cover.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ABILITY_MATERIAL_SOURCES,
  abilityMaterialPrewarmMaterials,
  buildAbilityMaterialPrewarmGroup,
} from '../src/render/ability_material_prewarm';
import { expectScansOnlyThroughSharedWalkers } from './helpers/scan_guard_self_audit';
import { tsFilesUnder } from './helpers/ts_files_under';

const RENDER_ROOT = fileURLToPath(new URL('../src/render', import.meta.url));

/** Hits that are real lazy caches but must NOT ride the boot manifest. */
const EXCLUDED: Record<string, string> = {
  'battleground_rune_vfx.ts':
    'Thornhollow Fields only: the mote, ring, plume and shard materials are keyed by rune type ' +
    'and colour and are reachable only inside the battleground scene, which builds on entry. ' +
    'src/render/CLAUDE.md: a program only ONE encounter can reach warms at that interior attach, ' +
    'never in the boot manifest.',
};

/** Files whose module ABILITY_MATERIAL_SOURCES stages, by basename. */
const REGISTERED_MODULES = [
  'frost_nova_root_visual.ts',
  'ice_block_visual.ts',
  'temporal_hourglass_visual.ts',
  'fireball_travel_visual.ts',
];

const BUNDLE_CACHE = /^let\s+\w+:\s+(?!THREE\.)\w*Materials\s+\|\s+null\s+=\s+null;$/m;
const SINGLE_CACHE = /^let\s+\w+:\s+[\w.]*Material\w*\s+\|\s+null\s+=\s+null;$/m;
const MATERIAL_MAP_CACHE = /^const\s+\w+\s*=\s*new Map<[^>]*THREE\.\w*Material[^>]*>\(\);$/m;

const inAbilityCorpus = (file: string): boolean =>
  /(_visual|_fx|_vfx|_markers)\.ts$/.test(file) || file.startsWith('ability_vfx/');

interface Hit {
  file: string;
  idiom: 'bundle' | 'single' | 'map';
}

function sweep(): Hit[] {
  const hits: Hit[] = [];
  for (const source of tsFilesUnder(RENDER_ROOT)) {
    const text = readFileSync(source.full, 'utf8');
    if (BUNDLE_CACHE.test(text)) {
      hits.push({ file: source.file, idiom: 'bundle' });
      continue;
    }
    if (!inAbilityCorpus(source.file)) continue;
    if (SINGLE_CACHE.test(text)) hits.push({ file: source.file, idiom: 'single' });
    else if (MATERIAL_MAP_CACHE.test(text)) hits.push({ file: source.file, idiom: 'map' });
  }
  return hits;
}

const basename = (file: string): string => file.slice(file.lastIndexOf('/') + 1);

describe('the lazy-material sweep', () => {
  it('reads src/render through the shared walker, recursively', () => {
    expectScansOnlyThroughSharedWalkers(import.meta.url, ['ts_files_under']);
    // The root is genuinely deep, so recursion is provable against the real
    // tree: a single-level read would never see the ability_vfx engines.
    const files = tsFilesUnder(RENDER_ROOT).map((source) => source.file);
    expect(files).toContain('ability_vfx/spirits.ts');
    expect(files).toContain('characters/halo.ts');
    expect(files.length).toBeGreaterThan(300);
  });

  it('matches the idioms it claims to, on fixtures', () => {
    // Positive controls for each pattern, so a zero below is never vacuous.
    expect(BUNDLE_CACHE.test('let materials: FrostRootMaterials | null = null;')).toBe(true);
    expect(SINGLE_CACHE.test('let glow: THREE.MeshBasicMaterial | null = null;')).toBe(true);
    expect(
      MATERIAL_MAP_CACHE.test('const mats = new Map<number, THREE.MeshBasicMaterial>();'),
    ).toBe(true);
    // The bundle pattern refuses the scenery singletons on purpose: they are
    // built when their zone builds, not on a cast.
    expect(BUNDLE_CACHE.test('let sharedGlowMaterial: THREE.Material | null = null;')).toBe(false);
    // An eagerly built module constant is not a lazy cache.
    expect(SINGLE_CACHE.test('const GOLD = new THREE.MeshStandardMaterial();')).toBe(false);
  });

  it('finds every registered factory, and enough of them to be a real sweep', () => {
    const hits = sweep();
    const files = hits.map((hit) => basename(hit.file));
    for (const module of REGISTERED_MODULES) expect(files).toContain(module);
    // Vacuity floor: the four bundles plus the excluded battleground caches.
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(hits.filter((hit) => hit.idiom === 'bundle')).toHaveLength(4);
  });

  it('leaves no hit unregistered and unexcluded', () => {
    const unaccounted = sweep()
      .map((hit) => basename(hit.file))
      .filter((file) => !REGISTERED_MODULES.includes(file) && EXCLUDED[file] === undefined);
    expect(unaccounted).toEqual([]);
  });

  it('keeps every exclusion a real hit, with a reason', () => {
    const files = new Set(sweep().map((hit) => basename(hit.file)));
    for (const [file, reason] of Object.entries(EXCLUDED)) {
      // A stale exclusion is as bad as a missing one: it hides the day the
      // module changes shape.
      expect(files.has(file)).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
    }
  });
});

describe('the staged group', () => {
  it('carries every material each factory can produce', () => {
    const group = buildAbilityMaterialPrewarmGroup();
    const staged = new Set(abilityMaterialPrewarmMaterials(group));
    for (const source of ABILITY_MATERIAL_SOURCES) {
      const produced = source.materials();
      // Enumerated from the factory itself: a hand list would go stale the day
      // a visual grows a fifth material.
      expect(produced.length).toBeGreaterThan(0);
      for (const material of produced) expect(staged.has(material)).toBe(true);
    }
  });

  it('stages the LIVE cached materials, not copies of them', () => {
    // The cache is module-level and memoized, so the second build hands back
    // the same instances the first cast will draw with.
    const first = new Set(abilityMaterialPrewarmMaterials(buildAbilityMaterialPrewarmGroup()));
    for (const source of ABILITY_MATERIAL_SOURCES) {
      for (const material of source.materials()) expect(first.has(material)).toBe(true);
    }
  });

  it('is hidden, so no prewarm frame can draw a spell effect at the player', () => {
    const group = buildAbilityMaterialPrewarmGroup();
    expect(group.visible).toBe(false);
    expect(group.children).toHaveLength(ABILITY_MATERIAL_SOURCES.length);
    for (const child of group.children) expect(child.visible).toBe(false);
  });

  it('covers the mesh kinds the visuals really draw', () => {
    // The program a material links depends on the mesh wearing it, so an
    // instanced or sprite draw that the stand-in lacks would link a different
    // program at first cast.
    const group = buildAbilityMaterialPrewarmGroup();
    const kinds = { mesh: 0, instanced: 0, sprite: 0 };
    group.traverse((object) => {
      const mesh = object as THREE.InstancedMesh & THREE.Sprite;
      if (mesh.isInstancedMesh) kinds.instanced++;
      else if (mesh.isSprite) kinds.sprite++;
      else if ((mesh as THREE.Mesh).isMesh) kinds.mesh++;
    });
    expect(kinds.mesh).toBeGreaterThan(0);
    expect(kinds.instanced).toBeGreaterThan(0);
    expect(kinds.sprite).toBeGreaterThan(0);
  });
});

describe('the manifest wiring (source pins)', () => {
  const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

  it('rides the ability-primitives entry, on both arms', () => {
    const start = renderer.indexOf("        id: 'vfx.ability-primitives',");
    expect(start).toBeGreaterThan(0);
    const entryStart = renderer.lastIndexOf('      {', start);
    const entry = renderer.slice(entryStart, renderer.indexOf('\n      {', start));
    expect(entry).toContain('abilityMaterialSlot.run();');
    expect(entry).toContain('...abilityMaterialSlot.resumeUnits(),');
  });

  it('is a staged compile group, so the boot compile lane links it', () => {
    expect(renderer).toContain(
      "const abilityMaterialSlot = createVariantPrewarmSlot(\n      variantSlotHost,\n      'ability-materials',\n      buildAbilityMaterialPrewarmGroup,\n    );",
    );
    expect(renderer).toContain('abilityMaterialSlot.staged(),');
  });
});
