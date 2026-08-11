<!-- src/sim/moderation/: operator-applied sanction state the sim wears. Repo-wide
     architecture/invariants live in the ROOT CLAUDE.md; sim-local rules in
     src/sim/CLAUDE.md. This file is only this subsystem's local contract. -->

# src/sim/moderation/: sanctions the sim wears

Host-agnostic state for sanctions an operator applies from the admin dashboard
and the sim then displays. Pure leaf modules: no `SimContext`, no `Rng`, no wall
clock. Every function takes the caller's elapsed seconds or its own state, so the
identical math runs in the offline browser `Sim`, on the authoritative server,
and in the headless RL env.

Import through `index.ts`, never from a module directly.

## The one rule: a sanction here is VISIBILITY, never POWER

Nothing in this directory may change a stat, a cooldown, a resource, a drop, or
any combat outcome. This is the same rule the Book of Deeds lives under
(`docs/design/deeds.md`: cosmetic-only, never power), for the same reason: a
sanction that also handicaps is a balance change applied by an operator with no
review, and it silently makes the player's every subsequent match unfair to the
people they are matched against.

`cheater_mark.ts` holds that line in three places, and a change to any of them
needs a maintainer decision:
- the aura carries `value: 0`,
- its `kind` is the dedicated inert `'cheater_mark'` rather than a zeroed borrow
  of a real debuff kind, so no later tuning pass can give it an effect by
  editing a shared constant,
- no arm of the stat fold in `entity.ts` matches that kind.

`tests/cheater_mark.test.ts` pins all three.

## `cheater_mark.ts`: the Cheater tag

An ACCOUNT-scoped tag every character on the account wears until a budget of
PLAYED seconds is burned down.

- **Account-scoped, not character-scoped.** The mark lives on `accounts`, is
  pushed onto `PlayerMeta` at world join by the server, and the remaining budget
  is written back on save. Rolling an alt does not escape it.
- **Played seconds, never wall clock.** A wall-clock sanction expires while the
  account is logged out, which is precisely the window a sanctioned player waits
  out. The budget burns only while in world.
- **The aura IS the timer.** While a character is in world, one second of sim
  time is one second of played time, so the ordinary aura tick is already the
  correct countdown. Do not add a second timer; two clocks drift.
- **The tag is not a deed.** `WireEntity.title` carries a deed id resolved
  through `DEEDS`. Routing the tag there would put a punishment in a cosmetic
  reward catalogue AND make it removable through the ordinary title picker
  (`setActiveTitle` accepts `null` from the player). It rides its own wire field
  so no player-driven command can reach it.
- **`undispellable`.** Same reason the recovery sicknesses carry it (see
  `applySickness` in `../spirit.ts`): a penalty a dispel, a cleanse, or a
  right-click can shed is not a penalty. Only its own timer clears it.

Absent-when-empty throughout: an unmarked account's save and wire stay
byte-identical to what they were before this system existed.
