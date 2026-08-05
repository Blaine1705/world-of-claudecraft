# Whole-feature QA matrix (run once, at Phase 22 QA)

- Three-host parity: offline Sim, online ClientWorld, headless env agree on every
  IWorldReliquary member (including the ones this packet adds: deep-link state, obtain
  counts, active border, tracker reads). tests/world_api_parity.test.ts green with the
  updated pin; a manual offline-vs-online spot check of the window, tracker, inspect,
  and character sheet.
- Determinism: tests/architecture.test.ts green; no Rng draws added by any packet phase
  (goldens show zero rng.draws drift); same-seed round-trip tests green.
- i18n completeness: every player-visible string (window, tracker, chat lines, banners,
  inspect, page names, source hints, obtain counts, tips) resolves through t(); S3 guard
  green; M16 fills present for every wordy key added by this packet; the Phase 22
  release-fill worklist enumerates every pending Latin row; no title-attr-only tooltips.
- Classic fidelity + doctrine: every reward cosmetic, Renown 0 on reliquary-sourced
  deeds; no drop-rate/pity/power anywhere; borders and sigils carry no actionable info
  (graphics-fairness tests green).
- Server authority + privacy: no client-writable reliquary state; hidden deeds invisible
  (existence included) on every surface including the wiki (guide.test needles cover
  reward.text); public sheet exposes aggregates only; the bank-derived-mounts note is
  recorded in the design doc.
- Persistence: pre-packet saves load clean (defaults for counts/illuminated/border
  fields); save/load round-trip tests green; blob growth re-measured and recorded
  (Phase 17 target: no worse than the shipped +2.7 KB stored worst case after the
  pageId removal offsets the counts addition).
- Performance: hud_perf_budget green (window cold, tracker write-elided); reliq wire
  memoized (no per-2s rebuild when unchanged); no per-frame allocation added; rarity
  aggregation cached with a bounded cadence (database-performance-reviewer sign-off).
- Copy: no em dashes, en dashes, emojis in any added text.
- Build gate: full `npm run gate` green on the final tip.
- PR: body corrected (re-pin attribution, overlay-fill description, gate claim,
  screenshot list), all screenshots genuine and current (desktop + mobile: window,
  Overview, character sheet, tracker, inspect, nameplate border), CI green.
- Packet teardown: offer to delete docs/prd/reliquary-perfection/ before merge
  (explicit confirmation only; surface deferred riders first: release locale fill,
  release-side re-pin issue text, Steam/Epic portal config).
