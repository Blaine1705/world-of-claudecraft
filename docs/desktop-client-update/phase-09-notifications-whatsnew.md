# Phase 9: notifications and what's new

### Starter Prompt
```
This is Phase 9 of the Desktop Client Update: OS notifications and the what's-new link.

Model: Opus 4.8, xhigh effort. Harness: Claude Code. ULTRACODE: not needed.

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action pull+merge origin/release/v0.36.0; git status clean or stop.

Goal: the desktop tells an unfocused player about a ready update and a party invite via
OS notifications, and the update toast links to what changed.

LOCKED DECISIONS (state.md): notification strings are t()-rendered in the RENDERER and
pushed as final strings over a validated, capped, rate-limited channel (main stays
language-agnostic). What's-new is a t()-keyed LINK to the wiki changelog, NOT feed
release-notes text (rejected for i18n; do not revisit).

STEP 0 - memory scan (topics: desktop-client-update program, shell strings push
pattern, wiki launcher PR 3124 for how the client opens wiki URLs).

STEP 1 - LOAD CONTEXT: Explore agent (budget ~35 calls, report-first) summarizes:
state.md recipes, progress.md, this file; the observation points recorded in
brainstorm.md section 5: the partyInvite SimEvent case in the hud event switch (mind
the offline pid gate documented there) and the reduceUpdateToast 'downloaded' ->
mode 'ready' transition in src/ui/desktop_update_view.ts; src/ui/desktop_update_toast.ts
render structure (where a link row fits); how the client opens external/wiki URLs
(the wiki launcher pattern from PR 3124; the /wiki changelog route if one exists,
else the external site URL builder); electron/preload.cjs + main.cjs handler shapes;
Electron Notification API constraints per platform (macOS needs the app signed for
notifications in dev? record what the docs in-repo say, if nothing, note it). Return:
the two observation points as merged today, the toast render seam, the wiki URL
mechanism, and the channel pin lists.

STEP 2 - EXECUTE (electron agent + renderer agent in parallel):
Electron agent:
- showNotification invoke channel: trustedSender-gated handler taking {title, body},
  validating both as strings, stripping control chars (flattenControlChars from
  diagnostics.cjs), capping lengths (~120/240), rate-limiting main-side (a small pure
  module electron/notify_guard.cjs + test: max ~1 per 10s per kind, drop excess
  silently), showing via new Notification({title, body, silent: false}) only when the
  window is NOT focused (re-check focus main-side; the renderer also gates, defense in
  depth). No click-routing beyond focusing the window (win.focus on click).
- ipc pins updated (invoke list + method list).
Renderer agent:
- A small module src/game/desktop_notifications.ts (pure decision core + thin init,
  composed in initDesktopShellIntegration): subscribes to the two observation points
  WITHOUT restructuring them: (a) party invite: from the hud event path, respecting
  the pid gate exactly as the prompt case does (only the local player's invites);
  (b) update ready: observe the reduceUpdateToast transition to 'ready' (the pure
  core seam), once per version. Each fires bridge.showNotification with t()-rendered
  strings ONLY when document.hidden or !document.hasFocus().
- New English keys (desktop.notify.updateReady{Title,Body} with {version},
  desktop.notify.partyInvite{Title,Body} with {name}); wordy values get the five
  non-Latin fills (M16). These render in the renderer so they live in the normal
  catalog (shell.ts desktop block), NOT in DEFAULT_SHELL_STRINGS (that contract is for
  strings main renders itself; do not touch it).
- What's-new: a link row on the 'ready' state of the update toast (extend the pure
  view core + painter per the existing toast structure), t('desktop.update.whatsNew'),
  opening the wiki changelog through the established wiki-launch pattern. The reducer
  gains nothing; this is render-only off mode==='ready'.

INVARIANTS IN PLAY: main language-agnostic (final strings only); every player string
t()-keyed English + M16; the update_events payload whitelist is NOT extended (the link
needs no new event data); bridge optional + feature-checked; offline/web no-op.

Out of scope: notification preferences UI (a global toggle can ride a later pass if
the user asks; note it as a deferral); queue-pop/other notification kinds; feed
release-notes text (rejected).

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit`; `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts
  tests/localization_fixes.test.ts` plus the toast/view tests; `npm run ci:changed`.
- Manual smoke if possible: dev desktop run, trigger a fake 'downloaded' event and an
  invite with the window unfocused; record OS behavior per platform available.
- Review dispatch per the implementation-plan.md matrix: privacy-security-review (new
  channel carrying free-form strings to an OS surface: the validation story is the
  review target) and frontend-seam-reviewer (toast/view work).
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS:
- feat(desktop): validated rate-limited os notification channel
- feat(game): notify unfocused players of ready updates and party invites
- feat(ui): what's-new link on the update-ready toast

STEP 5 - ACCEPTANCE:
- [ ] Notifications fire only unfocused, only rate-limited, strings validated both
      sides; focused play never notifies.
- [ ] Party invite respects the pid gate (test with the offline-events case).
- [ ] Update-ready notifies once per version; toast link opens the changelog via the
      established pattern.
- [ ] Keys English + M16 fills; S3 guard green; suites + gate_select green.

STEP 6 - DOCS + MEMORY: progress.md; state.md inventory (channel, keys, deferral note
on a notifications toggle).

STEP 7 - FINAL RESPONSE: status, files, validation, reviewer verdicts, handoff line.

STOPPING RULES: stop and ask if macOS notifications prove to require signing in a way
that blocks local verification (record what IS verifiable and continue elsewhere);
stop if the hud event path cannot be observed without restructuring the switch (that
refactor is its own decision).
```
