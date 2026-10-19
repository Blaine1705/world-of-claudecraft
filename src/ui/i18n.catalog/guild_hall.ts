// Lantern Hall's guild window (src/ui/hud/guild_hall/): the weekly dungeon contracts and the
// quartermaster's cosmetics. Mounted under hudChrome.guildHall (hud_chrome.ts). English only;
// the maintainer fills every locale at release.
export const guildHallStrings = {
  title: 'Lantern Hall',
  // the line under the name on the gateway's board in the yard (render/highwatch_guild_sign.ts)
  signSubtitle: "Adventurers' Guild",
  close: 'Close the guild window',
  tabsLabel: 'Lantern Hall sections',
  tabs: {
    contracts: 'Contracts',
    quartermaster: 'Quartermaster',
  },
  seals: 'Lantern Seals: {count}',
  resetIn: 'New contracts in {time}',
  resetSoon: 'New contracts at the next weekly reset',
  contractsIntro:
    'Three contracts a week, the same for every adventurer in the realm. No need to sign: see one through and its seals go straight to your bags, once each week.',
  kinds: {
    boss: 'Bounty',
    heroic: 'Heroic Clear',
    task: 'Execution',
  },
  goals: {
    boss: 'Defeat {boss} in {dungeon}, on either difficulty.',
    heroic: 'Clear {dungeon} on Heroic: defeat {boss} on Heroic difficulty.',
    task: '{task} ({dungeon})',
  },
  contractLabel: '{kind}: {dungeon}',
  // plural forms (tPlural): a locale with more categories fills its own
  reward: {
    one: '{count} Lantern Seal',
    few: '{count} Lantern Seals',
    many: '{count} Lantern Seals',
    other: '{count} Lantern Seals',
  },
  done: 'Completed this week',
  open: 'Open',
  lifetime: 'Contracts completed: {count}',
  emptyBoard: 'The board is being rewritten. Come back after the weekly reset.',
  quartermasterIntro:
    'Garrick trades Lantern Seals for honors only: titles to wear in the Book of Deeds. Nothing here makes you stronger.',
  titleOffer: 'Title: {title}',
  titlePreview: 'Shown as {preview}',
  buy: 'Buy',
  owned: 'Owned',
  needSeals: 'Needs {count} more',
  bought: 'You bought the title {title}. Choose it in the Book of Deeds.',
  refused: {
    owned: 'You already own that.',
    seals: 'You do not have enough Lantern Seals.',
    range: 'Stand at the quartermaster to trade.',
  },
  // the contract board's notices (the reworked board, guild_hall_window.ts)
  board: {
    noticesLabel: "This week's contracts",
    weekProgress: 'This week: {done} of {total} contracts complete',
    weekProgressAria: 'Contracts completed this week',
    cardProgress: '{done}/{total} this week',
    rewardLine: 'Reward: {reward}',
    stamp: 'Sealed',
    sealsTip:
      "Lantern Seals are paid for Lantern Hall's weekly contracts and spent only at Garrick Holt, the quartermaster. They are bound to you.",
  },
  // the quartermaster's counter (the reworked shop, guild_hall_window.ts)
  shop: {
    stockLabel: "Garrick Holt's stock",
    kindTitle: 'Title',
    plateHeading: 'Your nameplate',
    howTo: 'After you buy it, choose it in the Book of Deeds to show it with your name.',
    cosmetic: 'Cosmetic only: it changes no stats.',
    price: 'Price: {price}',
    have: 'You have {count}',
    ownedLong: 'You own this title. Choose it in the Book of Deeds.',
    // plural forms (tPlural): a locale with more categories fills its own
    short: {
      one: 'You need {count} more Lantern Seal.',
      few: 'You need {count} more Lantern Seals.',
      many: 'You need {count} more Lantern Seals.',
      other: 'You need {count} more Lantern Seals.',
    },
  },
  contractDone: {
    one: 'Contract complete: {contract}. You receive {count} Lantern Seal.',
    few: 'Contract complete: {contract}. You receive {count} Lantern Seals.',
    many: 'Contract complete: {contract}. You receive {count} Lantern Seals.',
    other: 'Contract complete: {contract}. You receive {count} Lantern Seals.',
  },
};
