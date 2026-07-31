// Inert Epic achievement-mirror stubs for Phase 3. Phase 6 fills these with the
// real fire-and-forget push worker (the Steam twin is server/steam/mirror.ts).
// Kept as no-ops so Phase 6 is additive: call sites and routes can import the
// surface now without wiring deeds_records or the game loop yet.
//
// THE HARD RULE: this observer never mints credentials, never grants or denies
// a deed, and never becomes an identity source. Linking is allowed; LOGIN WITH
// EPIC DOES NOT EXIST.

/** Observer hook for a recorded deed unlock. Phase 6: enqueue a push when the
 *  account is linked and the surface is enabled. Today: no-op. */
export function onDeedRecorded(_accountId: number, _deedId: string): void {
  // Phase 6.
}

/** Steady-state heal on login. Phase 6: reconcile earned mapped deeds to the
 *  linked Epic account when enabled. Today: no-op. */
export function reconcileOnLogin(_accountId: number): void {
  // Phase 6.
}

/** Link / unlink cache flip. Phase 6: keep the mirror's view of the caller's
 *  Epic id current. Today: no-op. */
export function onLinkChanged(_accountId: number, _epicAccountId: string | null): void {
  // Phase 6.
}
