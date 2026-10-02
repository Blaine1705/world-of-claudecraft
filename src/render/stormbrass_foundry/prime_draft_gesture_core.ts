// The Prime Draft's presentation gestures, decided from mirrored state only
// (its auras, its bar, its combat flag, the Core Hatch ring's template), so
// offline and online look the same and a view rebuilt mid-fight catches up:
//  - the moorings (the gantry cables and the floor clamps): on while it is
//    Bolted or out of a fight, gone once the Unbolt clip has thrown them;
//  - the hatch leaves' dial (shut, open, a shudder through the warning);
//  - its stance (chest out round the open socket, or closed);
//  - the lightning's beat while it overdrives.
// foundry_creature_fx.ts feeds one of these per Draft each scan and sends what
// it returns through the renderer's triggerAttack seam; the rules themselves
// are prime_draft_model_core.ts.
//
// Three-free, DOM-free, deterministic.

import {
  DRAFT_HATCH_OPEN_DIAL,
  DRAFT_HATCH_RATTLE,
  DRAFT_HATCH_SHUT_DIAL,
  DRAFT_MOORINGS_GONE_GESTURE,
  DRAFT_MOORINGS_ON_GESTURE,
  DRAFT_OVERDRIVE_GLOW,
  DRAFT_STANCE_OPEN,
  DRAFT_STANCE_SHUT,
  type DraftHatchLook,
  draftHatchLook,
  draftMooringsShown,
  draftStanceOpen,
} from './prime_draft_model_core';

export interface DraftGestureInput {
  dead: boolean;
  /** It wears the Bolted aura. */
  bolted: boolean;
  /** Its combat flag. */
  inFight: boolean;
  /** Its Unbolt bar is running. */
  unbolting: boolean;
  /** The Core Hatch ring's state (null: no ring, out of a fight). */
  ring: 'closed' | 'warn' | 'open' | null;
  /** It wears the Overload stun. */
  overloaded: boolean;
  /** It wears the overdrive enrage. */
  overdrive: boolean;
}

/** Seconds between two sends of a state gesture that has not changed (the
 *  toggles and dials are idempotent; a late-built view needs the state). */
export const DRAFT_GESTURE_REFRESH = 2;
/** Seconds between the overdrive's glow beats. */
export const DRAFT_OVERDRIVE_BEAT = 1.4;

/** One Prime Draft's gesture memory. */
export class DraftGestures {
  private moorings = '';
  private mooringsAt = -1e6;
  private dial = '';
  private dialAt = -1e6;
  private stance = '';
  private look: DraftHatchLook = 'shut';
  private warnAt = 0;
  private unboltAt: number | null = null;
  private beatAt = -1e6;

  /** Are its moorings on right now (the cable tether follows them)? */
  moored = true;

  /**
   * One scan: `send` every gesture the state asks for at `clock`.
   * `hatchWarning` is the sim's warning length (DRAFT_TUNING.hatchWarning).
   */
  step(
    s: DraftGestureInput,
    clock: number,
    hatchWarning: number,
    send: (gesture: string) => void,
  ): void {
    // ---- the moorings
    if (s.unbolting && this.unboltAt === null) this.unboltAt = clock;
    // Bolted again with no bar running (a reset pull): the next tear is a new one.
    if (!s.unbolting && (s.bolted || !s.inFight)) this.unboltAt = null;
    this.moored = draftMooringsShown({
      dead: s.dead,
      bolted: s.bolted,
      inFight: s.inFight,
      sinceUnboltBar: this.unboltAt === null ? null : clock - this.unboltAt,
    });
    const moorings = this.moored ? DRAFT_MOORINGS_ON_GESTURE : DRAFT_MOORINGS_GONE_GESTURE;
    if (moorings !== this.moorings || clock - this.mooringsAt > DRAFT_GESTURE_REFRESH) {
      this.moorings = moorings;
      this.mooringsAt = clock;
      send(moorings);
    }
    if (s.dead) return;

    // ---- the hatch leaves
    const look = draftHatchLook(s.ring, s.overloaded, s.dead);
    if (look !== this.look) {
      if (look === 'warn') {
        this.warnAt = clock;
        send(DRAFT_HATCH_RATTLE);
      }
      this.look = look;
    }
    const dial = look === 'open' ? DRAFT_HATCH_OPEN_DIAL : DRAFT_HATCH_SHUT_DIAL;
    if (dial !== this.dial || clock - this.dialAt > DRAFT_GESTURE_REFRESH) {
      this.dial = dial;
      this.dialAt = clock;
      send(dial);
    }

    // ---- the stance (sent on a change only: its entry is a one-shot clip)
    const open = draftStanceOpen(look, clock - this.warnAt, hatchWarning);
    const stance = open ? DRAFT_STANCE_OPEN : DRAFT_STANCE_SHUT;
    if (stance !== this.stance) {
      // The first look at a shut body sends nothing: it already stands shut.
      const first = this.stance === '';
      this.stance = stance;
      if (!(first && !open)) send(stance);
    }

    // ---- the overdrive's beat
    if (s.overdrive && clock - this.beatAt >= DRAFT_OVERDRIVE_BEAT) {
      this.beatAt = clock;
      send(DRAFT_OVERDRIVE_GLOW);
    }
  }
}
