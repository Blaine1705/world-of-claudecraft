// Gourdlight Eve: the autumn seasonal event (data only). The rules live in
// src/sim/seasonal/ (the reusable seasonal-event core); this file only says WHAT
// the event offers: its keeper, the townsfolk who answer a trick-or-treat, the
// treats and tricks, the small shop, and the daily rounds quest.
//
// Almost everything here is cosmetic: looks, toys and titles. The one exception is
// the candy shelf (GOURDLIGHT_CANDIES): five sweets that are ordinary Well Fed
// food, a 1:1 mirror of the cooking ladder's ENTRY rung (Eastbrook Glazed Carrots:
// 90 health over the 18s sit, +2 of one stat for ten minutes, under the one shared
// well_fed aura id), so they never outrank anything a cook can make.
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

/** The reins of a hovering broom (content/mounts.ts 'emberbristle_broom'), sold by
 *  Hester for Emberwoven Sheaves. Event-bound (ItemDef.seasonalEvent): it lives in the
 *  bags only while Gourdlight Eve runs and is swept away when the event closes. */
export const GOURDLIGHT_BROOM_ID = 'reins_emberbristle_broom';
export const GOURDLIGHT_BROOM_MOUNT = 'emberbristle_broom';

/** The broom's token: a bundle of enchanted straw Old Thatchgrin pays once a day (his
 *  world-boss daily lockout, content/gourdlight_eve_scarecrow.ts loot), never to a
 *  character who already keeps the broom. Event-bound like the broom, so a sheaf left
 *  over when the event closes crumbles with it. */
export const GOURDLIGHT_SHEAF_ID = 'emberwoven_sheaf';
/** Sheaves Hester asks for the broom: five daily kills (owner direction 2026-10-18: the
 *  broom takes five days of a roughly two-week event, not one kill). */
export const GOURDLIGHT_BROOM_SHEAVES = 5;

/** The costume draughts: drink one and wear a skeleton's, a ghost's or a bat's body for
 *  ten minutes. A look only (a seasonal_cosmetic aura the client draws as a body swap,
 *  the tricks' own path), and like every trick body it never fights: refused in combat,
 *  and combat starting ends it (seasonal/seasonal_tick.ts). */
export const GOURDLIGHT_COSTUMES = Object.freeze([
  {
    itemId: 'rattlebone_draught',
    itemName: 'Rattlebone Draught',
    auraId: 'gourdlight_costume_skeleton',
    name: 'Skeleton Costume',
    duration: 600,
  },
  {
    itemId: 'haunting_draught',
    itemName: 'Haunting Draught',
    auraId: 'gourdlight_costume_ghost',
    name: 'Ghost Costume',
    duration: 600,
  },
  {
    itemId: 'batwing_draught',
    itemName: 'Fluttering Draught',
    auraId: 'gourdlight_costume_bat',
    name: 'Bat Costume',
    duration: 600,
  },
] as const);
export type GourdlightCostume = (typeof GOURDLIGHT_COSTUMES)[number];

/** The title writs: read one and the title is yours for good (a Book of Deeds Feat
 *  with a title reward, content/deeds.ts). Bought with sweets, never earned power. */
export const GOURDLIGHT_TITLE_WRITS = Object.freeze([
  {
    itemId: 'writ_of_the_gourdlit',
    itemName: 'Writ of the Gourdlit',
    deedId: 'feat_title_gourdlit',
    title: 'the Gourdlit',
  },
  {
    itemId: 'writ_of_the_trickster',
    itemName: 'Writ of the Trickster',
    deedId: 'feat_title_trickster',
    title: 'Trickster',
  },
  {
    itemId: 'writ_of_the_hollow_grin',
    itemName: 'Writ of the Hollow Grin',
    deedId: 'feat_title_hollow_grinned',
    title: 'the Hollow-Grinned',
  },
] as const);
export type GourdlightTitleWrit = (typeof GOURDLIGHT_TITLE_WRITS)[number];

/** Hester's candy shelf: five sweets, each ordinary Well Fed food (kind 'food', the
 *  18s sit-restore, the buff minted when the meal completes, the one shared
 *  'well_fed' id so the newest meal replaces the last). Every number is the cooking
 *  ladder's entry rung verbatim (content/profession_items.ts eastbrook_glazed_carrots:
 *  foodHp 90, +2, 600s), one candy per primary stat, so none outranks a crafted
 *  dish; the price is a sweet or two above the Jar of Mischief. */
export const GOURDLIGHT_CANDY_RUNG = Object.freeze({ foodHp: 90, value: 2, duration: 600 });
export const GOURDLIGHT_CANDIES = Object.freeze([
  { itemId: 'hearthroot_toffee', itemName: 'Hearthroot Toffee', kind: 'buff_sta', price: 3 },
  { itemId: 'gourdseed_brittle', itemName: 'Gourdseed Brittle', kind: 'buff_str', price: 3 },
  { itemId: 'crabapple_chew', itemName: 'Crabapple Chew', kind: 'buff_agi', price: 3 },
  { itemId: 'owlwatch_fudge', itemName: 'Owlwatch Fudge', kind: 'buff_int', price: 3 },
  { itemId: 'lantern_mint_drop', itemName: 'Lantern Mint Drop', kind: 'buff_spi', price: 3 },
] as const);
export type GourdlightCandy = (typeof GOURDLIGHT_CANDIES)[number];

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

/** The keeper's reserved singleton entity ids (types.ts
 *  STATIC_WORLD_SERVICE_ENTITY_ID_MIN's note; pinned in
 *  tests/reserved_singleton_entity_ids.test.ts). Hester keeps a stall in each of the
 *  three main cities, one entity per city under the one NPC template, so her quest, her
 *  shop and her name are the same wherever a player meets her. She stands only while
 *  the event runs, spawned and removed by src/sim/seasonal/seasonal_tick.ts. */
export const GOURDLIGHT_KEEPER_ENTITY_ID = 1_000_000_066;
export const GOURDLIGHT_KEEPER_FENBRIDGE_ENTITY_ID = 1_000_000_067;
export const GOURDLIGHT_KEEPER_HIGHWATCH_ENTITY_ID = 1_000_000_068;
export const GOURDLIGHT_KEEPER_NPC_ID = 'gourdlight_keeper';

/** One of the keeper's stalls: the city it dresses, the entity that works it, and the
 *  spot she PREFERS (her standing spot behind the counter, and the way she faces). The
 *  spot is only a preference: src/sim/seasonal_keeper_posts.ts checks the stall's whole
 *  footprint against the live city and, when a rework has built over it, walks out in
 *  rings until the stall fits, so a moved building moves her stall instead of burying it. */
export interface GourdlightKeeperPost {
  id: string;
  zoneId: string;
  entityId: number;
  pos: { x: number; z: number };
  facing: number;
}

export const GOURDLIGHT_KEEPER_POSTS: readonly GourdlightKeeperPost[] = Object.freeze([
  // Eastbrook's square, on the open ground east of the road past the statue, facing
  // west across it.
  {
    id: 'eastbrook',
    zoneId: 'eastbrook_vale',
    entityId: GOURDLIGHT_KEEPER_ENTITY_ID,
    pos: { x: -4.2, z: -110.5 },
    facing: -Math.PI / 2,
  },
  // Fenbridge: on the open green where the Eastbrook road comes into town, west of the
  // road, facing the arrivals across it (the market lane between the houses had no room
  // to stand and put the camera inside the walls: owner note 2026-10-18).
  {
    id: 'fenbridge',
    zoneId: 'mirefen_marsh',
    entityId: GOURDLIGHT_KEEPER_FENBRIDGE_ENTITY_ID,
    pos: { x: -8, z: 266 },
    facing: (Math.PI * 5) / 8,
  },
  // Highwatch: the square's west side, facing east across it (two yards south of the
  // first spot, where the booth clears the house on its north side and her customers'
  // apron and the camera lane stay open: the room rule, seasonal_decor_stall.ts).
  {
    id: 'highwatch',
    zoneId: 'thornpeak_heights',
    entityId: GOURDLIGHT_KEEPER_HIGHWATCH_ENTITY_ID,
    pos: { x: -8.47, z: 656.05 },
    facing: Math.PI / 2,
  },
]);

/** The keeper's shop: price in sweets per purchase (ItemDef.priceItem). */
// Daily income is about 20 to 25 sweets (the rounds pouch, the knocks, his sack), so a
// draught is half a day and a title three to five days of rounds.
// The Carved Pumpkin Head is not on the shelf: Old Thatchgrin's first-kill drop is its
// only source (owner direction 2026-10-18, content/gourdlight_eve_scarecrow.ts loot).
export const GOURDLIGHT_SHOP_PRICES: Readonly<Record<string, number>> = Object.freeze({
  [JAR_OF_MISCHIEF_ID]: 3,
  rattlebone_draught: 10,
  haunting_draught: 10,
  batwing_draught: 10,
  writ_of_the_gourdlit: 60,
  writ_of_the_trickster: 80,
  writ_of_the_hollow_grin: 100,
  ...Object.fromEntries(GOURDLIGHT_CANDIES.map((c) => [c.itemId, c.price])),
});

/** What the keeper sells, in shelf order. Every row costs sweets except the broom,
 *  which costs Emberwoven Sheaves (GOURDLIGHT_BROOM_SHEAVES). */
export const GOURDLIGHT_SHOP_ITEMS: readonly string[] = Object.freeze([
  JAR_OF_MISCHIEF_ID,
  ...GOURDLIGHT_CANDIES.map((c) => c.itemId),
  ...GOURDLIGHT_COSTUMES.map((c) => c.itemId),
  ...GOURDLIGHT_TITLE_WRITS.map((w) => w.itemId),
  GOURDLIGHT_BROOM_ID,
]);

export const GOURDLIGHT_KEEPER_NPC: NpcDef = {
  id: GOURDLIGHT_KEEPER_NPC_ID,
  name: 'Hester Gourdwick',
  title: 'Gourdlight Keeper',
  // Her Eastbrook post (GOURDLIGHT_KEEPER_POSTS[0]); the other cities' entities take
  // their own spots from the post table, never from here.
  pos: { x: -4.2, z: -110.5 },
  facing: -Math.PI / 2,
  color: 0xd9741c,
  questIds: [GOURDLIGHT_ROUNDS_QUEST_ID],
  vendorItems: [...GOURDLIGHT_SHOP_ITEMS],
  dynamic: true,
  seasonalKeeper: true,
  greeting:
    'The gourds are lit and the lanterns are up, so it must be Gourdlight Eve. Knock on the doors of the townsfolk in Eastbrook, Fenbridge and Highwatch, and say the words: trick or treat. Most will hand you a sweet. A few will play a trick on you. Bring the sweets to me, at any of my stalls, and I will trade you something to wear.',
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
  [GOURDLIGHT_SHEAF_ID]: {
    id: GOURDLIGHT_SHEAF_ID,
    name: 'Emberwoven Sheaf',
    kind: 'tool',
    quality: 'rare',
    seasonalEvent: GOURDLIGHT_EVE_ID,
    stackSize: 10,
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
    // No price: never sold. Old Thatchgrin's first-kill drop is the one source.
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
  ...Object.fromEntries(
    GOURDLIGHT_COSTUMES.map((c): [string, ItemDef] => [
      c.itemId,
      {
        id: c.itemId,
        name: c.itemName,
        kind: 'tool',
        quality: 'uncommon',
        use: { type: 'seasonal', action: 'costume' },
        priceItem: { itemId: GOURDLIGHT_SWEET_ID, count: GOURDLIGHT_SHOP_PRICES[c.itemId] },
        stackSize: 20,
        sellValue: 0,
        soulbound: true,
        noVendorSell: true,
        noSalvage: true,
      },
    ]),
  ),
  ...Object.fromEntries(
    GOURDLIGHT_CANDIES.map((c): [string, ItemDef] => [
      c.itemId,
      {
        id: c.itemId,
        name: c.itemName,
        kind: 'food',
        quality: 'common',
        foodHp: GOURDLIGHT_CANDY_RUNG.foodHp,
        wellFed: {
          aura: 'Well Fed',
          kind: c.kind,
          value: GOURDLIGHT_CANDY_RUNG.value,
          duration: GOURDLIGHT_CANDY_RUNG.duration,
        },
        priceItem: { itemId: GOURDLIGHT_SWEET_ID, count: GOURDLIGHT_SHOP_PRICES[c.itemId] },
        stackSize: 20,
        sellValue: 0,
        soulbound: true,
        noVendorSell: true,
        noSalvage: true,
      },
    ]),
  ),
  ...Object.fromEntries(
    GOURDLIGHT_TITLE_WRITS.map((w): [string, ItemDef] => [
      w.itemId,
      {
        id: w.itemId,
        name: w.itemName,
        kind: 'tool',
        quality: 'epic',
        use: { type: 'seasonal', action: 'titleWrit' },
        priceItem: { itemId: GOURDLIGHT_SWEET_ID, count: GOURDLIGHT_SHOP_PRICES[w.itemId] },
        unique: true,
        sellValue: 0,
        soulbound: true,
        noVendorSell: true,
        noSalvage: true,
      },
    ]),
  ),
  // Hester's broom, bought for five Emberwoven Sheaves (Old Thatchgrin's daily token):
  // the one soulbound player mount, because it is EVENT-BOUND (swept when Gourdlight
  // Eve closes), and a tradable copy could outlive its event in another player's bags.
  [GOURDLIGHT_BROOM_ID]: {
    id: GOURDLIGHT_BROOM_ID,
    name: 'Emberbristle Broom',
    kind: 'mount',
    mount: GOURDLIGHT_BROOM_MOUNT,
    priceItem: { itemId: GOURDLIGHT_SHEAF_ID, count: GOURDLIGHT_BROOM_SHEAVES },
    // the card's tier (content/mounts.ts emberbristle_broom: the base horse's 60%)
    quality: 'common',
    seasonalEvent: GOURDLIGHT_EVE_ID,
    unique: true,
    soulbound: true,
    noDiscard: true,
    noVendorSell: true,
    noSalvage: true,
    sellValue: 0,
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
