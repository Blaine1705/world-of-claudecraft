# Lantern Hall's guild window

The window the Highwatch adventurers' guild residents open (`src/sim/highwatch_guild.ts` emits
`guildHallOpen` with the resident's tab). Two tabs: the week's three dungeon contracts
(`src/sim/guild_contracts.ts`) and the quartermaster's title feats for Lantern Seals
(`src/sim/guild_quartermaster.ts`).

- `guild_hall_view.ts` is the pure view core: every string through `t()`, numbers through
  `formatNumber`, the reset countdown through `formatList` of Intl unit words. Tested
  directly by `tests/guild_hall_view.test.ts`.
- `guild_hall_window.ts` is the thin painter (the weekly emissary window's shape): open,
  close, focus return, the tab switch, a signature-gated slow-band repaint plus a minute
  tick for the clock, and the buy click through `IWorld.buyGuildCosmetic`.
- Styles live in `src/styles/components.css` under `#guild-hall-window`; the root element is
  in `index.html` and `play.html`.
- Reads the world only through IWorld members (`guildContracts`, `inventory`, `deedsEarned`,
  `weeklyQuestResetAtMs`, `player`). Never imports the Hud class.
