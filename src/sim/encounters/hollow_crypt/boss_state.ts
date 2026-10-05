// Per-fight state of the Hollow Crypt's wing bosses (encounters/hollow_crypt:
// Sexton Marrow, the Lady of the Bonechill, Cantor Ilvane), on the boss entity
// (Entity.cryptBossFight); cleared when the fight ends (a kill, an evade, a
// wipe). Sim authority only: the client reads the fight from casts, auras and
// the encounter objects. A type-only leaf, imported by src/sim/types.ts.

/** Sexton Marrow's fight (marrow.ts). */
export interface MarrowFightState {
  kind: 'marrow';
  /** Seconds until the next Shovelful, Measured for the Grave, heroic Blow. */
  shovelTimer: number;
  measureTimer: number;
  blowTimer: number;
  /** Mechanic casts started (the deterministic victim hash salt). */
  casts: number;
  /** The bar running (his own cast), its target and his locked aim, else null. */
  bar: { what: 'shovel' | 'measure' | 'blow'; targetId: number; yaw: number } | null;
  /** Marked players and the seconds before their grave caves in. */
  marks: { playerId: number; remaining: number }[];
  /** Open Graves (instance-local, object ids, oldest first); `stir` is the
   *  heroic Unquiet Earth clock (seconds someone has lingered), `rest` the
   *  seconds before this grave may raise again. */
  graves: { objectId: number; x: number; z: number; radius: number; stir: number; rest: number }[];
  /** Seconds to the next Grave Dirt pulse (one a second, every grave). */
  dirtTick: number;
  /** Burial Tolls started this fight (thresholds fired). */
  tolls: number;
  /** The Toll in flight: striding to the rope, then ringing; its clock and the
   *  peals rung so far. */
  toll: { phase: 'stride' | 'ring'; t: number; peals: number } | null;
  /** Every grave opened at the yard's edge so far (the deed reads it). */
  tidy: boolean;
}

/** The Lady of the Bonechill's fight (lady.ts, lady_lanterns.ts, lady_embrace.ts). */
export interface LadyFightState {
  kind: 'lady';
  lamentTimer: number;
  embraceTimer: number;
  /** Mechanic casts started (the deterministic victim hash salt). */
  casts: number;
  /** The bar running (her own cast) and the players it will take. */
  bar: { what: 'lament' | 'embrace' | 'freeze'; targetIds: number[] } | null;
  /** Seconds each grave lantern stays dark (0: lit), in GRAVE_LANTERNS order. */
  lanternDark: number[];
  /** Heroic: seconds each lantern has burned since it was last lit. */
  lanternLit: number[];
  /** The Embrace in flight: who she holds, the phase and its clock, her health
   *  when the hold began, and where (instance-local) and how high she hangs. */
  embrace: {
    victims: number[];
    phase: 'rise' | 'hold' | 'descend';
    t: number;
    hpAt: number;
    x: number;
    z: number;
    floorY: number;
    yaw: number;
    /** Released gently (true) or dropped (false) once the hold ends. */
    released: boolean;
    /** The height she reached when the hold ended (the descent starts there). */
    from: number;
  } | null;
  /** Players she dropped, falling toward the ice (the impact lands on landing),
   *  and the seconds each has fallen. */
  falling: { playerId: number; t: number }[];
  /** Her Rime Path: the patches still standing (instance-local, object ids). */
  rime: { objectId: number; x: number; z: number; remaining: number }[];
  /** Where she laid the last patch (instance-local). */
  lastRime: { x: number; z: number } | null;
  /** The Bridal Freeze has frozen the whole ravine (and its floor object). */
  frozen: boolean;
  floorObjectId: number | null;
  /** Anyone dropped from her Embrace this fight (the deed reads it). */
  dropped: boolean;
}

/** Cantor Ilvane's fight (ilvane.ts, ilvane_organ.ts). */
export interface IlvaneFightState {
  kind: 'ilvane';
  dirgeTimer: number;
  organTimer: number;
  /** Dirges started this fight (heroic Unbroken Verse counts them). */
  dirges: number;
  /** The kickable Dirge running, so a bar that vanishes before it ends reads
   *  as cut (a kick), else null. */
  kickable: string | null;
  /** After a kick: seconds she sings no Dirge. */
  quiet: number;
  /** The Bone Organ: walking to the bench, then playing; its clock, the waves
   *  drawn so far, and the lanes still on the floor (their objects, wave and
   *  burst clock). */
  organ: {
    phase: 'stride' | 'play';
    t: number;
    waves: number;
    lanes: { objectId: number; x: number; wave: number; burstAt: number; burst: boolean }[];
  } | null;
  /** Her Choristers (entity ids, the risen ones replacing the fallen). */
  choristerIds: number[];
  /** Heroic Encore: for each fallen Chorister, the seconds it has lain while its
   *  partner lives (by entity id). */
  fallen: { id: number; t: number; x: number; z: number }[];
  /** Below 30 percent. */
  crescendo: boolean;
  /** A Dirge struck anyone this fight (the deed reads it). */
  struck: boolean;
}

export type CryptBossFightState = MarrowFightState | LadyFightState | IlvaneFightState;
