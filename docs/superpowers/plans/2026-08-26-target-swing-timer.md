# Target / Target-of-Target Swing-Timer Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current target's (and target-of-target's) own melee/ranged
swing timer in the HUD, toggleable and off by default, landing as further
commits on PR #3648.

**Architecture:** Extend the general (non-self) entity wire encoder with one
new auto-attack-gated `swing` field; make `Entity.autoAttack` genuinely
kind-agnostic so mobs populate it (today only players do); reuse the existing
`computeSwingState`/`SwingTimerPainter` pure-core-plus-thin-painter family for
two new bars (`#swingbar-target`, `#swingbar-tot`) driven by a new sibling HUD
module; wire a new `showTargetSwingTimer` toggle through the existing
settings/i18n/options pipeline end to end.

**Tech Stack:** TypeScript (ESM, strict), `ws` WebSocket wire protocol,
Vitest, Vite/esbuild, plain DOM (no framework) for the HUD.

**Spec:** `docs/superpowers/specs/2026-08-26-target-swing-timer-design.md`

## Global Constraints

- No em dashes, en dashes, or emojis anywhere (code, comments, commits).
- `src/sim/` has zero DOM/browser/Three.js imports; all sim randomness goes
  through `Rng`, never `Math.random`/`Date.now`/`performance.now`.
- Every player-visible string is a `t()` key; contributors add ENGLISH ONLY to
  `src/ui/i18n.catalog/*`, never hand-edit `src/ui/i18n.resolved.generated/*`
  or `src/ui/i18n.catalog/translation_keys.generated.ts` (regenerate with
  `npm run i18n:gen`).
- `src/ui/hud.ts`, `server/game.ts`, `src/net/online.ts`, and `src/main.ts` are
  ALL pinned at their exact current line count by `tests/monolith_budget.test.ts`
  (zero headroom). Any net-positive change to one of these files requires
  updating its `ceiling` value to the file's EXACT new line count (measured
  with `wc -l`, never guessed or padded) in the same commit, with a comment
  explaining why (thin-consumer wiring to an extracted module, no clean
  branch-owned extraction exists), matching every other entry already in that
  file's history.
- Biome formatting: 2-space indent, single quotes, trailing commas, lineWidth
  100. Format only files you changed: `npx @biomejs/biome check --write <file>`.
- Commits: Conventional Commits with a scope, body required (1-4 sentences on
  what and why), wrapped near 72 columns.
- Base branch for all work: `feature/offhand-swing-timer-indicator` (PR #3648),
  worktree at `/home/jegoh/Documents/repo/worktrees/feature-offhand-swing-timer`.
  Every `git`/`npm`/`npx` command below runs from that directory.

---

## File Map

| File | Change |
|---|---|
| `src/sim/mob/combat_profile.ts` | Modify: make `Entity.autoAttack` track genuine melee engagement for mobs |
| `tests/mob_combat.test.ts` | Modify: new tests for the `autoAttack` contract |
| `server/game.ts` | Modify: `dynamicFields()` gains one conditional `swing` field |
| `tests/monolith_budget.test.ts` | Modify: ceiling bumps for `server/game.ts`, `src/net/online.ts`, `src/ui/hud.ts`, `src/main.ts` |
| `tests/snapshots.test.ts` | Modify: new wire round-trip tests for `swing` on a non-self mob |
| `src/net/online.ts` | Modify: general per-entity decode gains `autoAttack`/`swingTimer` from `w.swing` |
| `src/ui/swing_timer.ts` | Modify: new `targetSwingTimerState()` + `TargetSwingInput` |
| `tests/swing_timer.test.ts` | Modify: new tests for `targetSwingTimerState()` |
| `src/ui/target_swing_timer_bars.ts` | Create: HUD-wiring sibling module for the two new bars |
| `tests/target_swing_timer_bars.test.ts` | Create: DOM-level tests for the new module |
| `src/ui/hud.ts` | Modify: one call site + cached toggle field/setter |
| `src/game/settings.ts` | Modify: new `showTargetSwingTimer: { def: false }` |
| `src/main.ts` | Modify: `applySetting` dispatch case |
| `src/ui/options_view.ts` | Modify: new `boolToggle(...)` entry |
| `tests/options_view.test.ts` | Modify: `FRAMES_KEYS` pinned-order list |
| `src/ui/i18n.catalog/hud_chrome.ts` | Modify: new `options.showTargetSwingTimer` key |
| `index.html`, `play.html` | Modify: two new bar elements under the target frame |
| `src/styles/hud.css` | Modify: CSS for the two new bars |

---

### Task 1: Sim - make `Entity.autoAttack` track genuine mob melee engagement

**Files:**
- Modify: `src/sim/mob/combat_profile.ts:32-47` (`startEvadeHome`), `:59-68`
  (`tryMobMeleeSwingInRange`), `:78-121` (`updateMobCombatProfile`'s no-target
  arm), `:138-142` (dragonkin shout-intro branch), `:202` (`updateHealerHold`)
- Test: `tests/mob_combat.test.ts`

**Interfaces:**
- Consumes: nothing new (uses the existing `Entity.autoAttack: boolean` field
  from `src/sim/types.ts`, already read by `src/ui/swing_timer.ts`'s
  `swingTimerState`/gate).
- Produces: `Entity.autoAttack` is now `true` for a mob exactly while it is
  within melee range of a live target and not casting/evading/healer-holding,
  `false` otherwise. Task 2 and Task 4 read this.

- [ ] **Step 1: Write the failing tests**

Add to `tests/mob_combat.test.ts` (the file already imports `createMob`,
`tryMobMeleeSwingInRange`, `Sim`, `MELEE_RANGE` from `../src/sim/types`; add
`LEASH_DISTANCE` and `updateMobCombatProfile` to the existing imports):

```typescript
import {
  tryMobMeleeSwingInRange,
  updateMobCombatProfile,
} from '../src/sim/mob/combat_profile';
// ... existing imports stay, add LEASH_DISTANCE to the existing types import:
import { LEASH_DISTANCE, MELEE_RANGE } from '../src/sim/types';
```

```typescript
describe('mob Entity.autoAttack tracks genuine melee engagement', () => {
  it('is true only while genuinely within melee range, clearing when out of range', () => {
    const sim = new Sim({ seed: 7791, playerClass: 'warrior' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };
    player.prevPos = { x: -1, y: 0, z: 0 };

    const mob = createMob(9010, MOBS.forest_wolf, 5, { x: 100, y: 0, z: 0 });
    mob.weapon = { min: 50, max: 50, speed: 2 };
    mob.swingTimer = 1;
    mob.prevPos = { ...mob.pos };
    mob.autoAttack = true; // stale true from a previous in-range tick

    expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(false);
    expect(mob.autoAttack).toBe(false);

    mob.pos = { x: 5.5, y: 0, z: 0 };
    mob.prevPos = { x: 7.5, y: 0, z: 0 }; // moved, so effective range is MELEE_RANGE + scale
    expect(tryMobMeleeSwingInRange(sim.ctx, mob, player)).toBe(true);
    expect(mob.autoAttack).toBe(true);
  });

  it('clears autoAttack when a leashed mob evades home, even mid-melee', () => {
    const sim = new Sim({ seed: 7792, playerClass: 'warrior' });
    const player = sim.entities.get(sim.playerId);
    if (!player) throw new Error('expected default player');
    player.pos = { x: 0, y: 0, z: 0 };
    player.hp = player.maxHp;

    const mob = createMob(9011, MOBS.forest_wolf, 5, { x: 0, y: 0, z: 0 });
    mob.spawnPos = { x: 0, y: 0, z: 0 };
    mob.hp = mob.maxHp;
    mob.aggroTargetId = player.id;
    mob.autoAttack = true; // was mid-melee the tick before the leash triggered
    // Yank the mob far outside its leash radius without touching spawnPos: the
    // leash check runs and returns BEFORE tryMobMeleeSwingInRange this tick, so
    // that function alone cannot clear a stale true here.
    mob.pos = { x: LEASH_DISTANCE + 50, y: 0, z: 0 };

    updateMobCombatProfile(sim.ctx, mob);

    expect(mob.aiState).toBe('evade');
    expect(mob.autoAttack).toBe(false);
  });

  it('clears autoAttack when a mob loses its target', () => {
    const sim = new Sim({ seed: 7793, playerClass: 'warrior' });
    const mob = createMob(9012, MOBS.forest_wolf, 5, { x: 0, y: 0, z: 0 });
    mob.aggroTargetId = null;
    mob.autoAttack = true;

    updateMobCombatProfile(sim.ctx, mob);

    expect(mob.autoAttack).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mob_combat.test.ts -t "Entity.autoAttack"`
Expected: FAIL. The first test fails because `tryMobMeleeSwingInRange` never
touches `autoAttack` today (both expectations on `mob.autoAttack` fail). The
second and third fail because `startEvadeHome` and the no-target arm never set
it either.

- [ ] **Step 3: Implement the minimal sim change**

In `src/sim/mob/combat_profile.ts`, edit `tryMobMeleeSwingInRange` (currently
lines 59-68):

```typescript
export function tryMobMeleeSwingInRange(ctx: SimContext, mob: Entity, target: Entity): boolean {
  if (dist2d(mob.pos, target.pos) > mobEffectiveMeleeRange(mob)) {
    mob.autoAttack = false;
    return false;
  }
  mob.aiState = 'attack';
  mob.autoAttack = true;
  mob.facing = steadyAngleTo(mob.pos, target.pos, mob.facing);
  if (mob.swingTimer <= 0) {
    ctx.mobSwing(mob, target);
    mob.swingTimer = mob.weapon.speed * ctx.swingIntervalMult(mob);
  }
  return true;
}
```

Edit `startEvadeHome` (currently lines 32-47) to add one line right after
`mob.aggroTargetId = null;`:

```typescript
function startEvadeHome(mob: Entity): void {
  mob.aiState = 'evade';
  mob.aggroTargetId = null;
  mob.autoAttack = false; // leashing home: not swinging, whatever it was doing before
  clearThreat(mob);
  mob.leashAnchor = null;
  clearChainPullInbound(mob);
  resetRiftMechanicWindups(mob);
  mob.castingAbility = null;
  mob.castTotal = 0;
  mob.castRemaining = 0;
  mob.castTargetId = null;
  mob.channeling = false;
  mob.rangedWindupReleaseTick = null;
}
```

Edit `updateMobCombatProfile`'s no-target arm (currently lines 85-89):

```typescript
  const target = mob.aggroTargetId !== null ? ctx.entities.get(mob.aggroTargetId) : null;
  if (!target || target.dead) {
    mob.autoAttack = false;
    retargetMob(ctx, mob);
    return 'done';
  }
```

Edit the dragonkin shout-intro branch (currently lines 138-142):

```typescript
    if (mob.shoutIntroUntil !== undefined && ctx.time < mob.shoutIntroUntil) {
      mob.facing = steadyAngleTo(mob.pos, target.pos, mob.facing);
      mob.aiState = 'attack';
      mob.autoAttack = false; // standing through the shout window, not swinging yet
      return 'done';
    }
```

Edit `updateHealerHold` right after its `if (!protectee) return null;` guard
(currently line 202), before the standoff branching:

```typescript
  if (!protectee) return null; // nobody to heal: fall back to melee AI
  mob.autoAttack = false; // healing/standing off, never melee, in every branch below
  mob.facing = Math.atan2(protectee.pos.x - mob.pos.x, protectee.pos.z - mob.pos.z);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/mob_combat.test.ts`
Expected: PASS (all tests in the file, not just the new ones).

- [ ] **Step 5: Run the broader sim regression check**

Run: `npx vitest run tests/mob_combat.test.ts tests/rift_boss_reactable_mechanics.test.ts tests/wildheart_normal_tuning.test.ts tests/delves.test.ts tests/mob_melee_walk_past.test.ts tests/architecture.test.ts`
Expected: PASS. These exercise the other call sites touched (dragonkin shout,
healer hold, leashing) without asserting `autoAttack` directly; a regression
here would mean the new lines broke an untouched behavior, not the flag itself.

- [ ] **Step 5b: Confirm the IWorld parity pin has no player-only assumption**

Run: `grep -n "autoAttack" tests/world_api_parity.test.ts`

Expected: either no match, or a match that pins `autoAttack` as a plain
`boolean` member with no comment/logic implying it is player-only. This is a
design-review confirmation, not a new test: `Entity.autoAttack` already
exists on both `Sim` and `ClientWorld`, so this task changes WHEN mobs
populate an existing field, not the `IWorld` surface itself, and no pin
update is expected. If the grep finds a comment asserting player-only
semantics, stop and flag it before continuing, since that would mean this
task's premise (mobs already read as `Entity.autoAttack`-compatible) is
wrong somewhere this plan did not anticipate.

- [ ] **Step 6: Format and commit**

```bash
npx @biomejs/biome check --write src/sim/mob/combat_profile.ts tests/mob_combat.test.ts
git add src/sim/mob/combat_profile.ts tests/mob_combat.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): make Entity.autoAttack track genuine mob melee engagement

Entity.autoAttack was a de facto player-only flag: mobs swing purely
off swingTimer and range without ever touching it. This extends the
same contract the player side already enforces (true while actively
melee-engaged, false while evading, casting, healer-holding, or
without a target) so a mob target's own auto-attack state becomes
readable, needed for the upcoming target swing-timer bar.
EOF
)"
```

---

### Task 2: Server wire - `dynamicFields()` gains the general `swing` field

**Files:**
- Modify: `server/game.ts:1429-1435` (`dynamicFields`, the `castingAbility`
  conditional block)
- Modify: `tests/monolith_budget.test.ts` (the `server/game.ts` ceiling entry)
- Modify: `tests/snapshots.test.ts` (new wire round-trip test)

**Interfaces:**
- Consumes: `Entity.autoAttack` (Task 1), `Entity.swingTimer` (existing),
  `round2` (already imported in `server/game.ts`).
- Produces: `wireEntity(e)` now includes `swing: <number>` for ANY entity
  (self or not) whenever `e.autoAttack` is true, absent otherwise. Task 3
  consumes this key as `w.swing`.

- [ ] **Step 1: Write the failing test**

Add to `tests/snapshots.test.ts`, right after the existing `describe('pet
signature skill over the wire', ...)` block (it already imports `createMob`,
`MOBS`, `wireEntity`, `bareClient` at the top of the file):

```typescript
describe('target swing timer over the wire', () => {
  it('mirrors a non-self mob auto-attacking, gated on autoAttack', () => {
    const mob = createMob(9310, MOBS.forest_wolf, 5, { x: 0, y: 0, z: 0 });
    mob.autoAttack = true;
    mob.swingTimer = 1.42;

    const wire = wireEntity(mob);
    expect(wire.swing).toBe(1.42);

    const client = bareClient(42);
    (client as any).applySnapshot({ t: 'snap', ents: [wire] });
    const mirrored = client.entities.get(mob.id)!;
    expect(mirrored.autoAttack).toBe(true);
    expect(mirrored.swingTimer).toBe(1.42);
  });

  it('omits swing and resets a stale mirror when the mob is not auto-attacking', () => {
    const mob = createMob(9311, MOBS.forest_wolf, 5, { x: 0, y: 0, z: 0 });
    mob.autoAttack = false;
    mob.swingTimer = 0.5; // stale/frozen value while disengaged; must not ride the wire

    const idleWire = wireEntity(mob);
    expect(idleWire).not.toHaveProperty('swing');

    const client = bareClient(42);
    (client as any).applySnapshot({
      t: 'snap',
      ents: [{ ...idleWire, id: mob.id, k: 'mob', tid: mob.templateId, nm: mob.name, lv: mob.level, swing: 1.1 }],
    });
    (client as any).applySnapshot({ t: 'snap', ents: [idleWire] });
    const mirrored = client.entities.get(mob.id)!;
    expect(mirrored.autoAttack).toBe(false);
    expect(mirrored.swingTimer).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/snapshots.test.ts -t "target swing timer over the wire"`
Expected: FAIL on `expect(wire.swing).toBe(1.42)` (undefined today).

- [ ] **Step 3: Implement the wire field**

In `server/game.ts`, edit the `castingAbility` conditional block inside
`dynamicFields()` (currently lines 1429-1435) by adding one new conditional
immediately after it:

```typescript
  if (e.castingAbility) {
    out.cast = e.castingAbility;
    out.castRem = round2(e.castRemaining);
    out.castTot = round2(e.castTotal);
    if (e.castTargetId !== null) out.castTgt = e.castTargetId;
    if (e.channeling) out.chan = 1;
  }
  // Target/target-of-target swing-timer bar: the general (non-self) mirror of
  // the self-only `swing` field above selfWireJson, gated on autoAttack so an
  // idle entity costs nothing extra on the broadcast (same style as the
  // castingAbility gate above it). No weapon-speed field rides with it: the
  // client's targetSwingTimerState degrades gracefully to the raw swingTimer
  // as its first-frame period guess, self-correcting at the next swing-reset
  // edge, trading one swing's worth of first-frame fill accuracy for not
  // adding a second field to every broadcast tick for every auto-attacking
  // entity in interest range.
  if (e.autoAttack) out.swing = round2(e.swingTimer);
```

- [ ] **Step 4: Measure and update the monolith ceiling**

Run: `wc -l server/game.ts`

Take the printed number and update `tests/monolith_budget.test.ts`'s
`server/game.ts` entry (currently `ceiling: 10645`) to that exact number, and
extend its comment:

```typescript
    // Raised to the exact new count for the target-swing-timer wire field: one
    // conditional line in dynamicFields (`if (e.autoAttack) out.swing = ...`),
    // the general non-self mirror of the existing self-only swing field.
    // Thin, unavoidable wiring; no clean branch-owned extraction exists for a
    // single conditional line inside an already-inline-conditional function.
    ceiling: <exact number from wc -l>,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/snapshots.test.ts tests/monolith_budget.test.ts`
Expected: PASS.

- [ ] **Step 6: Format and commit**

```bash
npx @biomejs/biome check --write server/game.ts tests/snapshots.test.ts tests/monolith_budget.test.ts
git add server/game.ts tests/snapshots.test.ts tests/monolith_budget.test.ts
git commit -m "$(cat <<'EOF'
feat(server): mirror auto-attack swing timer for non-self entities

dynamicFields() (the general per-entity wire encoder used for every
viewer, not just self) never carried swing/weapon data, so a target's
own swing timer was invisible online. Adds one autoAttack-gated `swing`
field, the general mirror of the existing self-only field, needed for
the upcoming target swing-timer bar.
EOF
)"
```

---

### Task 3: Client wire - decode `swing` for every entity in `online.ts`

**Files:**
- Modify: `src/net/online.ts` (the general per-entity decode block, near the
  existing `e.castingAbility = w.cast ?? null;` line)
- Modify: `tests/monolith_budget.test.ts` (the `src/net/online.ts` ceiling)

**Interfaces:**
- Consumes: `w.swing` (Task 2's wire key).
- Produces: for every mirrored `Entity` (self included, self overwritten
  afterward by the unchanged self-decode), `e.autoAttack = w.swing !==
  undefined` and `e.swingTimer = w.swing ?? 0`. Task 4/5 (via `IWorld`) read
  these on the target/target-of-target entity.

The wire-level round-trip test for this already exists from Task 2 (`tests/
snapshots.test.ts`'s two new cases exercise `applySnapshot` -> `client.entities
.get()`, which IS this decode path). This task has no separate new test; it
makes Task 2's second test assertion pass.

- [ ] **Step 1: Confirm Task 2's client-side assertions currently fail for the right reason**

Run: `npx vitest run tests/snapshots.test.ts -t "target swing timer over the wire"`
Expected: the first case's server-side assertion (`wire.swing`) now passes
(Task 2 done), but `mirrored.autoAttack`/`mirrored.swingTimer` still fail
(both undefined/unset), since nothing decodes `w.swing` client-side yet.

- [ ] **Step 2: Implement the client decode**

In `src/net/online.ts`, find the general per-entity decode block (the
sequence of direct assignments that includes `e.castingAbility = w.cast ??
null;`, `e.aggroTargetId = w.aggro ?? null;`) and add two lines immediately
after the existing `e.castingAbility`/`e.castRemaining`/`e.castTotal`/
`e.castTargetId`/`e.channeling` group:

```typescript
      e.channeling = !!w.chan;
      // General (non-self) auto-attack/swing mirror: absent w.swing means not
      // auto-attacking, matching dynamicFields' autoAttack-gated omission.
      // Overwritten below for the self entity by the richer self-only fields.
      e.autoAttack = w.swing !== undefined;
      e.swingTimer = typeof w.swing === 'number' ? w.swing : 0;
```

- [ ] **Step 3: Measure and update the monolith ceiling**

Run: `wc -l src/net/online.ts`

Update `tests/monolith_budget.test.ts`'s `src/net/online.ts` entry (currently
`ceiling: 5835`) to the exact new number:

```typescript
    // Raised to the exact new count for the target-swing-timer client decode:
    // two lines mirroring w.swing into autoAttack/swingTimer for every entity,
    // the general (non-self) counterpart to the self-only decode further down
    // this method. Thin, unavoidable wiring in an already flat per-field decode
    // block; no clean branch-owned extraction exists for two field assignments.
    ceiling: <exact number from wc -l>,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/snapshots.test.ts tests/monolith_budget.test.ts`
Expected: PASS, including both new Task 2 cases now end to end.

- [ ] **Step 5: Format and commit**

```bash
npx @biomejs/biome check --write src/net/online.ts tests/monolith_budget.test.ts
git add src/net/online.ts tests/monolith_budget.test.ts
git commit -m "$(cat <<'EOF'
feat(net): decode the general auto-attack swing mirror client-side

Completes the non-self swing wire added to dynamicFields: the general
per-entity decode now sets autoAttack/swingTimer from w.swing for every
mirrored entity, self included (the self-only decode further down
still overwrites self authoritatively, unchanged). Needed so a target
or target-of-target's own swing timer is readable online, not just
offline.
EOF
)"
```

---

### Task 4: Pure core - `targetSwingTimerState()` in `swing_timer.ts`

**Files:**
- Modify: `src/ui/swing_timer.ts`
- Test: `tests/swing_timer.test.ts`

**Interfaces:**
- Consumes: the private `computeSwingState` already in this file (unexported,
  reused in place, not duplicated).
- Produces:
  ```typescript
  export interface TargetSwingInput {
    dead: boolean;
    kind: string;
    autoAttack: boolean;
    swingTimer: number;
  }
  export function targetSwingTimerState(
    target: TargetSwingInput | null,
    prevPeriod: number,
    prevTimer: number,
  ): SwingTimerState
  ```
  Task 5 calls this twice per frame (once for the target, once for the
  target-of-target), each with its own independent `prevPeriod`/`prevTimer`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/swing_timer.test.ts` (extend the existing import list with
`targetSwingTimerState` and `type TargetSwingInput`):

```typescript
import {
  type OffhandSwingPlayerInput,
  offhandSwingTimerState,
  type SwingPlayerInput,
  type SwingTargetInput,
  swingTimerState,
  targetSwingTimerState,
  type TargetSwingInput,
} from '../src/ui/swing_timer';
```

```typescript
function target(over: Partial<TargetSwingInput> = {}): TargetSwingInput {
  return { dead: false, kind: 'mob', autoAttack: true, swingTimer: 1, ...over };
}

describe('targetSwingTimerState: visibility gating', () => {
  it('is hidden when there is no target', () => {
    expect(targetSwingTimerState(null, 1, 1).visible).toBe(false);
  });

  it('is hidden when the target is dead, an object, or not auto-attacking', () => {
    expect(targetSwingTimerState(target({ dead: true }), 1, 1).visible).toBe(false);
    expect(targetSwingTimerState(target({ kind: 'object' }), 1, 1).visible).toBe(false);
    expect(targetSwingTimerState(target({ autoAttack: false }), 1, 1).visible).toBe(false);
  });

  it('is visible against a live, auto-attacking mob/npc/player target', () => {
    expect(targetSwingTimerState(target({ kind: 'mob' }), 0, 0).visible).toBe(true);
    expect(targetSwingTimerState(target({ kind: 'npc' }), 0, 0).visible).toBe(true);
    expect(targetSwingTimerState(target({ kind: 'player' }), 0, 0).visible).toBe(true);
  });
});

describe('targetSwingTimerState: no weapon-speed hint, degrades to the raw timer on first show', () => {
  it('uses swingTimer itself as the first-frame period guess (no weapon speed sent over the wire)', () => {
    // No weapon speed available for a non-self entity (see server/game.ts's
    // dynamicFields comment); period = max(swingTimer, 0) = swingTimer.
    const s = targetSwingTimerState(target({ swingTimer: 1.6 }), 0, 0);
    expect(s.nextPeriod).toBe(1.6);
    expect(s.frac).toBe(0);
  });

  it('self-corrects at the next swing-reset edge like the player bars do', () => {
    // prevTimer 0.1, now swingTimer 2.0 jumped up: a fresh swing, so period is
    // recovered accurately from the reset edge exactly like swingTimerState.
    const s = targetSwingTimerState(target({ swingTimer: 2.0 }), 1.6, 0.1);
    expect(s.nextPeriod).toBe(2.0);
    expect(s.frac).toBe(0);
  });

  it('carries the recovered period so the fill grows smoothly as the timer drops', () => {
    const s = targetSwingTimerState(target({ swingTimer: 1 }), 2, 2);
    expect(s.nextPeriod).toBe(2);
    expect(s.frac).toBe(0.5);
  });
});

describe('targetSwingTimerState: the ready vs seconds label discriminator', () => {
  it('reports ready with a full bar once swingTimer hits 0', () => {
    const s = targetSwingTimerState(target({ swingTimer: 0 }), 2, 0.5);
    expect(s.ready).toBe(true);
    expect(s.labelKind).toBe('ready');
    expect(s.frac).toBe(1);
  });
});

describe('targetSwingTimerState: determinism', () => {
  it('is deterministic: identical inputs produce a deep-equal result', () => {
    const a = targetSwingTimerState(target({ swingTimer: 1.3 }), 2, 1.5);
    const b = targetSwingTimerState(target({ swingTimer: 1.3 }), 2, 1.5);
    expect(a).toEqual(b);
  });

  it('the target and target-of-target cores run independently off separate edge-tracking state', () => {
    const t1 = targetSwingTimerState(target({ swingTimer: 1 }), 2, 2);
    const tot = targetSwingTimerState(target({ swingTimer: 0.2 }), 1.8, 1.8);
    expect(t1.frac).toBe(0.5);
    expect(tot.frac).toBeCloseTo(1 - 0.2 / 1.8, 5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/swing_timer.test.ts -t "targetSwingTimerState"`
Expected: FAIL with "targetSwingTimerState is not a function" (or a TS import
error, since the export does not exist yet).

- [ ] **Step 3: Implement `targetSwingTimerState`**

In `src/ui/swing_timer.ts`, add after `OffhandSwingPlayerInput` (after line 54)
and after `offhandSwingTimerState` (after line 137, end of file):

```typescript
/** The target/target-of-target fields the new bars read. A structural subset
 *  of Entity that both the offline Sim and the online ClientWorld mirror
 *  expose (the mirror is populated by src/net/online.ts's general per-entity
 *  decode of the server's dynamicFields `swing` key, not the self-only path). */
export interface TargetSwingInput {
  dead: boolean;
  kind: string; // entity kind; only 'object' (doors/crates) suppresses the bar
  autoAttack: boolean;
  swingTimer: number; // seconds remaining; counts down to 0 (= ready)
}

export function targetSwingTimerState(
  target: TargetSwingInput | null,
  prevPeriod: number,
  prevTimer: number,
): SwingTimerState {
  if (!target || target.dead || target.kind === 'object' || !target.autoAttack) return HIDDEN;
  // No weapon-speed hint rides the wire for a non-self entity (see
  // server/game.ts dynamicFields): pass 0, so computeSwingState's first-frame
  // guess degrades to swingTimer itself, self-correcting at the next reset edge.
  return computeSwingState(target.swingTimer, 0, prevPeriod, prevTimer);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/swing_timer.test.ts`
Expected: PASS (the whole file, including the pre-existing main-hand/off-hand
suites and the i18n-free guard at the end, which will also scan the new code
and must still find no `t()`/`formatNumber` calls).

- [ ] **Step 5: Format and commit**

```bash
npx @biomejs/biome check --write src/ui/swing_timer.ts tests/swing_timer.test.ts
git add src/ui/swing_timer.ts tests/swing_timer.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add targetSwingTimerState, the third use of the swing core

Reuses the existing computeSwingState edge-tracking math (already
shared by the main-hand and off-hand player bars) for a target/target-
of-target entity's own swingTimer/autoAttack instead of the player's.
No weapon-speed hint is available for a non-self entity over the wire,
so the first-frame period guess degrades to the raw timer, self-
correcting at the next swing-reset edge like the existing bars already
do for an unknown interval.
EOF
)"
```

---

### Task 5: HUD wiring - new `target_swing_timer_bars.ts` module

**Files:**
- Create: `src/ui/target_swing_timer_bars.ts`
- Test: `tests/target_swing_timer_bars.test.ts`

**Interfaces:**
- Consumes: `targetSwingTimerState`, `type TargetSwingInput` (Task 4),
  `SwingTimerPainter` (`src/ui/swing_timer_painter.ts`, unmodified),
  `targetOfTargetId` (`src/ui/target_of_target.ts`, unmodified),
  `type PainterHostWriters` (`src/ui/painter_host.ts`).
- Produces:
  ```typescript
  export interface TargetSwingEntities {
    get(id: number): TargetSwingInput | undefined;
  }
  export class TargetSwingTimerBars {
    constructor(writers: PainterHostWriters);
    update(target: TargetSwingInput | null, entities: TargetSwingEntities, enabled: boolean): void;
  }
  ```
  Task 6 constructs one instance on `hud.ts` and calls `update()` once per
  frame. `target` and `entities` both come from `hud.ts`'s existing `target`
  local and `sim.entities` (a `Map<number, Entity>`, which structurally
  satisfies `TargetSwingEntities` since `Entity` satisfies `TargetSwingInput`
  and `Map.get` returns `V | undefined`).

- [ ] **Step 1: Write the failing test**

Create `tests/target_swing_timer_bars.test.ts`:

```typescript
// @vitest-environment happy-dom
// Tests the TargetSwingTimerBars binding (src/ui/target_swing_timer_bars.ts):
// resolves the target and target-of-target bars' DOM refs once, drives both
// independent clocks per update() call, and resolves the target-of-target
// entity itself (independent of the unrelated showTargetOfTarget mini-frame
// toggle). The pure fill/ready math is already covered by
// tests/swing_timer.test.ts; this only proves the binding wires the two real
// elements to the two independent cores and resolves tot correctly.

import { beforeEach, describe, expect, it } from 'vitest';
import type { PainterHostWriters } from '../src/ui/painter_host';
import { TargetSwingTimerBars } from '../src/ui/target_swing_timer_bars';

type Call = { m: keyof PainterHostWriters; args: unknown[] };

function recordingWriters(): { calls: Call[]; writers: PainterHostWriters } {
  const calls: Call[] = [];
  const rec =
    <K extends keyof PainterHostWriters>(m: K) =>
    (...args: unknown[]) => {
      calls.push({ m, args });
    };
  return {
    calls,
    writers: {
      setText: rec('setText'),
      setDisplay: rec('setDisplay'),
      setTransform: rec('setTransform'),
      setWidth: rec('setWidth'),
      setStyleProp: rec('setStyleProp'),
      toggleClass: rec('toggleClass'),
      setAttr: rec('setAttr'),
    } as PainterHostWriters,
  };
}

function mountBars(): void {
  document.body.innerHTML = `
    <div id="swingbar-target" aria-hidden="true"><div class="fill"></div><div class="label"></div></div>
    <div id="swingbar-tot" aria-hidden="true"><div class="fill"></div><div class="label"></div></div>
  `;
}

// targetId/aggroTargetId are part of TargetSwingSourceInput (needed for
// targetOfTargetId resolution); null here means "no target of its own",
// so these three tests never surface a tot bar.
const ATTACKING = {
  dead: false,
  kind: 'mob',
  autoAttack: true,
  swingTimer: 1,
  targetId: null,
  aggroTargetId: null,
};

beforeEach(() => {
  mountBars();
});

function entitiesOf(map: Record<number, { dead: boolean; kind: string; autoAttack: boolean; swingTimer: number }>) {
  return { get: (id: number) => map[id] };
}

describe('TargetSwingTimerBars: visibility follows the enabled flag', () => {
  it('hides both bars when disabled, even against a live auto-attacking target', () => {
    const { calls, writers } = recordingWriters();
    const bars = new TargetSwingTimerBars(writers);

    bars.update(ATTACKING, entitiesOf({}), false);

    const displayCalls = calls.filter((c) => c.m === 'setDisplay');
    expect(displayCalls).toEqual([
      { m: 'setDisplay', args: [document.querySelector('#swingbar-target'), 'none'] },
      { m: 'setDisplay', args: [document.querySelector('#swingbar-tot'), 'none'] },
    ]);
  });

  it('shows the target bar when enabled and the target is auto-attacking', () => {
    const { calls, writers } = recordingWriters();
    const bars = new TargetSwingTimerBars(writers);

    bars.update(ATTACKING, entitiesOf({}), true);

    const displayCalls = calls.filter((c) => c.m === 'setDisplay');
    expect(displayCalls[0]).toEqual({
      m: 'setDisplay',
      args: [document.querySelector('#swingbar-target'), 'block'],
    });
  });

  it('hides the target bar when there is no target, even enabled', () => {
    const { calls, writers } = recordingWriters();
    const bars = new TargetSwingTimerBars(writers);

    bars.update(null, entitiesOf({}), true);

    const displayCalls = calls.filter((c) => c.m === 'setDisplay');
    expect(displayCalls[0]).toEqual({
      m: 'setDisplay',
      args: [document.querySelector('#swingbar-target'), 'none'],
    });
  });
});

describe('TargetSwingTimerBars: resolves the target-of-target entity itself', () => {
  it('shows the tot bar when the target has a live, auto-attacking target of its own', () => {
    const { calls, writers } = recordingWriters();
    const bars = new TargetSwingTimerBars(writers);
    const target = { dead: false, kind: 'mob', autoAttack: true, swingTimer: 1, targetId: null, aggroTargetId: 55 };
    const totEntity = { dead: false, kind: 'player', autoAttack: true, swingTimer: 0.5 };

    bars.update(target as any, entitiesOf({ 55: totEntity }), true);

    const displayCalls = calls.filter((c) => c.m === 'setDisplay');
    expect(displayCalls).toEqual([
      { m: 'setDisplay', args: [document.querySelector('#swingbar-target'), 'block'] },
      { m: 'setDisplay', args: [document.querySelector('#swingbar-tot'), 'block'] },
    ]);
  });

  it('hides the tot bar when the target-of-target id resolves to an unknown entity (out of interest range)', () => {
    const { calls, writers } = recordingWriters();
    const bars = new TargetSwingTimerBars(writers);
    const target = { dead: false, kind: 'mob', autoAttack: true, swingTimer: 1, targetId: null, aggroTargetId: 999 };

    bars.update(target as any, entitiesOf({}), true);

    const displayCalls = calls.filter((c) => c.m === 'setDisplay');
    expect(displayCalls[1]).toEqual({
      m: 'setDisplay',
      args: [document.querySelector('#swingbar-tot'), 'none'],
    });
  });

  it('the target and tot clocks stay independent across frames', () => {
    const { calls, writers } = recordingWriters();
    const bars = new TargetSwingTimerBars(writers);
    const target = { dead: false, kind: 'mob', autoAttack: true, swingTimer: 2.5, targetId: null, aggroTargetId: 55 };
    const totEntity = { dead: false, kind: 'player', autoAttack: true, swingTimer: 1.2 };
    bars.update(target as any, entitiesOf({ 55: totEntity }), true);

    const target2 = { ...target, swingTimer: 2.4 };
    const totEntity2 = { ...totEntity, swingTimer: 1.1 };
    bars.update(target2 as any, entitiesOf({ 55: totEntity2 }), true);

    const widths = calls.filter((c) => c.m === 'setWidth').map((c) => c.args[1]);
    // Frame 1: both frac 0. Frame 2: target frac = 1 - 2.4/2.5 = 0.04 -> "4.0%";
    // tot frac = 1 - 1.1/1.2 = 0.0833... -> "8.3%". Each tracks its own period.
    expect(widths).toEqual(['0.0%', '0.0%', '4.0%', '8.3%']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/target_swing_timer_bars.test.ts`
Expected: FAIL (the module does not exist yet: "Cannot find module
'../src/ui/target_swing_timer_bars'").

- [ ] **Step 3: Implement the module**

Create `src/ui/target_swing_timer_bars.ts`:

```typescript
// Owns both the target and target-of-target swing-timer bars (#swingbar-target
// and #swingbar-tot) as one small binding, mirroring src/ui/swing_timer_bars.ts's
// shape: resolves their DOM refs once, holds two independent edge-tracking
// clocks, and drives two SwingTimerPainter instances (the same class, reused a
// third and fourth time) from a single per-frame update() call.
//
// Resolves the target-of-target ENTITY itself via targetOfTargetId(), fully
// INDEPENDENT of the existing showTargetOfTarget mini-frame toggle: this
// module's own `enabled` flag (the new showTargetSwingTimer setting) is the
// only gate, so a player can see the tot swing bar without the tot portrait
// mini-frame, and vice versa.

import type { PainterHostWriters } from './painter_host';
import { targetSwingTimerState, type TargetSwingInput } from './swing_timer';
import { SwingTimerPainter } from './swing_timer_painter';
import { targetOfTargetId } from './target_of_target';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

function barPainter(writers: PainterHostWriters, barSelector: string): SwingTimerPainter {
  const bar = $(barSelector);
  return new SwingTimerPainter(
    writers,
    bar,
    bar.querySelector('.fill') as HTMLElement,
    bar.querySelector('.label') as HTMLElement,
  );
}

/** The entity lookup this module resolves the target-of-target through. A
 *  Map<number, Entity> (sim.entities on both the offline Sim and the online
 *  ClientWorld mirror) satisfies this structurally. */
export interface TargetSwingEntities {
  get(id: number): TargetSwingInput | undefined;
}

/** The target fields targetOfTargetId needs, plus the swing fields the target's
 *  OWN bar reads. A structural subset of Entity. */
export type TargetSwingSourceInput = TargetSwingInput & {
  targetId: number | null;
  aggroTargetId: number | null;
};

export class TargetSwingTimerBars {
  private readonly targetPainter: SwingTimerPainter;
  private readonly totPainter: SwingTimerPainter;
  private targetPeriod = 0;
  private lastTargetTimer = 0;
  private totPeriod = 0;
  private lastTotTimer = 0;

  constructor(writers: PainterHostWriters) {
    this.targetPainter = barPainter(writers, '#swingbar-target');
    this.totPainter = barPainter(writers, '#swingbar-tot');
  }

  update(
    target: TargetSwingSourceInput | null,
    entities: TargetSwingEntities,
    enabled: boolean,
  ): void {
    const targetInput = enabled ? target : null;
    const targetSwing = targetSwingTimerState(targetInput, this.targetPeriod, this.lastTargetTimer);
    this.targetPeriod = targetSwing.nextPeriod;
    this.lastTargetTimer = targetSwing.nextTimer;
    this.targetPainter.paint(targetSwing);

    const totId = enabled && target ? targetOfTargetId(target) : null;
    const tot = totId !== null ? (entities.get(totId) ?? null) : null;
    const totSwing = targetSwingTimerState(tot, this.totPeriod, this.lastTotTimer);
    this.totPeriod = totSwing.nextPeriod;
    this.lastTotTimer = totSwing.nextTimer;
    this.totPainter.paint(totSwing);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/target_swing_timer_bars.test.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
npx @biomejs/biome check --write src/ui/target_swing_timer_bars.ts tests/target_swing_timer_bars.test.ts
git add src/ui/target_swing_timer_bars.ts tests/target_swing_timer_bars.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add TargetSwingTimerBars, the HUD wiring for the new bars

New sibling module mirroring swing_timer_bars.ts's shape: caches the
#swingbar-target/#swingbar-tot DOM refs once, drives two independent
edge-tracking clocks through the third and fourth use of
SwingTimerPainter, and resolves the target-of-target entity itself via
targetOfTargetId, deliberately independent of the existing
showTargetOfTarget mini-frame toggle. Keeps the hud.ts integration to
one call site (next task), since hud.ts is pinned at zero headroom.
EOF
)"
```

---

### Task 6: `hud.ts` integration - one call site plus the toggle field/setter

**Files:**
- Modify: `src/ui/hud.ts` (imports near line 725/730, field near line 4139,
  cached toggle field near line 1511, setter near line 5421, call site near
  line 8856)
- Modify: `tests/monolith_budget.test.ts` (the `src/ui/hud.ts` ceiling)

**Interfaces:**
- Consumes: `TargetSwingTimerBars` (Task 5).
- Produces: `Hud.setShowTargetSwingTimer(on: boolean): void`, called by
  Task 7's `main.ts` dispatch.

There is no new standalone unit test for this task: `hud.ts`'s per-frame
update method has no existing direct unit-test harness (the existing
`SwingTimerBars`/`CastBarPainter` wiring it sits beside is exercised through
the module-level tests already written, not a `hud.ts`-level test). This
task's correctness is verified by the full `tsc`/build/gate pass in Task 10,
plus a manual smoke check (Step 5 below).

- [ ] **Step 1: Add the import**

In `src/ui/hud.ts`, next to the existing `import { SwingTimerBars } from
'./swing_timer_bars';` (currently line 725), add:

```typescript
import { TargetSwingTimerBars } from './target_swing_timer_bars';
```

- [ ] **Step 2: Add the cached toggle field**

Next to `private showTargetOfTarget = false;` (currently line 1511), add:

```typescript
  // Cached showTargetSwingTimer preference (set from main.ts applySetting via
  // setShowTargetSwingTimer); independent of showTargetOfTarget (that toggle
  // is the unrelated portrait mini-frame). When off, both new bars stay hidden.
  private showTargetSwingTimer = false;
```

- [ ] **Step 3: Add the painter-bars field**

Next to `private readonly swingTimerBars = new SwingTimerBars(this.writerFacet);`
(currently line 4139), add:

```typescript
  private readonly targetSwingTimerBars = new TargetSwingTimerBars(this.writerFacet);
```

- [ ] **Step 4: Add the setter**

Next to `setShowTargetOfTarget` (currently lines 5418-5422), add:

```typescript
  // Toggle the target / target-of-target swing-timer bars (showTargetSwingTimer
  // option), driven from main.ts applySetting. Independent of
  // setShowTargetOfTarget: the swing bars are unrelated to the portrait mini-frame.
  setShowTargetSwingTimer(on: boolean): void {
    this.showTargetSwingTimer = on;
  }
```

- [ ] **Step 5: Add the call site**

Next to `this.swingTimerBars.update(p, target ?? null);` (currently line
8856), add:

```typescript
    // Target / target-of-target swing timers: see
    // src/ui/target_swing_timer_bars.ts for the visibility gating and the
    // independent target-of-target resolution.
    this.targetSwingTimerBars.update(target ?? null, sim.entities, this.showTargetSwingTimer);
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. If `target`'s inferred type is missing `targetId`/
`aggroTargetId` at this call site, confirm `target`'s declared type
(`sim.entities.get(p.targetId)`'s return type, `Entity | undefined` narrowed to
`| null`) already includes both fields (it does: `Entity` in `src/sim/types.ts`
carries both), so no cast should be needed; if `tsc` disagrees, add the
minimal structural cast `target as (Entity & { targetId: number | null;
aggroTargetId: number | null }) | null` rather than widening
`TargetSwingSourceInput`.

- [ ] **Step 7: Measure and update the monolith ceiling**

Run: `wc -l src/ui/hud.ts`

Update `tests/monolith_budget.test.ts`'s `src/ui/hud.ts` entry (currently
`ceiling: 18474`) to the exact new number:

```typescript
    // Raised to the exact new count for the target/target-of-target swing-
    // timer bars: one import, one cached toggle field, one painter-bars field,
    // one setter, and one per-frame call site, all thin-consumer wiring to
    // src/ui/target_swing_timer_bars.ts (the ratchet's own rule: the real
    // logic lives in the extracted module, not here). No clean branch-owned
    // extraction exists for wholly new functionality.
    ceiling: <exact number from wc -l>,
```

- [ ] **Step 8: Run the full test suite touching hud.ts's existing coverage**

Run: `npx vitest run tests/monolith_budget.test.ts tests/architecture.test.ts tests/hud_perf_budget.test.ts tests/hud_update_drive.test.ts tests/client_shell.test.ts`
Expected: PASS.

- [ ] **Step 9: Format and commit**

```bash
npx @biomejs/biome check --write src/ui/hud.ts tests/monolith_budget.test.ts
git add src/ui/hud.ts tests/monolith_budget.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): wire the target/target-of-target swing bars into the HUD

Thin integration only: one import, one cached toggle field, one
TargetSwingTimerBars instance, one setter, and one per-frame call. The
visibility gating, edge-tracking clocks, and target-of-target
resolution all live in the already-tested target_swing_timer_bars.ts
sibling module, keeping hud.ts's own addition to the minimum the
zero-headroom monolith ratchet allows.
EOF
)"
```

---

### Task 7: Settings - `showTargetSwingTimer` end to end

**Files:**
- Modify: `src/game/settings.ts:420-426` (`BOOL_SETTINGS`)
- Modify: `src/main.ts:2619-2626` (`applySetting` dispatch)
- Modify: `tests/monolith_budget.test.ts` (the `src/main.ts` ceiling)
- Modify: `src/ui/options_view.ts:741-742` (`boolToggle` entry)
- Modify: `tests/options_view.test.ts` (the `FRAMES_KEYS` pinned-order list)

**Interfaces:**
- Consumes: `Hud.setShowTargetSwingTimer` (Task 6).
- Produces: a new `BoolSettingKey` value `'showTargetSwingTimer'`, default
  `false`, exposed in the Interface options panel next to "Show Target of
  Target" / "Show Your Pet".

- [ ] **Step 1: Write the failing test**

In `tests/options_view.test.ts`, add `'showTargetSwingTimer'` to the
`FRAMES_KEYS` array, immediately after `'showTargetOfTarget'` (currently line
561):

```typescript
  'aurasOnPlayerFrame',
  'showTargetOfTarget',
  'showTargetSwingTimer',
  'showPetFrame',
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/options_view.test.ts`
Expected: FAIL. The `interfaceControlsForTab(all, 'frames')` assertion no
longer matches `FRAMES_KEYS` (the real controls list is missing the new key
since `options_view.ts` has no `boolToggle` for it yet).

- [ ] **Step 3: Add the setting default**

In `src/game/settings.ts`, next to `showTargetOfTarget: { def: false },`
(currently line 420), add:

```typescript
  // off by default: the target and target-of-target's own melee/ranged swing
  // timer bars, under the target frame. Purely a display preference read by
  // the HUD's per-frame update; the swingTimer/autoAttack data already rides
  // the wire (server/game.ts dynamicFields), and both bars hide themselves
  // when the target (or its own target) is unknown or not auto-attacking.
  showTargetSwingTimer: { def: false },
```

- [ ] **Step 4: Add the `main.ts` dispatch case**

In `src/main.ts`, next to the `showTargetOfTarget`/`showPetFrame` dispatch
block (currently lines 2619-2626), add:

```typescript
    if (key === 'showTargetSwingTimer') {
      hud.setShowTargetSwingTimer(settings.set('showTargetSwingTimer', !!value));
      return;
    }
```

- [ ] **Step 5: Measure and update `main.ts`'s monolith ceiling**

Run: `wc -l src/main.ts`

Update `tests/monolith_budget.test.ts`'s `src/main.ts` entry (currently
`ceiling: 11566`) to the exact new number:

```typescript
    // Raised to the exact new count for the showTargetSwingTimer dispatch
    // case: a three-line thin delegate onto hud.setShowTargetSwingTimer,
    // exactly the shape every other boolean toggle's dispatch already takes
    // in this method (main.ts is a firewall, not a home; the real state and
    // paint logic live in settings.ts and target_swing_timer_bars.ts).
    ceiling: <exact number from wc -l>,
```

- [ ] **Step 6: Add the `boolToggle` entry**

In `src/ui/options_view.ts`, next to `boolToggle(s, 'showTargetOfTarget',
'hudChrome.options.showTargetOfTarget'),` (currently line 741), add:

```typescript
      boolToggle(s, 'showTargetSwingTimer', 'hudChrome.options.showTargetSwingTimer'),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/options_view.test.ts tests/monolith_budget.test.ts`
Expected: FAIL still, on the i18n key (the catalog entry does not exist until
Task 8) if `options_view.test.ts` resolves labels through `t()`; if it only
asserts key names/order (matching the `keys`/`optionsControlKeys` pattern seen
earlier in the file), this already PASSES. Run it and read the actual failure
before assuming which; if it fails on a missing translation, proceed to Task 8
before re-running.

- [ ] **Step 8: Format and commit**

```bash
npx @biomejs/biome check --write src/game/settings.ts src/main.ts src/ui/options_view.ts tests/options_view.test.ts tests/monolith_budget.test.ts
git add src/game/settings.ts src/main.ts src/ui/options_view.ts tests/options_view.test.ts tests/monolith_budget.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add the showTargetSwingTimer Interface option

Off by default, wired through the exact same path as the existing
showTargetOfTarget toggle: a BOOL_SETTINGS default, a main.ts
applySetting dispatch case, and a boolToggle entry in the Interface
panel's frames tab, right next to Show Target of Target and Show Your
Pet.
EOF
)"
```

---

### Task 8: i18n - the new toggle label

**Files:**
- Modify: `src/ui/i18n.catalog/hud_chrome.ts:1873-1881` (the `options` object)

**Interfaces:**
- Consumes: nothing new.
- Produces: `hudChrome.options.showTargetSwingTimer` resolvable via `t()`,
  consumed by `options_view.ts`'s `boolToggle` (Task 7) and by
  `tests/options_view.test.ts`/`tests/i18n_completeness.test.ts`/
  `tests/localization_fixes.test.ts`.

- [ ] **Step 1: Add the catalog entry**

In `src/ui/i18n.catalog/hud_chrome.ts`, next to `showTargetOfTarget: 'Show
Target of Target',` (currently line 1876), add:

```typescript
    // Interface panel toggle (off by default) for the current target's (and
    // target-of-target's) own melee/ranged swing timer, under the target
    // frame. Independent of showTargetOfTarget (the portrait mini-frame).
    showTargetSwingTimer: 'Show Target Swing Timer',
```

- [ ] **Step 2: Regenerate the i18n artifacts**

Run: `npm run i18n:gen`

This regenerates `src/ui/i18n.catalog/translation_keys.generated.ts` and every
`src/ui/i18n.resolved.generated/*.ts` file. Do not hand-edit either; if the
command is not available standalone, confirm its name via `grep -A2
'"i18n:gen"' package.json` first (it is a `package.json` script per the root
CLAUDE.md).

- [ ] **Step 3: Run the i18n and options tests**

Run: `npx vitest run tests/options_view.test.ts tests/i18n_completeness.test.ts tests/localization_fixes.test.ts`
Expected: PASS. `i18n_completeness`/`localization_fixes` allow a pending
English-only row per the contributor policy (non-Latin locale fills are a
release-time follow-up, not a PR-tier requirement); if either hard-fails on
this specific key, re-read `docs/i18n-scaling/translation-workflow.md` before
changing anything, since that would mean this repo's PR-tier gate is stricter
than the root CLAUDE.md's stated contributor policy for this key's shape.

- [ ] **Step 4: Format and commit**

```bash
npx @biomejs/biome check --write src/ui/i18n.catalog/hud_chrome.ts
git add src/ui/i18n.catalog/hud_chrome.ts src/ui/i18n.catalog/translation_keys.generated.ts src/ui/i18n.resolved.generated/
git commit -m "$(cat <<'EOF'
feat(i18n): add the showTargetSwingTimer toggle label (English)

Non-Latin locale fills are a release-time follow-up per the
contributor i18n policy; the resolved generated bundles are produced
by npm run i18n:gen, not hand-edited.
EOF
)"
```

---

### Task 9: DOM/CSS - the two new bars

**Files:**
- Modify: `index.html`, `play.html` (the `#target-frame` markup)
- Modify: `src/styles/hud.css`

**Interfaces:**
- Consumes: nothing new (pure markup/CSS; `target_swing_timer_bars.ts` already
  queries `#swingbar-target`/`#swingbar-tot` by id).
- Produces: the two visible bar elements.

There is no new automated test for markup/CSS itself; Step 4 below is a
manual verification (this repo's own convention: visual changes get real
screenshots in the PR body, not a DOM-snapshot test). `tests/mobile_
window_transform.test.ts` and the existing HUD tests already assert the
`#target-frame`/`.uf-bars` structure is intact; Step 3 runs them to catch any
accidental structural regression from the edit.

- [ ] **Step 1: Add the markup in `index.html`**

In `index.html`, the target frame's `.uf-bars` currently ends right after
`#tf-castbar` (around line 258):

```html
        <div id="tf-castbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" data-i18n-aria="hudChrome.castBar.targetAria" aria-label="Unit Cast Bar"><div class="fill"></div><div class="label"></div><div class="timer"></div></div>
```

Add these two lines immediately after it, still inside `.uf-bars` (before its
closing `</div>`):

```html
        <div id="swingbar-target" aria-hidden="true"><div class="fill"></div><div class="label"></div></div>
        <div id="swingbar-tot" aria-hidden="true"><div class="fill"></div><div class="label"></div></div>
```

- [ ] **Step 2: Add the identical markup in `play.html`**

Run: `grep -n 'id="tf-castbar"' play.html`

`play.html` mirrors `index.html`'s HUD markup (PR #3648 touched both). Apply
the exact same two-line insertion immediately after `play.html`'s own
`#tf-castbar` element, inside `.uf-bars`, matching whatever indentation that
file already uses at that point.

- [ ] **Step 3: Add the CSS**

In `src/styles/hud.css`, immediately after the existing `#tf-castbar .timer`
rule (the block ending around line 2474, right before the `/* Swing timers:
...*/` comment that introduces `#swingbar, #swingbar-offhand`), add:

```css
  /* Target / target-of-target swing timers: sit in the SAME .uf-bars flex
     flow as #tf-castbar (position: relative, NOT the absolute-positioned
     #swingbar/#swingbar-offhand family), so they inherit the target frame's
     existing responsive/mobile scaling for free with zero new breakpoint
     rules. Violet (target) / rose (target-of-target) fills keep all four
     possible swing bars (own main-hand amber, own off-hand teal, target
     violet, target-of-target rose) visually distinct when several are up
     at once. */
  #swingbar-target,
  #swingbar-tot {
    position: relative;
    width: 100%;
    height: 12px;
    margin-top: 4px;
    display: none;
    border: 1px solid var(--border);
    outline: 1px solid #000;
    border-radius: 3px;
    background: #0c0a07;
    overflow: hidden;
  }
  #swingbar-target .fill,
  #swingbar-tot .fill {
    height: 100%;
    width: 0%;
    box-shadow: inset 0 1px 0 #fff4;
    transition: width 60ms linear;
  }
  #swingbar-target .fill {
    background: linear-gradient(#c9a3ff, #7c3fd9 60%, #481f8a);
  }
  #swingbar-tot .fill {
    background: linear-gradient(#ffb3c6, #d9427c 60%, #8a1f4e);
  }
  #swingbar-target.ready .fill,
  #swingbar-tot.ready .fill {
    background: linear-gradient(#d8e8ff, #8fb6e6 60%, #5b86b8);
  }
  #swingbar-target .label,
  #swingbar-tot .label {
    position: absolute;
    inset: 0;
    text-align: center;
    font-size: 10px;
    line-height: 12px;
    color: #fff;
    text-shadow: 1px 1px 2px #000;
    font-family: var(--title-font);
  }
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev` (and `npm run server` in another terminal if not already
running), open the game, target a live auto-attacking mob, and confirm no new
bar appears while the "Show Target Swing Timer" option is off (default).
Enable it in Interface options, re-target the mob, and confirm the violet bar
appears under the target's cast bar and fills toward ready. If the target
itself has a live target of its own (aggro on you or an ally), confirm the
rose bar also appears. Capture before/after screenshots (desktop and mobile
landscape) per the `pr-screenshots` skill, since this is a visual change and
the PR template requires them.

- [ ] **Step 5: Run the structural regression tests**

Run: `npx vitest run tests/mobile_window_transform.test.ts tests/client_shell.test.ts tests/hud_perf_budget.test.ts`
Expected: PASS.

- [ ] **Step 6: Format and commit**

```bash
npx @biomejs/biome check --write src/styles/hud.css index.html play.html
git add index.html play.html src/styles/hud.css
git commit -m "$(cat <<'EOF'
feat(ui): add the target/target-of-target swing bar markup and CSS

Placed in the same .uf-bars flex flow as the existing #tf-castbar
(not the absolute-positioned #swingbar/#swingbar-offhand family), so
both new bars inherit the target frame's existing responsive/mobile
scaling with zero new breakpoint rules. Distinct violet/rose fills
keep all four possible swing bars visually separable.
EOF
)"
```

---

### Task 10: Full gate

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the fast selective gate**

Run: `node scripts/gate_select.mjs`
Expected: PASS. This is the pre-merge gate referenced by the root CLAUDE.md;
read its output carefully for anything it flags as needing the full suite.

- [ ] **Step 3: If time allows, run the full gate**

Run: `npm run gate`
Expected: PASS. Deeper than Step 2 (i18n freshness, malware scan, the
real-browser regression suite, every build). Not required to call the PR
done per the root CLAUDE.md, but the deeper check when available.

- [ ] **Step 4: Reconcile any monolith ceiling drift**

If any earlier task's `wc -l`-measured ceiling has drifted (another commit
landed on the branch since), run: `wc -l src/ui/hud.ts server/game.ts
src/net/online.ts src/main.ts` and re-pin each `tests/monolith_budget.test.ts`
entry to its current exact count, with an updated comment noting the
reconciliation.

- [ ] **Step 5: Fix anything red, then re-run Steps 1-2 until clean**

No placeholder here: if `gate_select.mjs` or `tsc` reports a failure, open the
failing file, find the actual cause (a missed import, a stale ceiling, a
biome format diff), fix it directly, and re-run. Do not proceed to Task 11
with anything red.

---

### Task 11: Push and reply to PR #3648

- [ ] **Step 1: Push the branch**

```bash
git push origin feature/offhand-swing-timer-indicator
```

- [ ] **Step 2: Verify the push landed on the open PR**

```bash
gh pr view 3648 --repo levy-street/world-of-claudecraft --json commits --jq '.commits[-1].messageHeadline'
```
Expected: prints the most recent commit's headline from this plan (Task 9's
commit, if all tasks ran in order).

- [ ] **Step 3: Reply as a new PR comment**

Confirm the review comment this feature answers still reads as expected:

```bash
gh api repos/levy-street/world-of-claudecraft/pulls/3648/reviews --jq '.[] | select(.body | contains("swing timer")) | {id, body}'
```

Then post a new comment (not a review) summarizing what shipped:

```bash
gh pr comment 3648 --repo levy-street/world-of-claudecraft --body "$(cat <<'EOF'
Added the target and target-of-target swing timer requested above: two new bars under the target frame (violet for your target, rose for its own target), each showing when that entity is actively auto-attacking. Off by default, toggle it on in Interface options as "Show Target Swing Timer" if you want it, so it stays out of the way for anyone who finds it too much info on screen.
EOF
)"
```

- [ ] **Step 4: Report back**

Confirm the comment posted with `gh pr view 3648 --repo levy-street/world-of-claudecraft --comments | tail -20`.

---

## Self-Review Notes

- **Spec coverage:** every numbered section of the spec (sim autoAttack fix,
  wire field, pure core, HUD wiring, hud.ts integration, settings, i18n,
  DOM/CSS, monolith ratchet, testing, explicitly-out-of-scope, delivery) maps
  to Tasks 1-11 above. The spec's "Explicitly out of scope" items (off-hand
  target bars, new IWorld members, weapon speed on the wire) are not
  implemented anywhere in this plan, matching the spec.
- **Correction from the spec:** the spec's Monolith Ratchet section named only
  three files (`hud.ts`, `server/game.ts`, `online.ts`). Research while
  writing this plan found `src/main.ts` is ALSO pinned at zero headroom, and
  the settings dispatch case needed there (Task 7) requires the same
  measure-and-bump treatment. Folded in as a fourth ceiling update.
- **Placeholder scan:** no TBD/TODO markers; every step carries real,
  complete code. The two spots that cannot be fully pinned in advance (Task
  2/3/6/7's exact monolith ceiling numbers, Task 9's play.html indentation)
  are measured with a concrete command (`wc -l`, `grep`) rather than guessed.
- **Type consistency:** `TargetSwingInput` (Task 4) is reused verbatim as the
  base of `TargetSwingSourceInput` (Task 5, adding only `targetId`/
  `aggroTargetId`) and as `TargetSwingEntities`'s return type; `Hud.
  setShowTargetSwingTimer` (Task 6) is the exact name Task 7's `main.ts`
  dispatch calls.
- **Coordinator-side review (done by the session, not a subagent, per this
  skill's own self-review instruction):** traced `updatePursuitProfileCombat`'s
  full control flow (`src/sim/mob/combat_profile.ts:274-307`) to confirm Task 1
  does not need a redundant top-of-function `autoAttack` reset there: its final
  line (`mob.aiState = ... 'attack' : 'chase'`) recomputes `aiState` fresh from
  live distance every tick, and both of its `tryMobMeleeSwingInRange` call
  sites gate on that same tick-start value, so any tick where `aiState` was
  `'attack'` entering the function is guaranteed to re-run
  `tryMobMeleeSwingInRange` (which now owns the true/false write), and any
  tick where it was not, `autoAttack` was already `false`. Added Task 1 Step
  5b (the `tests/world_api_parity.test.ts` grep) to close the one spec item
  (parity confirmation) that had no explicit task step.
