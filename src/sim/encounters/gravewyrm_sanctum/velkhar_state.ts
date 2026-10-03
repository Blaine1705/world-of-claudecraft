// Velkhar's fight state (encounters/gravewyrm_sanctum/velkhar.ts), on the boss as
// Entity.sanctumFight. A type-only leaf so src/sim/types.ts can name it in the
// SanctumFightState union. Sim authority only: the client reads the fight from
// casts, auras and the encounter objects.

export interface VelkharFightState {
  kind: 'velkhar';
  /** Mechanic casts started (the deterministic salt). */
  casts: number;
}
