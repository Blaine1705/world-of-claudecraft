// i18n source catalog - seasonal events (src/sim/seasonal/): the event names, the
// trick-or-treat gossip row and its feedback lines, the tricks' names, the
// pumpkin head toggle, and the event items' use lines. The sim emits ids and
// numbers only (SimEvent 'seasonal'); every sentence the player reads is here.
// English values only; the locale translations live in src/ui/i18n.locales/.
//
// Assembled into `en` by ./index.ts under the `seasonal` namespace, with NO
// per-locale blocks (no `as const`), so an event's prose is an English-only add.

export const seasonalStrings = {
  event: {
    gourdlight_eve: {
      name: 'Gourdlight Eve',
    },
  },
  trickOrTreat: {
    row: 'Trick or treat!',
    rowAria: 'Say trick or treat to {name}',
    knockedHint: 'You already knocked here today. The door opens again after the daily reset.',
    treat: '{name} hands you a treat.',
    trick: '{name} plays a trick on you: {trick}!',
    alreadyKnocked: 'You already trick-or-treated {name} today.',
    notActive: 'Gourdlight Eve is not running right now.',
    tooFar: 'Step closer to knock.',
    // The banner flash for each outcome ({count} pre-formatted).
    treatFlash: {
      one: 'Treat! {count} Gourdlight Sweet',
      few: 'Treat! {count} Gourdlight Sweets',
      many: 'Treat! {count} Gourdlight Sweets',
      other: 'Treat! {count} Gourdlight Sweets',
    },
    trickFlash: 'Trick! {trick}',
  },
  tricks: {
    gourdlight_trick_bat: 'Batty',
    gourdlight_trick_skeleton: 'Rattled Bones',
    gourdlight_trick_fumes: 'Green Fumes',
  },
  pumpkinHead: {
    on: 'You put on the Carved Pumpkin Head.',
    off: 'You take off the Carved Pumpkin Head.',
  },
  jarTrick: 'The jar pops open: {trick}!',
  // Item tooltip "Use:" lines (the item tooltip appends them to the event items).
  itemUse: {
    pumpkinHead:
      'Use: Put on or take off a carved pumpkin lit from inside, worn over your helmet. Only during Gourdlight Eve. Cosmetic.',
    trickJar:
      'Use: Plays a random harmless trick on you for a few seconds. Only during Gourdlight Eve. Cosmetic.',
    pouch: 'Use: Open it to receive {count} Gourdlight Sweets.',
    sweet:
      'Earned by trick-or-treating during Gourdlight Eve. Hester Gourdwick in Eastbrook trades cosmetics for them.',
  },
  // The vendor row's token price: "{count} {item}" ({count} pre-formatted).
  tokenPrice: '{count} {item}',
};
