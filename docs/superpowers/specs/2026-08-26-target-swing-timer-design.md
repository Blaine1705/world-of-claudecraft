# Target / target-of-target swing-timer bars

Status: approved by user (chat), pending spec review
Lands on: PR #3648 (`feature/offhand-swing-timer-indicator`), as additional commits
Requested in: PR #3648 review comment (Candy asked for a target melee swing timer;
toggleable, useful for healers watching what is about to hit the tank)

## Problem

PR #3648 adds the player's own off-hand swing-timer bar. It does not address a
second, independently requested need: showing the swing timer of the player's
CURRENT TARGET, and of the target's own target (the classic "what is about to
hit the tank" read a healer or off-tank needs). Today `Entity.swingTimer` is
correctly ticked for every entity offline, but only the PLAYER's own swing/weapon
data ever reaches the client: `selfWireJson()` is self-only, and the general
per-entity wire encoder (`dynamicFields()` in `server/game.ts`) carries no
swing-related field for any entity.

## Decisions already made (do not re-litigate without new information)

1. Lands as further commits on the existing `feature/offhand-swing-timer-indicator`
   branch (PR #3648 grows), not a separate PR.
2. Target-of-target bar shows unconditionally, whatever the target is currently
   targeting (no special-casing on "is it me/my party").
3. Main-hand only for the target and target-of-target bars. No off-hand bars for
   them (scope control; avoids the screen clutter the commenter themself flagged).
4. One new toggle, `showTargetSwingTimer`, controls both new bars together.
5. The new toggle defaults OFF (opt-in), matching the commenter's own "maybe too
   much info, could be a plugin" framing.
6. The two new bars are placed under the target frame (information about the
   target belongs with the target's other UI, not with the player's own bars).
7. This new toggle is independent of the existing `showTargetOfTarget` mini-frame
   toggle: the target-of-target swing bar must resolve and show even when the
   target-of-target PORTRAIT mini-frame is switched off, and vice versa.

## Root cause of the wire gap (verified against current code)

- `src/ui/swing_timer.ts`: `swingTimerState(player, target, ...)` / `computeSwingState()`
  already hold ALL the fill/ready/edge-tracking math needed; they read the PLAYER's own
  `autoAttack` / `swingTimer` / `weapon.speed`, using `target` only as a visibility gate
  (dead / object check), never as a data source. Reusable as-is for the new bars: the
  target/tot bars need the SAME math applied to the TARGET's own fields instead.
- `src/ui/hud.ts` (~line 8576-8790) already resolves `target` (`sim.entities.get(p.targetId)`)
  and, inside that block, `tot` via `targetOfTargetId(target)` (`src/ui/target_of_target.ts`)
  + `sim.entities.get(totId)`, gated on `showTargetOfTarget`. Both hosts (offline `Sim`,
  online `ClientWorld`) resolve entities through the identical `sim.entities.get(id)` call,
  so no new `IWorld` facet member is needed: the existing cast-bar code already proves
  arbitrary non-self entities are reachable this way on both hosts.
- Offline, `target.swingTimer` is already correct for a mob target: `src/sim/mob/combat_profile.ts`
  ticks `mob.swingTimer` down every engaged tick (`tryMobMeleeSwingInRange`,
  `updatePursuitProfileCombat`, `updateCasterCombat`'s chase arm). No offline sim change is
  needed for the DATA to exist.
- The real gap is TWO-FOLD:
  - **Wire**: `dynamicFields()` (server/game.ts) never emits swing/weapon fields for a
    non-self entity; `swing`/`swingOff`/`weapon`/`auto` only ride `selfWireJson()`.
  - **Gate**: `Entity.autoAttack` (the flag `swingTimerState()` already gates on) is
    NEVER set true for mobs. `combat_profile.ts`'s melee loop swings mobs purely off
    `swingTimer <= 0` and range, without ever touching `autoAttack`. Today `autoAttack`
    is a de facto player-only flag, even though its type and doc comment describe a
    kind-agnostic concept. This matters because the primary use case (healer watching
    the tank's target) is a MOB target, so gating on `autoAttack` as it stands today
    would never show anything for the single most valuable case.

## Design

### 1. Sim: make `Entity.autoAttack` genuinely kind-agnostic

Extend `src/sim/mob/combat_profile.ts` so a mob's `autoAttack` flag tracks the same
concept the player side already enforces in `src/sim/combat/auto_attack.ts`
(`p.autoAttack = false` on death, on losing a target, while casting):

- Set `mob.autoAttack = true` on every tick the mob is actively running its melee
  attack loop: inside/alongside the call sites of `tryMobMeleeSwingInRange`
  (`updatePursuitProfileCombat`, and the chase-fallback arm of `updateCasterCombat`).
- Set `mob.autoAttack = false` wherever the mob is NOT attempting to melee that tick:
  the caster's attack-in-spell-range branch of `updateCasterCombat` (casting, not
  swinging), `startEvadeHome` (leashing home), the no-target arm reached via
  `retargetMob`, and on death.
- Verify whether pets share this same `combat_profile.ts` melee path or a separate
  pet-specific loop; if separate, apply the identical contract there.
- This is additive bookkeeping, not a combat-resolution change: it does not touch
  RNG draw order, damage, or hit tables, so it should not perturb any existing sim
  test's numeric assertions, but IS a `src/sim/` behavior change and needs a
  dedicated test (mob autoAttack true while pursuing/attacking, false while
  evading/casting/dead) and an `architecture-reviewer` pass.

### 2. Wire: one new conditional field on the general entity encoder

In `dynamicFields()` (`server/game.ts`), alongside the existing `castingAbility`
conditional block:

```
if (e.autoAttack) out.swing = round2(e.swingTimer);
```

No weapon-speed field is sent. `computeSwingState()`'s existing first-frame guess
(`Math.max(swingTimer, weaponSpeed)`) degrades gracefully to `swingTimer` itself when
weapon speed is unavailable (equivalent to passing `weaponSpeed = 0`): the bar's fill
on the very first frame a target is acquired mid-swing may under-represent progress by
one swing's worth, self-correcting at the next observed swing-reset edge (a few seconds
at most). This is a deliberate cost/accuracy trade-off: it avoids adding a second field
that would ride, unguarded, on every broadcast tick for every visible auto-attacking
entity to every viewer in interest range. Flagged explicitly for `server-hot-path-reviewer`
along with the `autoAttack`-gated omission itself (the existing style for `castingAbility`,
so idle/non-combat entities cost nothing extra).

Client-side, `src/net/online.ts`'s general per-entity decode block (the one that already
sets `e.castingAbility = w.cast ?? null;`, `e.aggroTargetId = w.aggro ?? null;`, etc.) gets
two more direct assignments, matching that block's existing one-line-per-field style:

```
e.autoAttack = w.swing !== undefined;
e.swingTimer = w.swing ?? 0;
```

This runs for every entity including self; the existing self-decode
(`e.autoAttack = !!s.auto; e.swingTimer = s.swing ?? e.swingTimer;`, further down in
the same method) already overwrites both fields for the local player from the richer
self-only record, unchanged by this design.

### 3. Pure core: `targetSwingTimerState()` in `src/ui/swing_timer.ts`

Same file, not a new one (family reuse: this is a third use of the exact fill/ready/
edge-tracking math `computeSwingState()` already holds, alongside main-hand and
off-hand). New exported function:

```
targetSwingTimerState(target: TargetSwingInput | null, prevPeriod, prevTimer): SwingTimerState
```

Hidden when `target` is null, dead, `kind === 'object'`, or `!target.autoAttack`.
Otherwise defers to the existing `computeSwingState(target.swingTimer, 0, prevPeriod, prevTimer)`
(weapon speed argument `0`, per the wire trade-off above). Used identically for both
the target bar and the target-of-target bar (two independent instances, two independent
edge-tracking scalar pairs), exactly as `SwingTimerBars` already runs `swingTimerState`
twice with independent state for main-hand and off-hand.

### 4. HUD wiring: new sibling module `src/ui/target_swing_timer_bars.ts`

Mirrors `src/ui/swing_timer_bars.ts`'s shape: caches the `#swingbar-target` /
`#swingbar-tot` DOM refs once, owns two independent edge-tracking scalar pairs, and
drives two `SwingTimerPainter` instances (the same class, fourth and fifth use of
the family). Critically, this module resolves the target-of-target ENTITY itself
(`targetOfTargetId(target)` + an entities-map lookup passed in), independent of the
existing `showTargetOfTarget` mini-frame toggle (decision 7 above) so `hud.ts` does
not need to duplicate or share that resolution with the existing tot mini-frame code.

Its `update()` takes the resolved `target: Entity | null`, an entities-lookup (the
same `sim.entities.get`-shaped access the mini-frame code already uses), and the new
`showTargetSwingTimer` boolean, and does everything else internally. This keeps the
`hud.ts` call site to one line:

```
this.targetSwingTimerBars.update(target ?? null, sim, this.showTargetSwingTimer);
```

placed next to the existing `this.swingTimerBars.update(p, target ?? null);` call.

### 5. Settings

New boolean setting `showTargetSwingTimer`, default `false`, wired the same way as
the existing `showTargetOfTarget` toggle: a `boolToggle(s, 'showTargetSwingTimer',
'hudChrome.options.showTargetSwingTimer')` entry in `src/ui/options_view.ts` (next to
`showTargetOfTarget` / `showPetFrame`), a defaults-object entry, `main.ts`'s
`applySetting` plumbing it into a cached `hud.ts` field, read at paint time.

### 6. i18n

One new English-only key, `hudChrome.options.showTargetSwingTimer`, for the toggle's
label. The bars themselves emit no new label text: they reuse the existing
`hudChrome.swing.ready` / `hudChrome.swing.seconds` keys already resolved by
`SwingTimerPainter`, distinguished by position and color, exactly the precedent
PR #3648 set for the off-hand bar.

### 7. DOM / CSS

Two new bar elements (`#swingbar-target`, `#swingbar-tot`) in `index.html` and
`play.html`, positioned under the target frame markup (near `#tf-castbar`), with new
rules in `hud.css` + `hud.mobile.css` covering every tier/breakpoint `#swingbar`
already covers. Each bar gets its own fill color, distinct from the player's amber
main-hand and teal off-hand bars, so a viewer can tell all four bars apart at a
glance when they are all visible at once (dual-wielding player fighting a
melee-swinging target with a visible target-of-target).

### Monolith ratchet

`src/ui/hud.ts`, `server/game.ts`, and `src/net/online.ts` are all pinned at their
exact current line count (zero headroom) by `tests/monolith_budget.test.ts`. This
repo's own ratchet history on all three files shows small, explicitly justified
ceiling raises are the normal, accepted way to land unavoidable thin-consumer wiring
to a properly extracted module (see the many "Raised +N for ..., thin-consumer wiring
..., no clean branch-owned extraction exists" entries already in that file) as long as
the real logic lives in a sibling module and the coordinator only gains the minimum
call-site lines. Concretely:

- `hud.ts`: +1 line (the single call above); the `target_swing_timer_bars.ts` module
  in point 4 above owns the actual logic, matching the exact pattern PR #3648 itself
  used for the off-hand bar.
- `server/game.ts`: +1 line (the `dynamicFields()` conditional), following that
  function's own existing style (inline conditionals, one per gated field group).
- `src/net/online.ts`: +2 lines (the general-decode assignments), following that
  block's own existing style (direct inline assignment per field, no per-field
  helper).

Each ceiling bump must carry the same kind of justifying comment the existing entries
use, and must be the EXACT new line count, never a rounded-up buffer.

### Testing

- **Sim**: a new or extended test in the mob-combat test area asserting
  `mob.autoAttack` is true while pursuing/attacking in melee and false while
  evading, casting from range, or dead.
- **Wire**: extend the existing wire test coverage (alongside
  `tests/combat_scalar_wire.test.ts` / `tests/snapshots.test.ts`) to prove
  `dynamicFields()` includes `swing` for a non-self, auto-attacking MOB entity
  (not just a player), and omits it when not auto-attacking.
- **Client decode**: extend the online-client wire-application test coverage to
  prove a non-self entity's `autoAttack`/`swingTimer` mirror correctly from `w.swing`
  (present and absent cases), and that the self entity is unaffected (still driven by
  `s.auto`/`s.swing`).
- **Pure core**: extend `tests/swing_timer.test.ts` with `targetSwingTimerState()`
  cases: hidden on null/dead/object/non-attacking target; visible with correct
  fill/ready on an attacking one; edge-tracking behaves like the existing main-hand
  cases.
- **HUD**: extend the HUD test coverage for the new module's visibility gating
  (toggle off hides both bars regardless of target state; toggle on shows the target
  bar only while it is auto-attacking; the target-of-target bar resolves and shows
  independent of the `showTargetOfTarget` setting).
- **i18n**: the new toggle key passes the existing completeness/localization-fixes
  checks (English-only per contributor policy).
- **Monolith budget**: update the three ceilings to the exact new counts, per the
  ratchet section above.
- **Parity**: confirm `tests/world_api_parity.test.ts` has no pin that assumes
  `autoAttack` is player-only; no new `IWorld` facet member is expected.

### Explicitly out of scope

- Off-hand bars for the target or target-of-target.
- Any new `IWorld` facet member (existing entity-resolution access is reused as-is).
- Sending weapon speed for non-self entities on the wire.
- Touching PR #3648's existing off-hand-only scope beyond adding these further
  commits to the same branch.

### Delivery

Once this lands as commits on `feature/offhand-swing-timer-indicator` and is pushed,
reply as a new comment on PR #3648 to the commenter confirming the target and
target-of-target swing-timer bars have been added, toggleable via the new Interface
option, default off.
