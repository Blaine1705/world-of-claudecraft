# Lantern Hall's guild window

The window the Highwatch adventurers' guild residents open (`src/sim/highwatch_guild.ts` emits
`guildHallOpen` with the resident's tab). Two tabs: the week's three dungeon contracts
(`src/sim/guild_contracts.ts`) and the quartermaster's title feats for Lantern Seals
(`src/sim/guild_quartermaster.ts`).

- `guild_hall_view.ts` is the pure view core for the window and the contract board: every
  string through `t()`, numbers through `formatNumber`, the reset countdown through
  `formatList` of Intl unit words. Each notice carries its boss's portrait URL (the dungeon
  finder's prerendered stills, `FINDER_PORTRAIT_DIR`), the week's counter (a contract pays
  once a week, so it is out of one) and the reward line; the board carries the week's tally.
- `guild_quartermaster_view.ts` is the pure view core for the counter: the stock as item cards
  (the feat's Book of Deeds crest id, price, owned / ready / short), the selected card's detail
  (the nameplate preview split by `titledNameDecoration`, the price against the bags, the buy
  action and why it is disabled) and each card's hover lines. The stock is titles only, so
  there is no model to preview and no GL context: do not add one for a title.
- Both cores are tested directly by `tests/guild_hall_view.test.ts` and registered in
  `UI_PURE_CORES` (`tests/architecture.test.ts`).
- `guild_hall_window.ts` is the thin painter (the weekly emissary window's shape): open,
  close, focus return, the tab switch, the selected stock card, a signature-gated slow-band
  repaint plus a minute tick for the clock, the hover cards through the injected
  `attachTooltip` (Hud's shared tooltip), and the buy click through `IWorld.buyGuildCosmetic`.
  It resolves the art the cores name (`iconDataUrl` for a crest, `itemImageUrl` for the seal).
- Styles live in `src/styles/components.css` under `#guild-hall-window` (the
  `lantern hall guild window` banner), every color a `--gh-*` token in `tokens.css`; the
  phone's compact board is in `hud.mobile.css` beside the weekly window's rules. The root
  element is in `index.html` and `play.html`.
- Reads the world only through IWorld members (`guildContracts`, `inventory`, `deedsEarned`,
  `weeklyQuestResetAtMs`, `player`). Never imports the Hud class.
