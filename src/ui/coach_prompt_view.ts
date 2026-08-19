// Pure model for the Proving Shore's floating interact prompt: the keycap
// bubble that pops over the coach's CURRENT target (the rail NPC, the next
// castaway crate, the noticeboard, the ferry bell) the moment the player is
// close enough that pressing interact will actually work. New players told
// us they do not read the coach card's body text; the bubble puts the one
// button that matters where they are already looking, without asking them
// to read anything.
//
// Island-only by construction: every caller gates on isOnProvingShore, and
// every target here is authored island content. The pure-core half of the
// pure-core + thin-consumer split (root CLAUDE.md); registered in
// UI_PURE_CORES (tests/architecture.test.ts); driven directly by
// tests/coach_prompt_view.test.ts. The consumer is bootcamp.ts, which
// projects the anchor through renderer.worldToScreen exactly like its
// guidance arrow.

import { PROVING_SHORE_NPCS, PROVING_SHORE_QUESTS } from '../sim/content/proving_shore';
import { INTERACT_RANGE } from '../sim/types';
import { BELL_STEP_TARGET, type BootcampStep, type CoachFocus } from './bootcamp_view';
import type { TranslationKey } from './i18n';

/** Planar distance (sim dist2d needs full Vec3s; the prompt only has x/z). */
function planar(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** The one client-side gate the interact key itself uses for NPCs
 *  (game/interactions.ts, game/nearby_interaction.ts): objects reach
 *  INTERACT_RANGE, NPC talk reaches two yards further. */
export const PROMPT_NPC_RANGE = INTERACT_RANGE + 2;
export const PROMPT_OBJECT_RANGE = INTERACT_RANGE;

/** The crate line's live ground objects (entity.ts createGroundObject). */
export const CRATE_OBJECT_ITEM_ID = 'ps_castaway_crate';

export interface CoachPromptPlan {
  /** World anchor (the target's feet). */
  x: number;
  z: number;
  /** Bubble height above the sampled ground at the anchor. */
  lift: number;
  /** Interact reach for this target kind (the show gate). */
  range: number;
  /** The verb under the keycap: Talk, Turn in, Pick up, Read, Ring, Attack. */
  verbKey: TranslationKey;
  /** 'kill' bubbles chip the target and attack binds instead of interact. */
  kind: 'interact' | 'kill';
}

/** The minimal entity shape the crate and mob scans read
 *  (IWorld.entities values). */
export interface CoachPromptEntity {
  kind: string;
  templateId?: string;
  objectItemId?: string | null;
  dead?: boolean;
  pos: { x: number; z: number };
}

/** How close to the lesson's mobs the Attack bubble shows: wide enough to
 *  catch the approach, tight enough to point at THIS camp. */
export const KILL_PROMPT_RANGE = 12;

const NPC_LIFT = 2.5;
const OBJECT_LIFT = 1.6;

function npcPlan(npcId: string, verbKey: TranslationKey): CoachPromptPlan | null {
  const npc = PROVING_SHORE_NPCS[npcId];
  if (!npc) return null;
  return {
    x: npc.pos.x,
    z: npc.pos.z,
    lift: NPC_LIFT,
    range: PROMPT_NPC_RANGE,
    verbKey,
    kind: 'interact',
  };
}

/** The nearest LIVE mob of the lesson's template, the Attack bubble's anchor. */
export function nearestMob(
  entities: Iterable<CoachPromptEntity>,
  templateId: string,
  playerPos: { x: number; z: number },
): CoachPromptEntity | null {
  let best: CoachPromptEntity | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const e of entities) {
    if (e.kind !== 'mob' || e.templateId !== templateId || e.dead) continue;
    const d = planar(e.pos.x, e.pos.z, playerPos.x, playerPos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** The two kill lessons' quarry (the Attack bubble's scan target). */
const KILL_LESSON_TEMPLATE: Readonly<Record<string, string>> = {
  q_ps_strike_true: 'training_effigy',
  q_ps_shell_and_claw: 'shore_scuttler',
};

/** The nearest live castaway crate to the player, or null between respawns. */
export function nearestCrate(
  entities: Iterable<CoachPromptEntity>,
  playerPos: { x: number; z: number },
): CoachPromptEntity | null {
  let best: CoachPromptEntity | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const e of entities) {
    if (e.kind !== 'object' || e.objectItemId !== CRATE_OBJECT_ITEM_ID || e.dead) continue;
    const d = planar(e.pos.x, e.pos.z, playerPos.x, playerPos.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** The signpost lesson's reading spot (mirrors COACH_ACTIVE_TARGETS: the
 *  noticeboard is a sentinel object, not a live entity the client can key). */
const SIGNPOST_SPOT = { x: -312, z: 42.5 };

/**
 * Where the interact bubble belongs for the current coach station, or null
 * when the station's lesson is not an interact press (the kill quests, the
 * gauntlet lanes, the camera swing). `step` is the gauntlet ladder's lesson
 * when the head quest holds the focus, null otherwise.
 */
export function coachPromptPlan(args: {
  bellPhase: boolean;
  step: BootcampStep | null;
  focus: CoachFocus | null;
  entities: Iterable<CoachPromptEntity>;
  playerPos: { x: number; z: number };
}): CoachPromptPlan | null {
  if (args.bellPhase) {
    return {
      x: BELL_STEP_TARGET.x,
      z: BELL_STEP_TARGET.z,
      lift: OBJECT_LIFT,
      range: PROMPT_OBJECT_RANGE,
      verbKey: 'hudChrome.bootcamp.promptRing',
      kind: 'interact',
    };
  }
  if (args.step !== null) {
    // The gauntlet ladder: only its two interact lessons carry a bubble.
    if (args.step === 'talk') return npcPlan('warden_tam', 'hudChrome.bootcamp.promptTalk');
    if (args.step === 'done') return npcPlan('overseer_pell', 'hudChrome.bootcamp.promptTurnIn');
    return null;
  }
  const focus = args.focus;
  if (!focus) return null;
  const quest = PROVING_SHORE_QUESTS[focus.questId];
  if (!quest) return null;
  if (focus.state === 'available') {
    return npcPlan(quest.giverNpcId, 'hudChrome.bootcamp.promptTalk');
  }
  if (focus.state === 'ready') {
    return npcPlan(quest.turnInNpcId, 'hudChrome.bootcamp.promptTurnIn');
  }
  // Active tasks: interact-press lessons bubble their target; the kill
  // lessons bubble the nearest live quarry with the target and attack chips
  // (the playtest ask: Strike True's instruction comes up like the others).
  const quarry = KILL_LESSON_TEMPLATE[focus.questId];
  if (quarry) {
    const mob = nearestMob(args.entities, quarry, args.playerPos);
    if (!mob) return null;
    return {
      x: mob.pos.x,
      z: mob.pos.z,
      lift: NPC_LIFT,
      range: KILL_PROMPT_RANGE,
      verbKey: 'hudChrome.bootcamp.promptAttack',
      kind: 'kill',
    };
  }
  if (focus.questId === 'q_ps_the_wreck_line') {
    const crate = nearestCrate(args.entities, args.playerPos);
    if (!crate) return null;
    return {
      x: crate.pos.x,
      z: crate.pos.z,
      lift: OBJECT_LIFT,
      range: PROMPT_OBJECT_RANGE,
      verbKey: 'hudChrome.bootcamp.promptPickUp',
      kind: 'interact',
    };
  }
  if (focus.questId === 'q_ps_the_signpost') {
    return {
      x: SIGNPOST_SPOT.x,
      z: SIGNPOST_SPOT.z,
      lift: OBJECT_LIFT,
      range: PROMPT_NPC_RANGE,
      verbKey: 'hudChrome.bootcamp.promptRead',
      kind: 'interact',
    };
  }
  if (focus.questId === 'q_ps_pouch_and_purse') {
    return npcPlan(quest.giverNpcId, 'hudChrome.bootcamp.promptTalk');
  }
  if (focus.questId === 'q_ps_set_sail') {
    return npcPlan(quest.turnInNpcId, 'hudChrome.bootcamp.promptTalk');
  }
  return null;
}

/** True when the bubble should be VISIBLE: standing close enough that the
 *  interact press will land on this plan's target. */
export function coachPromptInRange(
  plan: CoachPromptPlan,
  playerPos: { x: number; z: number },
): boolean {
  return planar(plan.x, plan.z, playerPos.x, playerPos.z) <= plan.range;
}

// ---------------------------------------------------------------------------
// The press-this-next UI glow (styles/components.css .qd-coach): which
// control outside the dialog pulses for the current station. Applied by the
// bootcamp overlay's glow applicator; the quest dialog gates its own rows.
// ---------------------------------------------------------------------------

/** The rail quest whose tracker title and quest-log row pulse. */
export function coachGlowQuestId(focus: CoachFocus | null): string | null {
  return focus?.questId ?? null;
}

/** The vendor stock row that pulses (the pouch purchase lesson). */
export function coachGlowVendorItemId(focus: CoachFocus | null): string | null {
  return focus?.questId === 'q_ps_pouch_and_purse' && focus.state === 'active'
    ? 'linen_pouch'
    : null;
}

/** The bag stack that pulses (the pouch buckle-on lesson). */
export function coachGlowBagItemId(focus: CoachFocus | null): string | null {
  return focus?.questId === 'q_ps_pouch_and_purse' && focus.state === 'ready'
    ? 'linen_pouch'
    : null;
}

// ---------------------------------------------------------------------------
// Ferryman Odo's guiding voice: the clip key (rendered by the ElevenLabs
// pipeline from scripts/voices/extra_lines.mjs, whose guide__odo__* texts
// mirror these captions in English) plus the LOCALIZED caption row the coach
// card shows while the line plays. tests/coach_prompt_view.test.ts holds the
// clip keys and the extra_lines entries together.
// ---------------------------------------------------------------------------

export type GuideVoiceLineName =
  | 'arrival'
  | 'firstFlag'
  | 'runDone'
  | 'stationDoneA'
  | 'stationDoneB'
  | 'veerOff'
  | 'graduate';

export const GUIDE_VOICE_LINES: Readonly<
  Record<GuideVoiceLineName, { clip: string; caption: TranslationKey }>
> = {
  arrival: { clip: 'guide__odo__arrival', caption: 'hudChrome.bootcamp.voiceArrival' },
  firstFlag: { clip: 'guide__odo__first_flag', caption: 'hudChrome.bootcamp.voiceFirstFlag' },
  runDone: { clip: 'guide__odo__run_done', caption: 'hudChrome.bootcamp.voiceRunDone' },
  stationDoneA: {
    clip: 'guide__odo__station_done_a',
    caption: 'hudChrome.bootcamp.voiceStationDoneA',
  },
  stationDoneB: {
    clip: 'guide__odo__station_done_b',
    caption: 'hudChrome.bootcamp.voiceStationDoneB',
  },
  veerOff: { clip: 'guide__odo__veer_off', caption: 'hudChrome.bootcamp.voiceVeerOff' },
  graduate: { clip: 'guide__odo__graduate', caption: 'hudChrome.bootcamp.voiceGraduate' },
};

/** How far from the golden trail counts as veering off (the trail legs are
 *  straight chords of winding roads, so this carries real slack), and how
 *  long the player must stay out before Odo says anything. */
export const VEER_OFF_YD = 30;
export const VEER_GRACE_MS = 5000;
export const VEER_NUDGE_COOLDOWN_MS = 45000;
export const VEER_NUDGES_PER_STATION = 2;

/** The chip text beside the verb: the live interact bind on keyboard, the
 *  fixed pad interact button, a localized "Tap" on touch (chips are keycap
 *  GLYPHS, so the pad's fixed B mapping (gamepad_map.ts) is literal, not
 *  translated). Null hides the chip and shows the verb alone. */
export function coachPromptChip(
  mode: 'keyboard' | 'touch' | 'pad',
  interactLabel: string,
): { chip: string | null; chipIsKey: boolean } {
  if (mode === 'keyboard') return { chip: interactLabel || null, chipIsKey: true };
  if (mode === 'pad') return { chip: 'B', chipIsKey: true };
  return { chip: null, chipIsKey: false };
}
