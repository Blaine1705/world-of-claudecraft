<!-- scripts/assets/: OFFLINE GLB/texture build pipeline. Run by hand, not by
     `npm run build`. Separate from the renderer's runtime procedural geometry
     (src/render/) AND from the media manifest (scripts/build_media_manifest.mjs).
     See ../CLAUDE.md for the rest of scripts/. -->

# scripts/assets/

Offline asset pipeline: optimize raw downloaded model packs into shipping files
under `public/`. One sanctioned 2D exception lives here too: `chrome_crown/`
holds the layered-SVG source and render script for the Reliquary launcher's
painted chrome icon (its siblings were generated externally and have no
committed source; a procedurally authored icon keeps its source in-repo, and
the render feeds the normal `npm run assets:chrome` converter). Every other
2D icon converter stays at `scripts/convert_*_webp.mjs` top level.
Run manually (not part of `npm run build`):
`node scripts/assets/build_assets.mjs scripts/assets/specs/<spec>.json`.
For reference-image reconstruction and procedural GLB authoring, read the living
`docs/image-to-glb-asset-workflow.md` runbook before adding a model-specific exporter.

- **`specs/*.json`** declare *what* to build: `{ items: [{ src, out, type, ... }] }`.
  `src` is usually under `tmp/asset_src` (raw packs, gitignored); `out` is relative
  to `public/` (`ls specs/` for the live set: character/skeleton packs, dungeon,
  props, textures, lookdev, foliage, biome packs, and the exporter specs). A new
  asset pack is a new spec JSON, never hardcoded paths in the script.
- **`build_assets.mjs`** processes each item with `@gltf-transform` + `meshoptimizer`
  + `sharp`: `resample`, `prune`, `dedup`, `(textureCompress)`, `meshopt`. Types:
  `character`/`static` are geometry-safe (never join/flatten/**simplify**, would
  corrupt rigs/hard edges); `copy` is a byte-for-byte copy (HDRIs, plain textures).
  Clip names (`Armature|Idle`) are stripped to the last `|` segment + deduped.
  Per-item options (`keepClips`/`maxTex`/`attachMeshes`, bulk `srcDir`/`outDir`
  instead of `src`/`out`, a top-level `defaults` block, `--shard i/n`) live in
  `build_assets.mjs`.
- **`build_foliage.mjs`** is a superset for `foliage.json`: adds `weld + simplify`
  (target `ratio`), strips constant-white `COLOR_0`, and hue-rotates leaf textures
  via `recolor` rules. Use this only for foliage.
- **`build_battleground_map.mjs`** (+ `battleground/`, own CLAUDE.md) builds the Thornhollow Fields
  field's map document from the combat plan plus the Thornhollow art kit, and
  `compile_thornhollow.mjs` compiles that document into `src/sim/thornhollow_field.generated.ts`.
  Both are deterministic and both committed artifacts are freshness-gated by
  `tests/battleground_band.test.ts`: re-run BOTH after any edit under `battleground/`.
- **`compress_glb_textures.mjs` is the mandatory FINAL step after ANY exporter run.**
  It carries TWO invariants, each with its own guard suite.
  - **Textures.** Every embedded texture in a shipped GLB is KTX2/Basis
    (`KHR_texture_basisu`) so it stays GPU-compressed in memory instead of decoding to a
    full RGBA bitmap (the decode amplification of the old webp embeds is what got the
    native iOS client jetsam-killed at world entry). Guarded by
    `tests/glb_texture_compression.test.ts`. The one sanctioned exception, WEAPON_VFX skin
    models, keeps drawable webp (their emissive derivation must drawImage the baseColor;
    see the test header). That exception is TEXTURES ONLY.
  - **Geometry.** Every shipped GLB is quantized (`KHR_mesh_quantization`) and
    meshopt-encoded (`EXT_meshopt_compression`); the runtime loader wires MeshoptDecoder
    unconditionally, so this is a pure download and first-load win. Guarded by
    `tests/glb_meshopt_coverage.test.ts`. The animation-only clip banks (`*_anims.glb`)
    carry no meshes, so they are meshopt-encoded without mesh quantization, which is
    correct rather than a gap.
    **`public/models/weapons/` is exempt from the geometry ADD** (`GEOMETRY_ADD_EXCLUDED_DIRS`),
    and the exemption is narrow: the pass still RE-APPLIES the codec to a weapon that
    already carries it, it may only not introduce it. Quantization recentres each mesh
    onto its bounding box and compensates on the node, but `src/render/characters/assets.ts`
    documents that a variant weapon's mesh ORIGIN is its grip point ("we do NOT recenter"),
    and `flattenWeaponScene` discards the root node's position, so the compensation is
    thrown away and the weapon hangs low; 36 weapons additionally carry a hand-tuned
    `WEAPON_GRIP_OVERRIDES` nudge calibrated against the old origin. Lifting this needs
    those grips recalibrated in the asset-pipeline inspector FIRST, because the acceptance
    is visual. Do not "fix" it by making `flattenWeaponScene` keep the position: the 38
    weapons already shipping compressed all carry a non-zero root translation and render
    correctly precisely because it is dropped.
  The exporters above still emit raw webp geometry; re-running one and committing its
  output silently reverts BOTH invariants. Recover with
  `node scripts/assets/compress_glb_textures.mjs && node scripts/build_media_manifest.mjs generate`.
  The texture half needs the `ktx` tool from KhronosGroup/KTX-Software 4.3+ on PATH (no
  sudo: expand the release pkg with `pkgutil --expand-full`, add its `bin/` to PATH); the
  geometry half needs nothing beyond the installed packages.
  The script writes a file only when it owes it something, and its post-transform check is
  by IDENTITY, not by count (`geometryPassViolations`): quantize legitimately inserts an
  anonymous transform node and copies a shared skin per quantized mesh, so every named
  node must survive, every mesh must keep a reference, and every addition must prove which
  of those two shapes it is. A count-only guard refused three legitimate files (issue
  #3287); a guard merely loosened to "may grow" would stop noticing a REPLACEMENT.
  **A source that already carries `KHR_mesh_quantization` is dequantized back to float
  first.** Re-quantizing an integer POSITION accessor in place destroys the model:
  `rift_portal.glb`, the one shipped file in that state, came out with POSITION
  `max [0, 32767, 0]`, every x and z collapsed to zero, a 4.7 MB flat line whose meshes,
  nodes, materials and vertex count were all still correct. That is why the guard also
  compares each primitive's POSITION PROPORTIONS (2 percent tolerance): a structural
  check alone cannot see a model that kept its whole graph and lost its shape.
  **`compress_glb_textures.mjs` is itself a fingerprinted input of the Fenbridge family**
  (`fenbridge_town/source_fingerprint.mjs`), so editing it moves that fingerprint: re-mint
  with `remint_lockfile_fingerprints.mjs` (size-preserving, leaves unmoved families
  byte-identical), then re-pin the printed sha256 literals in
  `tests/fenbridge_town_assets.test.ts` and the `sourceFingerprint` in the 14
  `docs/screenshots/fenbridge-rebuild/assets/*-ai-review.json` evidence files, which the
  tool does not sweep.
- **Per-asset procedural exporters** author GLBs from reference images. Each is a
  subdirectory here (`banker_chest/`, the `eastbrook_*` family, `fenbridge_town/`,
  `terrorspark_groundshaker/`; `ls` for the live set) holding a deterministic factory
  (`model.js`, or contract tables for a town wave), a browser `export_entry.js`, a driver
  `export_<asset>.mjs`, and a spec with `keepExtras: true`. The condensed procedure
  is the `image-to-glb` skill (`.claude/skills/image-to-glb/SKILL.md`); a new asset copies
  the mailbox/noticeboard archetype (or the town contract-table archetype for a wave),
  never a bespoke pipeline.
- **Source fingerprints are load-bearing.** Eastbrook-era exporters stamp a sha256 over a
  pinned input list (factory/entry/exporter/spec, `build_assets.mjs`, reference
  turnarounds, the shared atlas, and `pnpm-lock.yaml`) into the GLB extras, and tests
  recompute it live. Any change to a fingerprinted input, including a lockfile-only bump,
  means re-exporting the affected families (`--no-preview`), regenerating the media
  manifest, and re-pinning the sha256/fingerprint literals in tests, docs, and capture
  evidence JSONs in the same change. For a lockfile-only leaf rename/swap that must keep
  shipping GLB sizes, prefer the size-preserving in-place remint
  (`scripts/assets/remint_lockfile_fingerprints.mjs`) over a full geometry rebuild, then
  re-pin seals and run `scripts/assets/eastbrook_grand_armoury/remint_polish_provenance.mjs`
  as needed (the remint tool prints that follow-up path itself).
- **`compress_standalone_textures.mjs`** (+ `lib/standalone_texture_compression_core.mjs`)
  is the KTX2/Basis step for textures that ship OUTSIDE a GLB (default sweep: the player
  skin/cosmetic atlases under `public/textures/skins/`), the same decode-amplification win
  as the GLB step. It emits a `.ktx2` SIBLING next to each PNG and never deletes the source:
  the runtime opts in per directory (`loadSkinTexInto` in `src/render/characters/assets.ts`
  requests the sibling only for `textures/skins/` atlases), and `base.png` thumbnail sources
  are skipped. Run it after adding or repainting a standalone atlas.
- **One-shot and maintenance tools**, each with its recipe in its own header: the zone prop
  bakes (`build_willowfen_props.mjs` and its `*_props.mjs` siblings: one-shot weld + bounded
  simplify recipes over maintainer-local source packs; copy the willowfen recipe for a new
  zone drop), `pack_ground_ao.mjs` (packs the splat ground relief channels into one RGBA so
  `buildSplatMaterial` stays under the fragment sampler limit), `declare_orm_occlusion.mjs`
  (declares the packed ORM red channel as `occlusionTexture` on shipped GLBs so three.js
  builds an aoMap, zero new texture bytes), `foliage_vertex_pipeline.mjs` /
  `optimize_foliage_vertices.mjs` (deterministic finalization of the shipped foliage GLBs;
  input/output sha256 tables live in the module), and `ravenrift_blueprint.mjs` (run via
  `tsx`: renders the battleground blueprint diagram FROM the authoritative layout records,
  so the docs image cannot drift from what players collide with).

## Relationship to the rest
- **Output to `public/`** (the GLB/texture/HDRI tree the game loads at runtime).
- **Runtime procedural generation** in `src/render/` is a *separate* path, most
  geometry/textures are generated in-browser; this pipeline only bakes the imported assets.
- The **runtime media manifest** (`src/render/assets/manifest.generated.ts`) is
  generated separately by `../build_media_manifest.mjs`, which content-hashes
  whatever ends up in `public/`. Asset licenses: `CREDITS.md`.

## Never
- Don't add `simplify` to a `character`/`static` item in `build_assets.mjs`, that's
  exactly why `build_foliage.mjs` exists separately.
