// Gourdlight Eve: the autumn seasonal event (data only). The rules live in
// src/sim/seasonal/ (the reusable seasonal-event core); this file only says WHAT
// the event offers: its keeper, the townsfolk who answer a trick-or-treat, the
// treats and tricks, the small shop, and the daily rounds quest.
//
// Everything here is cosmetic. The currency buys looks and toys, never power: no
// stat, no consumable that heals or buffs, nothing a fight can read.
//
// WHEN the event runs is not data here and never a clock in the sim: the
// authoritative server owns the window (server/seasonal_calendar.ts) and feeds the
// active event id into the sim each tick; offline and headless worlds stay off
// unless `/dev season on` opens it.
import type { ItemDef, NpcDef, QuestDef } from '../types';

export const GOURDLIGHT_EVE_ID = 'gourdlight_eve';

/** The event currency: a wrapped harvest sweet. Stacks deep, bound to the earner. */
export const GOURDLIGHT_SWEET_ID = 'gourdlight_sweet';
export const GOURDLIGHT_TREAT_POUCH_ID = 'gourdlight_treat_pouch';
export const CARVED_PUMPKIN_HEAD_ID = 'carved_pumpkin_head';
export const JAR_OF_MISCHIEF_ID = 'jar_of_mischief';

/** The worn head cosmetic's aura id (and the render key it draws by). */
export const PUMPKIN_HEAD_AURA_ID = 'gourdlight_pumpkin_head';

/** The daily rounds quest the keeper hands out. */
export const GOURDLIGHT_ROUNDS_QUEST_ID = 'q_gourdlight_rounds';
/** The quest-event id a trick-or-treat credits (QuestObjective type 'event'). */
export const TRICK_OR_TREAT_QUEST_EVENT = 'gourdlight_trick_or_treat';
/** Doors the daily rounds ask for. */
export const GOURDLIGHT_ROUNDS_DOORS = 5;
/** Sweets the rounds pouch holds. */
export const GOURDLIGHT_POUCH_SWEETS = 6;

/** The trick-or-treat outcome table. A treat hands over sweets; a trick plays a
 *  short harmless cosmetic transformation and still leaves one sweet in the
 *  bag, so a knock is never wasted. `treatChance` is the share of treats. */
export const TRICK_OR_TREAT = Object.freeze({
  treatChance: 0.65,
  treatSweets: 2,
  trickSweets: 1,
  /** Reach to the townsfolk, the same as an ordinary talk. */
  range: 7,
});

/** The tricks: each a short cosmetic aura (seconds). Ids are aura ids; the client
 *  draws bat and skeleton as a body swap (the polymorph slot's look, never its CC)
 *  and the fumes as a green smoke cloud. None has any effect in the sim. */
export const GOURDLIGHT_TRICKS = Object.freeze([
  { id: 'gourdlight_trick_bat', name: 'Batty', duration: 20 },
  { id: 'gourdlight_trick_skeleton', name: 'Rattled Bones', duration: 20 },
  { id: 'gourdlight_trick_fumes', name: 'Green Fumes', duration: 12 },
] as const);
export type GourdlightTrickId = (typeof GOURDLIGHT_TRICKS)[number]['id'];

/** The townsfolk who answer a knock, by main city. Ids are NPC template ids, so a
 *  rework that moves a building moves the NPC with it; tests/gourdlight_eve.test.ts
 *  pins that every id exists and still stands in its city. */
export const TRICK_OR_TREAT_NPCS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  eastbrook_vale: [
    'trader_wilkes',
    'apothecary_lin',
    'smith_haldren',
    'fisherman_brandt',
    'cook_marlow',
    'farmer_jessica',
  ],
  mirefen_marsh: [
    'provisioner_hale',
    'herbalist_yara',
    'tanner_hesk',
    'farmer_teasel',
    'warden_fenwick',
  ],
  thornpeak_heights: [
    'quartermaster_bree',
    'armorer_hode',
    'alchemist_verane',
    'loremaster_caddis',
    'farmer_hollis',
  ],
});

/** Every trick-or-treat NPC template id, flat. */
export const TRICK_OR_TREAT_NPC_IDS: ReadonlySet<string> = new Set(
  Object.values(TRICK_OR_TREAT_NPCS).flat(),
);

/** The keeper's reserved singleton entity id (types.ts
 *  STATIC_WORLD_SERVICE_ENTITY_ID_MIN's note; pinned in
 *  tests/reserved_singleton_entity_ids.test.ts). She stands only while the event
 *  runs, spawned and removed by src/sim/seasonal/seasonal_tick.ts. */
export const GOURDLIGHT_KEEPER_ENTITY_ID = 1_000_000_066;
export const GOURDLIGHT_KEEPER_NPC_ID = 'gourdlight_keeper';

/** The keeper's shop: price in sweets per purchase (ItemDef.priceItem). */
export const GOURDLIGHT_SHOP_PRICES: Readonly<Record<string, number>> = Object.freeze({
  [CARVED_PUMPKIN_HEAD_ID]: 40,
  [JAR_OF_MISCHIEF_ID]: 3,
});

export const GOURDLIGHT_KEEPER_NPC: NpcDef = {
  id: GOURDLIGHT_KEEPER_NPC_ID,
  name: 'Hester Gourdwick',
  title: 'Gourdlight Keeper',
  // Eastbrook's square, on the open flags south of the market stalls.
  pos: { x: -11.5, z: -108.5 },
  facing: Math.PI,
  color: 0xd9741c,
  questIds: [GOURDLIGHT_ROUNDS_QUEST_ID],
  vendorItems: [CARVED_PUMPKIN_HEAD_ID, JAR_OF_MISCHIEF_ID],
  dynamic: true,
  seasonalKeeper: true,
  greeting:
    'The gourds are lit and the lanterns are up, so it must be Gourdlight Eve. Knock on the doors of the townsfolk in Eastbrook, Fenbridge and Highwatch, and say the words: trick or treat. Most will hand you a sweet. A few will play a trick on you. Bring the sweets to me and I will trade you something to wear.',
};

export const GOURDLIGHT_EVE_NPCS: Record<string, NpcDef> = {
  [GOURDLIGHT_KEEPER_NPC_ID]: GOURDLIGHT_KEEPER_NPC,
};

export const GOURDLIGHT_EVE_ITEMS: Record<string, ItemDef> = {
  [GOURDLIGHT_SWEET_ID]: {
    id: GOURDLIGHT_SWEET_ID,
    name: 'Gourdlight Sweet',
    kind: 'tool',
    quality: 'uncommon',
    stackSize: 200,
    sellValue: 0,
    soulbound: true,
    noVendorSell: true,
    noSalvage: true,
  },
  [GOURDLIGHT_TREAT_POUCH_ID]: {
    id: GOURDLIGHT_TREAT_POUCH_ID,
    name: 'Gourdlight Treat Pouch',
    kind: 'tool',
    quality: 'uncommon',
    use: { type: 'container', container: 'gourdlight_pouch' },
    stackSize: 10,
    sellValue: 0,
    soulbound: true,
    noVendorSell: true,
    noSalvage: true,
  },
  [CARVED_PUMPKIN_HEAD_ID]: {
    id: CARVED_PUMPKIN_HEAD_ID,
    name: 'Carved Pumpkin Head',
    kind: 'tool',
    quality: 'rare',
    use: { type: 'seasonal', action: 'pumpkinHead' },
    priceItem: {
      itemId: GOURDLIGHT_SWEET_ID,
      count: GOURDLIGHT_SHOP_PRICES[CARVED_PUMPKIN_HEAD_ID],
    },
    unique: true,
    sellValue: 0,
    soulbound: true,
    noVendorSell: true,
    noSalvage: true,
  },
  [JAR_OF_MISCHIEF_ID]: {
    id: JAR_OF_MISCHIEF_ID,
    name: 'Jar of Mischief',
    kind: 'tool',
    quality: 'uncommon',
    use: { type: 'seasonal', action: 'trickJar' },
    priceItem: { itemId: GOURDLIGHT_SWEET_ID, count: GOURDLIGHT_SHOP_PRICES[JAR_OF_MISCHIEF_ID] },
    stackSize: 20,
    sellValue: 0,
    soulbound: true,
    noVendorSell: true,
    noSalvage: true,
  },
};

const ROUNDS_REWARD: QuestDef['itemRewards'] = {
  warrior: GOURDLIGHT_TREAT_POUCH_ID,
  paladin: GOURDLIGHT_TREAT_POUCH_ID,
  hunter: GOURDLIGHT_TREAT_POUCH_ID,
  rogue: GOURDLIGHT_TREAT_POUCH_ID,
  priest: GOURDLIGHT_TREAT_POUCH_ID,
  shaman: GOURDLIGHT_TREAT_POUCH_ID,
  mage: GOURDLIGHT_TREAT_POUCH_ID,
  warlock: GOURDLIGHT_TREAT_POUCH_ID,
  druid: GOURDLIGHT_TREAT_POUCH_ID,
};

export const GOURDLIGHT_EVE_QUESTS: Record<string, QuestDef> = {
  [GOURDLIGHT_ROUNDS_QUEST_ID]: {
    id: GOURDLIGHT_ROUNDS_QUEST_ID,
    name: 'Gourdlight Rounds',
    giverNpcId: GOURDLIGHT_KEEPER_NPC_ID,
    turnInNpcId: GOURDLIGHT_KEEPER_NPC_ID,
    text: 'Every Gourdlight Eve the children of the Vale make their rounds, and this year you are joining them, $N. Knock on five doors in our towns, say the words, and see what you are given. Come back to me when you are done.',
    completionText:
      'Five doors and you still have all your fingers. Here, a pouch of sweets for the walk home. Come back tomorrow, the doors open again.',
    objectives: [
      {
        type: 'event',
        eventId: TRICK_OR_TREAT_QUEST_EVENT,
        count: GOURDLIGHT_ROUNDS_DOORS,
        label: 'Doors knocked on',
      },
    ],
    xpReward: 0,
    copperReward: 0,
    itemRewards: ROUNDS_REWARD,
    repeatable: true,
    dailyReset: true,
    seasonalEvent: GOURDLIGHT_EVE_ID,
    shareable: false,
  },
};
