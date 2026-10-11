# Dungeon manager feedback integration

Worktree: `.worktrees/mob-death-pose`, branch `fix/mob-death-pose`.
Integration base: PR 4352 head `c4b82d135200da33aa67a9772644b9512de6fe75`,
based on `release/v0.45.0`. Changes are local and uncommitted.

## Implemented behavior

- Five Wildheart humanoids collapse with complete joint tracks and relaxed arms.
- Sanctum terraces have branching fractures. The bridge has a visible, continuous
  ice deck, including on first observation of an already-open gate. Anchor chains
  hang into the crevasse.
- Velkhar's ward is higher on the ramp. Korzul's exit portal appears on the
  permanent lake rim and has dedicated frost visuals.
- Dungeon alerts describe actions and consequences, including dry-ground
  Bonewalker kills and avoiding Soulfire damage.
- Two Blender-authored Drowned Temple Wardens replace the entrance eels. The pair
  shares existing pack aggro and gate completion with the Siren. One telegraphs a
  trident lane; the other casts an interruptible tide nova. Their normal health is
  1,339 each, with existing Temple heroic mechanic scaling.
- The two other eel placements become Blender-authored Temple Amphibians with a
  pounce and frontal bite. New entity/cast names and Cantor guidance are localized.
- New GLBs have editable `.blend` files, reproducible Python, skin/clip/color
  contracts and baked interface portraits. Asset-local color correction prevents
  the shared Blender helper from applying sRGB conversion twice.
- Contact-timed attack clips hold ordinary autoattacks through their cast
  recovery, preserving trident and bite impact timing.

The redesigned guardian GLB is 133,972 bytes and 11,242 triangles. The amphibian is 144,604
bytes and 5,584 triangles. Each uses two material primitives and no textures.
The names in the supplied concept were checked before integration: the exact
`Abyssal Lurker` is already used by other games, so the new display name is the
generic `Temple Amphibian`; internal asset IDs remain stable. `Tidemarked Sentinel`
and `Tidal Surge` use descriptive fantasy English.

The user's revised Warden brief replaces the initially rejected box-built model.
The final Blender sculpt uses curved ceremonial plates, a closed shrine helmet,
tapered limbs and a swept trident, informed by existing Boneguard/Olen silhouettes.
Its measured skinned body is twice the player height after both manifest and
entity scaling. A stable Weapon joint keeps the trident attached through all
eight animation clips. Charge visuals now use the measured chest height.
The display name is `Drowned Temple Warden`; internal IDs remain unchanged.
The scoped asset/mapping checks passed 10 tests, and name/content guards passed
37 tests. The animation reviewer checked actual skinned vertices at Idle, Attack,
Cast and Death, finding no meaningful floor penetration.

## Evidence

- [Sanctum surfaces, portal and mobile copy](../../screenshots/sanctum-feedback/surfaces.md).
- [Wildheart before/after corpses](../../screenshots/wildheart-death-feedback/README.md).
- [Guardians in game](../../screenshots/temple-feedback/desktop-ultra-guardians.png).
- [Amphibian in game](../../screenshots/temple-feedback/desktop-ultra-lurker.png).
- [Guardian ability](../../screenshots/temple-feedback/desktop-ultra-surge-charge.png).
- [Portal on Low with reduced motion](../../screenshots/sanctum-feedback/after_mobile_low_reduced_exit_portal.png):
  live assertions verify Low materials, both reduced-motion settings, hidden
  nameplates and unchanged vortex rotation over one second. Earlier mobile
  surface captures prove viewport readability only, not a verified Low tier.
- [Warden redesign comparison](../../screenshots/tidemarked-sentinel-v2/):
  the previous `temple-feedback` guardian captures show the rejected first model;
  the V2 directory is the current Warden evidence.

## Validation and limits

Exact commands and raw output are retained under `tmp/sanctum-feedback/`.

- Integrated Vitest batch (`integrated-tests.log`): 15 suites, 125 passed,
  one skipped. Includes assets, sim mechanics, VFX, copy, localization, source
  packing, bridge geometry, gate observation and corpse animation.
- `npx vitest run tests/cast_display_name.test.ts tests/architecture.test.ts
  tests/floor_vfx_layer.test.ts tests/guide.test.ts --maxWorkers=4`:
  four suites, 295 passed.
- `npx vitest run tests/mob_portrait_source_manifest.test.ts --maxWorkers=2`:
  19 passed. The launch-directory probe now uses a file URL on Windows.
- Eastbrook provenance tests: two suites, 30 passed after the prescribed remint
  for the renderer's reduced-motion change. No historical measured values changed.
- `npx tsc --noEmit`: passed.
- `cmd /c node_modules\.bin\turbo run check:types build:env build:server
  build:bot build:bundle`: seven tasks passed.
- Scoped Biome: 53 source/test files checked, no errors, 13 warnings.
- `npm run security:gate`: passed, zero high findings after reviewed priors.
- `npm run wiki:content`: unchanged, as the spoiler-safe guide excludes dungeon
  mob figures. Scoped `wiki:stills` produced no jobs and no orphan images.
- Portrait renderer: 35 jobs, zero failures or page errors. Eight sources belong
  to this task; the remaining stale PR-base sources also required real rendering
  to satisfy the receipt-guarded ledger. The missing base remembrance candle
  portrait is included. `build_mob_portrait_source_manifest.mjs --check` passes.
- `npm run test:browser`: 64 suites and 521 tests passed earlier in the work,
  before the Temple additions. Final Temple coverage uses real in-game captures
  and focused tests; that earlier result is not a final Temple browser-suite run.

`npm run gate` was run again and stops at i18n freshness because regenerated
files differ from the index. Staging is not authorized in this session. This is
not a green contribution gate.

An earlier full Vitest run reported 74 failing files and 5,008 passing files,
but source files changed during that run. It is not final-state evidence. Its
task-attributable failures were reproduced or inspected and corrected. Remaining
base/Windows failures include shell/path assumptions and unrelated stale content
inventories; the whole suite is not certified green. The aggregate asset budget
also remains above the repository's existing caps (684 MiB against 95 MiB total).

The browser suite rewrote unrelated tracked screenshot fixtures under
`clue-character-panel`, `cosmetics-window`, `harvest-button-refresh` and
`intentional-gathering-pr1/pr2`. They are generated test output, not task changes,
and must be excluded from any future scoped commit.

No commit, push, PR update or deployment was performed.
