# Phase 16: Art: painted launcher icon + owned cell art

Owns: the crown launcher art gap (DESIGN.md section 6 primary-destination standard) and
the owned non-item cells shipping the generic unknown ghost (72 Horizons + 17
Professions slots).

### Starter Prompt
```
This is Phase 16 of the Reliquary Perfection packet: launcher and cell art.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: the Reliquary launcher ships painted chrome art like every sibling primary
destination, and an OWNED mount, skin, title, or mark cell shows recognizable art, not
the unknown-item ghost.

STEP 0: canonical pre-flight + release sync. Memory: GLB/asset memories are not in
play (this is 2D chrome + icon art); pr-screenshots traps for the visual evidence.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
src/ui/chrome_icon_art.ts (CHROME_ART_IDS + the mapping.json + npm run assets:chrome
pipeline; how book.webp was produced and registered), public/ui/chrome/ contents;
src/ui/reliquary_window.ts cellIconHtml + cellQuality; existing art sources for each
relic kind: mounts (do mount defs carry icon art? check MOUNTS + bag icon rendering for
reins items), weapon skins (store/armory art: localizeWeaponSkin + any skin preview
asset), titles (DEED_IMAGE_IDS crest art + how the deeds window renders crests),
profession marks (gather event / masterwork iconography if any; the professions window
icon family); src/ui/icons.ts + ui_icons.ts fallback compositor; DESIGN.md section 6.
Return: per-kind art source availability and the chrome-art generation recipe.

STEP 2 - EXECUTE (two agents: chrome art, cell art):

Agent A (launcher):
- Produce public/ui/chrome/crown.webp in the established painted style (follow the
  assets:chrome recipe the Explore found: source art + optimizer + manifest; if the
  pipeline generates from a source PSD/PNG set, add the source where its siblings
  live). Register 'crown' in CHROME_ART_IDS and mapping.json, run npm run
  assets:chrome, verify the launcher and the mobile More tray render painted art in
  both index.html and play.html entries.
- Extend tests/chrome_icons.test.ts (or its data pin) so 'crown' is asserted painted,
  keeping the existing secondary-control prohibition intact.

Agent B (cell art):
- cellIconHtml per kind, owned state first (missing cells keep the silhouette
  treatment): mounts render their reins item icon (the bag already has one) or a mount
  crest if the Explore found dedicated art; titles render the deed crest via
  DEED_IMAGE_IDS with the deeds window's crest renderer; weapon skins render their
  store/armory art if present, else a skin-styled glyph that is NOT the unknown ghost;
  marks get a small dedicated glyph set (masterwork hammer-star, field-note leaf,
  specimen droplet: procedural SVG in the ui_icons family is acceptable and
  dependency-free). Every owned cell must be visually distinct from the unknown ghost;
  DESIGN.md: the keyword fallback compositor is runtime safety, never the shipped look
  for a known surface.
- Missing (unowned) cells: keep quality-tinted silhouettes; where per-kind art exists,
  silhouette THAT art (grayscale/darken via the existing owned-vs-missing CSS classes)
  so the shape teases the reward, matching how item cells already silhouette real art.
- Tests: a pin that every catalogued relic kind resolves to a non-fallback icon path
  when owned (drive cellIconHtml for one relic of each kind; assert the unknown-ghost
  marker class is absent), plus the recent strip and tracker (Phases 14 and 15) reuse
  the same per-kind resolver: extract it as a pure helper if the call sites hit three.

INVARIANTS: no new dependencies; procedural or curated art through the existing
pipelines only; regenerated manifests via their owning steps; art carries no
information a player acts on beyond identity (fairness untouched); asset budget green
(npm run asset:budget if the pipeline touches the media manifest).

Out of scope: 3D/GLB work, store surfaces.

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/chrome_icons.test.ts tests/reliquary_window.test.ts
tests/reliquary_window_behavior.test.ts + styles suites; npm run ci:changed; asset
budget if manifests changed; desktop + mobile screenshots (launcher rail, More tray, a
Horizons page with owned mounts/titles). Dispatch: frontend-seam-reviewer +
qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(ui): painted crown chrome art for the Reliquary launcher
- feat(ui): per-kind owned-cell art for mounts, skins, titles, and marks

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] The launcher renders painted art beside its siblings on desktop and mobile;
      pinned in chrome_icons.
- [ ] One owned relic of every kind renders identifiable art (screenshot evidence);
      the unknown ghost appears for NO catalogued owned relic (pinned).

STEP 6 - DOCS: progress.md, state.md (art assets added, resolver helper if extracted).
STEP 7 - FINAL RESPONSE + handoff to Phase 16 QA.

STOPPING RULES: stop and surface if no acceptable art source exists for a kind (list
the gap as an explicit art request rather than shipping a compromise; DESIGN.md rule).
```
