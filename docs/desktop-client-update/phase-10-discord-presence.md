# Phase 10: Discord Rich Presence

### Starter Prompt
```
This is Phase 10 of the Desktop Client Update: Discord Rich Presence, in-house.

Model: Fable 5, xhigh effort. Harness: Claude Code. Workflow orchestration: none in this phase (standard agent fan-out only).

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action pull+merge origin/release/v0.36.0; git status clean or stop.

Goal: "Playing World of ClaudeCraft, <Zone>" in Discord, via an in-house local-IPC
client, optional, privacy-respecting, never blocking boot, zero new dependencies.

LOCKED DECISIONS (state.md + brainstorm.md section 6): in-house implementation (the
protocol: connect to Discord's local pipe, Windows \\?\pipe\discord-ipc-{0..9}, unix
$XDG_RUNTIME_DIR/discord-ipc-{n} with TMPDIR//tmp fallbacks plus Flatpak
app/com.discordapp.Discord/ and snap.discord/ subdirs; frames = 32-bit LE opcode +
32-bit LE length + JSON; opcode 0 HANDSHAKE {v:1, client_id}, 1 FRAME, 2 CLOSE,
3 PING->4 PONG; SET_ACTIVITY rides opcode 1). Rejected: every RPC library (dependency
weight; see brainstorm). Activity strings are t()-rendered renderer-side. Coalesce
updates behind a ~15s trailing timer, drop same-zone no-ops (Discord queues nothing;
rapid calls blank presence).

OPEN ITEMS TO RESOLVE FIRST (state.md): (1) the approval-gate ambiguity: probe
SET_ACTIVITY with a throwaway Application ID against a running Discord client before
building UI copy; if this environment has no Discord client, build everything
testable and mark the live probe as the ONE unchecked box for the user, with exact
instructions. (2) Application ID provisioning is maintainer infrastructure; develop
against a placeholder env/config slot, never a hardcoded id. (3) Default state:
recommend ON (Discord's own activity-sharing setting still gates it); CONFIRM with the
user at phase start via a single question, then record in state.md.

STEP 0 - memory scan (topics: desktop-client-update program, options doctrine, embedded
probe strings need executed tests).

STEP 1 - LOAD CONTEXT: Explore agent (budget ~35 calls, report-first) summarizes:
state.md recipes + phase 7 store schema + phase 9 channel patterns; progress.md; this
file; where zone identity and zone display names live client-side (the IWorld read the
HUD uses for the current zone name, already localized); electron/ module templates;
the ipc pin lists. Return: the zone-name seam, the store schema, pin lists.

STEP 2 - EXECUTE (electron agent + renderer agent in parallel):
Electron agent:
- electron/discord_presence_codec.cjs (+ .d.cts + Node test): PURE frame
  encode/decode: encodeHandshake(clientId), encodeSetActivity(nonce, activity),
  decodeFrames(buffer) -> {opcode, payload}[] handling partial frames and garbage
  (fuzz cases). No sockets, no electron.
- electron/discord_presence.cjs (+ .d.cts + Node test with an injected fake socket
  factory): connection manager: enumerate candidate pipe paths per platform (pure
  path-builder function, tested per-OS with injected env), lazy connect AFTER the
  window is up (never on the boot path), jittered backoff to ~60s max, treat
  ENOENT/ECONNREFUSED as absent (silent), CLOSE/EPIPE as Discord quit (resume
  backoff), respond to PING with PONG, one in-flight SET_ACTIVITY at a time, and a
  hard OFF switch (clearActivity + disconnect) when the setting turns off.
- Bridge: setDiscordActivity invoke channel (trustedSender; validates a whitelisted
  activity object: details/state strings control-stripped + capped ~128, timestamps
  numeric) and setDiscordPresenceEnabled(boolean) persisting via the phase 7 store
  (schema-versioned addition). Main-side rate limit: min 15s between SET_ACTIVITY
  sends, trailing-edge (the renderer also coalesces; defense in depth). ipc pins
  updated.
Renderer agent:
- src/game/discord_presence.ts: pure activity builder (given zone name + app version
  -> activity object; Node-tested) + thin init composed in
  initDesktopShellIntegration: observes zone changes through the same seam the HUD
  uses, t()-renders the zone display name, coalesces (trailing ~15s, no-op dedup),
  feature-checks the bridge, and stops sending when the setting is off.
- Options row via the doctrine: discordPresence toggle (default per the user's answer),
  desktop-only visibility, applySetting arm calling setDiscordPresenceEnabled, English
  key + M16 fills including a body noting presence is public on the player's Discord
  profile (the privacy surface).
- PRIVACY floor: activity carries ZONE and app identity only; never character name,
  never account/wallet anything, never party composition. Pin this with a test on the
  activity builder (assert the object's exact key set).

INVARIANTS IN PLAY: zero new dependencies; boot-path purity (lazy connect; a Discord
outage or absence must be indistinguishable from off); main language-agnostic (zone
names arrive pre-rendered); options doctrine complete; the activity key-set pin.

Out of scope: party size/join invites through Discord; buttons/deep-link joins; art
asset upload (maintainer); Android/iOS anything; the armory/second-window presence.

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit`; `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts
  tests/settings.test.ts tests/options_view.test.ts tests/localization_fixes.test.ts`;
  `npm run ci:changed`.
- The codec fuzz cases and the fake-socket lifecycle tests are the executable proof
  for this phase; the live probe runs only if a Discord client exists here (record
  either way; if not run, hand the user the exact probe steps in the final response).
- Review dispatch per the implementation-plan.md matrix: privacy-security-review (new
  outbound local-IPC surface + free-form strings + the privacy floor) and
  frontend-seam-reviewer (options row + game module). COVERAGE prompts.
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS:
- feat(desktop): in-house discord presence ipc client with pure codec
- feat(game): localized zone presence with coalescing and a privacy-floored activity
- feat(ui): discord presence options toggle

STEP 5 - ACCEPTANCE:
- [ ] Codec handles partial/garbage input (fuzz tests); lifecycle covers absent,
      connect, quit, reconnect, off-switch (fake socket).
- [ ] Never blocks or delays boot (connect is provably post-window, lazy).
- [ ] Activity key-set pin enforces the privacy floor; strings capped both sides;
      15s coalescing tested (no-op dedup + trailing edge).
- [ ] Options doctrine complete with M16 fills; S3 green; suites + gate_select green.
- [ ] Live probe recorded OR exact user instructions delivered.

STEP 6 - DOCS + MEMORY: progress.md; state.md (store schema addition, channels, the
default-state decision, probe status, Application ID provisioning still OPEN).

STEP 7 - FINAL RESPONSE: status, files, validation, reviewer verdicts, probe
status/instructions, handoff line for phase 10 QA.

STOPPING RULES: stop and ask before ANY deviation from zero-dependency (if the in-house
path hits an unexpected wall, the fallback is @xhayper/discord-rpc pinned, but that
reverses a locked decision and needs the user); stop if the live probe shows
SET_ACTIVITY gated for unapproved apps (feature copy must then change; user decision).
```
