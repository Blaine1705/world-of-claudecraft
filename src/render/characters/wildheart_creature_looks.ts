// The Wildheart Basin's creature looks (docs/design/dungeon-rework/
// wildheart_basin.md section 4). Most are PLACEHOLDERS: shipped rigs re-tinted
// for the jungle so every new creature of the reworked basin is visible and
// animated from day one, until the art phase gives each its own body. The
// Great Saurian has its own Blender body (WILDHEART_GREAT_SAURIAN_LOOK). Every
// key keeps the mob id and the visual key, so a swap is a def change.
// manifest.ts merges these over its VISUALS and maps the templates through
// MOB_KEYS (WILDHEART_MOB_KEYS).
//
// Sizes ride the templates' sim scales (sim/content/wildheart.ts): `grow`
// stands every creature well past a player (2.6 yd) without touching the sim's
// reach (the owner's rule: imposing, never toy-like). Heights below are the
// drawn height at the template's scale.

import {
  BEAST_HEEL,
  BEAST_TUNING,
  SAURIAN_ENRAGE,
  SAURIAN_HOWDAH_BREAK,
  SAURIAN_STOMP,
  SAURIAN_TAIL_SWIPE,
} from '../../sim/encounters/wildheart_basin/ids';
import {
  heelPounceTimeScale,
  JAGUAR_MODEL,
  JAGUAR_SIM_SCALE,
  jaguarLookHeight,
  jaguarModelScale,
} from '../wildheart_basin/jaguar_model_core';
import {
  SAURIAN_CLIP,
  SAURIAN_MODEL,
  SAURIAN_SIM_SCALE,
  saurianLookHeight,
  saurianModelScale,
} from '../wildheart_basin/saurian_model_core';
import type { ClipMap, VisualDef } from './manifest';

/** The gestures the basin's fx send the Saurian's howdah (saurian_fx.ts):
 *  hide it at once (a view built after the break) and mend it (a reset pull). */
export const SAURIAN_HOWDAH_GONE_GESTURE = 'wildheart_saurian_howdah_gone';
export const SAURIAN_HOWDAH_WHOLE_GESTURE = 'wildheart_saurian_howdah_whole';

/** The Great Saurian (scripts/assets/wildheart_great_saurian, built in Blender):
 *  one sculpted skin with its Sunbone harness, the bamboo-and-bone howdah and
 *  its troll rider, eleven hand-keyed clips. 13.4 yd to the top of its head at
 *  its 3.2 (saurian_model_core.ts SAURIAN_DRAWN_SCALE), 27 yd nose to club.
 *  Both strikes are cast bars whose clips land on the bar's end (the tail
 *  crosses the cone at 1.00 s of its 1 s bar, the forefeet slam at 2.00 s of
 *  the 2 s bar), so they play at 1x and finish as play-outs; the howdah
 *  breaking and the enrage are gestures off their spellfx. The howdah and the
 *  rider are their own meshes: hidden once the break has played. */
export const WILDHEART_GREAT_SAURIAN_LOOK: VisualDef = {
  url: SAURIAN_MODEL.url,
  height: saurianLookHeight(),
  clips: {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    attack: ['Attack'],
    attackByAbility: { [SAURIAN_HOWDAH_BREAK]: 'HowdahBreak', [SAURIAN_ENRAGE]: 'Enrage' },
    attackTimeScaleByAbility: { [SAURIAN_HOWDAH_BREAK]: 1, [SAURIAN_ENRAGE]: 1 },
    hit: ['Hit'],
    death: 'Death',
    cast: 'Roar',
    castByAbility: { [SAURIAN_TAIL_SWIPE]: 'TailSwipe', [SAURIAN_STOMP]: 'Stomp' },
    castTimeScaleByAbility: { [SAURIAN_TAIL_SWIPE]: 1, [SAURIAN_STOMP]: 1 },
    castPlayOut: ['TailSwipe', 'Stomp'],
    flourish: 'Roar',
  },
  castPlayOutHoldsAttacks: true,
  oneShotsHoldAttacks: ['HowdahBreak', 'Enrage'],
  meshToggles: [
    {
      nodes: ['GreatSaurianHowdah', 'GreatSaurianRider'],
      hideAfter: {
        gesture: SAURIAN_HOWDAH_BREAK,
        seconds: SAURIAN_CLIP.howdahGone,
        clip: 'HowdahBreak',
      },
      hideNow: SAURIAN_HOWDAH_GONE_GESTURE,
      showNow: SAURIAN_HOWDAH_WHOLE_GESTURE,
    },
  ],
  // The gaits' reference speeds at the drawn size (the planted feet slide at
  // 2.2 and 5.4 model yards a second): its 2.1 patrol wades at about 1.1x,
  // its 6 chase ambles at 1.26x.
  walkRef: SAURIAN_MODEL.walkRef * saurianModelScale(SAURIAN_SIM_SCALE),
  runRef: SAURIAN_MODEL.runRef * saurianModelScale(SAURIAN_SIM_SCALE),
  // The swing lands its blow at 0.62 s; the death's splashes are timed off the
  // clip at 1x (saurian_fx.ts).
  attackTimeScale: 1.1,
  deathTimeScale: 1,
  authoredAtlas: true,
  clickRadius: 4.5,
};

/** A carved prop that never moves: every clip lookup misses harmlessly. */
const STATIC_TOTEM_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Idle',
  run: 'Idle',
  attack: ['Idle'],
  death: 'Idle',
};

/** [base visual key, tint, tint strength, height factor over the base, extra]. */
type PlaceholderRow = [string, number, number, number, Partial<VisualDef>?];

const ROWS: Record<string, PlaceholderRow> = {
  // Basin Raptor: the velociraptor in jungle olive; about 3.8 yd at its 1.7.
  wildheart_basin_raptor: ['mob_spearjaw', 0x6f7a3a, 0.6, 1.25],
  // Spore Toad: the frog rig, warty olive and as big as a boar (4.5 yd at 2.4).
  wildheart_spore_toad: ['mob_murloc', 0x7f8a34, 0.7, 1.1, { selfIllumination: 0.08 }],
  // Snarlvine Lasher: the treant body in dark bark and vine (5.7 yd at 2.2).
  wildheart_vine_lasher: ['mob_treant', 0x445624, 0.8, 1],
  // Thorn Sprout (what a missed Gorgebloom seedpod grows into): the treant
  // body smaller, in a raw thorny green with a faint sap glow; about 3.7 yd
  // at its 1.5, still over a player's head.
  wildheart_thorn_sprout: ['mob_treant', 0x6f9a26, 0.82, 0.95, { selfIllumination: 0.1 }],
  // Sunbone Totem-Binder: the Hexcaller under a bone-ochre wash.
  wildheart_totem_binder: ['mob_wildheart_hexcaller', 0xd9b26a, 0.3, 1.05],
  // The Howdah Hexcaller: the Hexcaller in the howdah's war red.
  wildheart_howdah_hexcaller: ['mob_wildheart_hexcaller', 0xa3322a, 0.22, 1],
  // The Gorgebloom: the great cap rig washed blood red, rooted (it only turns
  // to face its target); about 10 yd at its 2.8.
  wildheart_gorgebloom: [
    'mob_hoard_boss_mushroom',
    0xb3202c,
    0.7,
    1.64,
    { selfIllumination: 0.35, clickRadius: 3.2 },
  ],
};

/** The Great Jaguar's clips (both bodies: the Fanglord's and its jade spirit). */
const GREAT_JAGUAR_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  attack: ['Bite', 'Claw'],
  hit: ['Hit'],
  death: 'Death',
  // Stunned in a control window: the dazed loop, head hanging, legs splayed.
  stunned: 'Stunned',
  cast: 'Roar',
  // Heel!: the crouch, the wiggle and the leap, slowed so the forepaws land on
  // the bar's last frame, where the sim sets it down at its master's side.
  castByAbility: { [BEAST_HEEL]: 'Pounce' },
  castTimeScaleByAbility: { [BEAST_HEEL]: heelPounceTimeScale(BEAST_TUNING.heelCast) },
  castPlayOut: ['Pounce'],
  // Call of the Hunt: the master's roar answered (a gesture off its spellfx).
  attackByAbility: { roar: 'Roar' },
  attackTimeScaleByAbility: { roar: 1 },
  flourish: 'Roar',
};

/** The Fanglord's Great Jaguar (scripts/assets/wildheart_great_jaguar, built in
 *  Blender): one sculpted skin in gold with black rosettes, Sunbone war paint,
 *  bone ornaments and the collar's jade ring the Pack Bond ties to. Drawn at
 *  its authored size, 4.7 yd to its ears at its 2.4. */
export const WILDHEART_GREAT_JAGUAR_LOOK: VisualDef = {
  url: JAGUAR_MODEL.url,
  height: jaguarLookHeight(),
  clips: GREAT_JAGUAR_CLIPS,
  castPlayOutHoldsAttacks: true,
  walkRef: JAGUAR_MODEL.walkRef * jaguarModelScale(JAGUAR_SIM_SCALE),
  runRef: JAGUAR_MODEL.runRef * jaguarModelScale(JAGUAR_SIM_SCALE),
  attackTimeScale: 1.15,
  deathTimeScale: 1,
  authoredAtlas: true,
  clickRadius: 1.8,
};

/** The basin's defs: the placeholders derived from the base rigs already in
 *  `visuals`, and the creatures with bodies of their own. */
export function wildheartPlaceholderLooks(
  visuals: Readonly<Record<string, VisualDef>>,
): Record<string, VisualDef> {
  const out: Record<string, VisualDef> = {};
  for (const [key, [base, tint, tintStrength, grow, extra]] of Object.entries(ROWS)) {
    const def = visuals[base];
    if (!def) continue;
    out[key] = { ...def, height: def.height * grow, tint, tintStrength, ...extra };
  }
  out.wildheart_great_saurian = WILDHEART_GREAT_SAURIAN_LOOK;
  out.wildheart_fanglord_jaguar = WILDHEART_GREAT_JAGUAR_LOOK;
  // The Fanglord's Whistle's spirit jaguar (combat/wildheart_trinkets.ts): the
  // great cat's jade spirit body (translucent, its rosettes burning), at the
  // size the trinket's placeholder drew so a pet never walls off a fight.
  const spiritHeight = (visuals.form_cat?.height ?? 1.9) * 0.9;
  const spiritScale = spiritHeight / JAGUAR_MODEL.idleBoundsHeight;
  out.wildheart_spirit_jaguar = {
    url: JAGUAR_MODEL.spiritUrl,
    height: spiritHeight,
    clips: GREAT_JAGUAR_CLIPS,
    castPlayOutHoldsAttacks: true,
    walkRef: JAGUAR_MODEL.walkRef * spiritScale,
    runRef: JAGUAR_MODEL.runRef * spiritScale,
    attackTimeScale: 1.15,
    clickRadius: 1.4,
  };
  // The Sunbone Totem: the shipped carved mask totem as a stationary prop
  // (about 6.4 yd at its 1.6), its bone and ochre kept, a faint inner glow.
  out.wildheart_sunbone_totem = {
    url: 'models/props/wildheart_mask_totem.glb',
    height: 4,
    clips: STATIC_TOTEM_CLIPS,
    authoredAtlas: true,
    selfIllumination: 0.18,
    clickRadius: 1.4,
  };
  return out;
}

/** Each new Wildheart template's visual key (merged into manifest MOB_KEYS). */
export const WILDHEART_MOB_KEYS: Readonly<Record<string, string>> = {
  basin_raptor: 'wildheart_basin_raptor',
  spore_toad: 'wildheart_spore_toad',
  vine_lasher: 'wildheart_vine_lasher',
  thorn_sprout: 'wildheart_thorn_sprout',
  sunbone_totem_binder: 'wildheart_totem_binder',
  sunbone_totem: 'wildheart_sunbone_totem',
  howdah_hexcaller: 'wildheart_howdah_hexcaller',
  fanglord_jaguar: 'wildheart_fanglord_jaguar',
  the_gorgebloom: 'wildheart_gorgebloom',
  great_saurian: 'wildheart_great_saurian',
};
