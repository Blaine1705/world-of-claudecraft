<!-- docs/: design docs, feature PRDs, operational runbooks, README/PR screenshots,
     i18n contributor docs. Area-scoped notes only; root CLAUDE.md covers the repo.
     Don't duplicate it. -->

# docs/: Design & PRD reference

**Reference material, not auto-loaded.** Open the relevant doc when working on that
feature. Two kinds live here: **living docs** (runbooks, specs for unbuilt work) and
**historical records** (shipped programs, one-off reports). Only living docs carry
source-of-truth weight, and even they describe *intended* behavior: when code and a doc
disagree, re-verify against code and note the deviation. PRD `file:line` hook points
drift as the tree moves: re-find the exact location, trust the doc's intent, not its
line numbers. A new doc lands in `design/` (how a system should work), `prd/` (a
feature spec), or its program's dir; the top level is only for a living runbook.

## Layout
`ls docs/` for the current set; the named rows carry rules or are load-bearing.
| Path | What it is |
|---|---|
| `design/` | How systems are/should be built (notes below). |
| `prd/` | Feature specs: requirements + `file:line` hook points + acceptance criteria. |
| `qa-gate.md` | The QA-gate reference (Stop hook, pre-push floor, `npm run gate`, `/qa`); root CLAUDE.md points here. Living. |
| `image-to-glb-asset-workflow.md` | Living runbook for reference-image intake, procedural Three.js authoring, optimized GLB export, renderer integration, performance gates, and in-game visual proof. |
| `ai-pr-bot.md` | The non-blocking PR CI helpers: diff-scoped screenshots + AI review (`scripts/pr_shot_targets.mjs`, `prepare_ai_review.mjs`/`post_ai_review.mjs`). Living. |
| `desktop-release.md`, `desktop-ship-notes.md`, `mobile-store-release.md` | Release runbooks (Electron/Steam; iOS/Android). Living. |
| `sfx-studio-tutorial.md`, `codex.md` | Operator guides: the SFX Studio; the Codex support layer. Living. |
| `security/` | `malware-scan-catalog.md`: the path-aware triage priors behind `scripts/malware_scan.mjs --gate`. Living. |
| `i18n/` | Localized contributor docs: per-locale translations of the root `README.md` and `CONTRIBUTING.md` (see i18n note below). |
| `i18n-scaling/` | i18n architecture + workflow docs. `translation-workflow.md` is the canonical contributor/maintainer roles reference (root and `src/ui/CLAUDE.md` point here); `lazy-locales-and-contributor-workflow.md` is the lazy-locale/hygiene design package. |
| `achievements/` | Book of Deeds handoff: maintainer notes (open decisions, deferrals, follow-ups) and the deed icon art brief. |
| `release-notes/` | Per-version release notes. |
| `screenshots/` | Load-bearing image assets only (see below). Not a dumping ground for merged PR shots. |
| `api-pipeline/` | Server REST pipeline program packet (spec, progress, rollback runbook). |
| `architecture/`, `refactor/`, `hud-ux-and-accessibility/`, `ui-architecture-hud-modularization/` | Historical program records (the v0.15.0-era refactor doc, workstream hand-offs, completed phased UX/HUD programs): history, not source of truth. |
| other top-level `*.md` | One-off reports (`hud-program-roadmap.md`, `performance-feel-audit.md`, `online-movement-latency.md`, ...). Historical image side-cars under this tree were purged; do not reintroduce dead PR evidence. |

## design/ & prd/ contents
`ls` the dirs for the current set; most filenames say what they are. The non-obvious
ones worth knowing: `design/master-spec.md` is the big design doc (levels 6 to 20
expansion: story arc, zones, dungeons, XP math, ids); `design/spell-ranks.md` is the
classic-era ability-rank reference for sim ability content; `design/deeds.md` is the
Book of Deeds achievements system plus the authoring contract every new deed (and
every new piece of conquerable content) follows. `design/design-language/` holds the
approved desktop reference renders (images only, no local doc) that the repo-root
`DESIGN.md` design-language spec names as its primary references and links by path,
so keep the filenames stable. **TRAP:**
`design/icon-system.md` proposes a multi-file `src/ui/icons/` module, but the shipped
code is the flat `src/ui/icons.ts`, so re-verify against code.
**Shipped history, same trap:** `design/ue5-overhaul-plan.md` is a completed program
(its output IS the current `public/` asset stack), and `prd/DELVE_REBUILD_V0.8.md` +
`prd/DELVE_HANDOFF.md` describe systems long since shipped (`src/sim/delve_layout.ts`,
`src/sim/content/delves/`, `src/sim/lockpick.ts`): read them as records, not plans.
`prd/frontier-pvp-honor.md` (Frostreach Frontier PvP zone, honor, $WOC stakes layer)
pairs with `prd/FRONTIER_PHASE1_HANDOFF.md`, a slice-by-slice implementation handoff
whose slices are specced but NOT yet implemented; read the handoff before starting one.

## screenshots/
Permanent, load-bearing assets only. Keep this tree small.

**Belongs here permanently:**
- README (and `docs/i18n/README.*`) hero embeds (stable filenames; replace in place).
- Asset-pipeline evidence that tests and exporters pin: `eastbrook-vale-rebuild/`
  (fingerprints, materials, turnarounds, capture matrix) and `eastbrook-grand-armoury/`.
- Living design/PRD concept captures that docs still cite (for example `wildheart/`).

**Does not belong here after merge:** PR before/after directories, one-off capture
outputs, or report side-cars. Capture them with `scripts/pr_screenshots.mjs` (or a
bespoke `*_shot.mjs`) for the PR review, attach them to the PR body or CI bot
comment, and leave them out of the permanent tree (or delete them in the same PR
once review is done). Regenerable capture output is not provenance.

## i18n note (the only player/contributor-facing strings under `docs/`)
The doc *prose* here is dev/design reference, English-only. The exception is `i18n/`:
`README.<lang>.md` and `CONTRIBUTING.<lang>.md` are **hand-maintained localized mirrors**
(not generated) of the English root `README.md` / `CONTRIBUTING.md`, linked from each
doc's language switcher, one per translated locale (the near-English `en_CA` overlay gets
no separate doc). Same split as the app: a contributor edits the **English source** only;
the maintainer fills every locale mirror at release. Don't hand-translate or stub these in
a PR. (`docs/i18n-scaling/worklist/` is a gitignored generated artifact, never edit;
`npm run i18n:worklist` regenerates it.)
