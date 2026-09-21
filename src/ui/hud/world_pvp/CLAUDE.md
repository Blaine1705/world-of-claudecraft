# src/ui/hud/world_pvp - the World PvP tab of the merged PvP window

The `/pvp` flag's HUD surface: the fourth tab of the window on `G`
(`src/ui/arena_window.ts` composes it beside Thornhollow Fields and the two
ranked brackets). Same recipe as `src/ui/hud/battleground/`: one pure view
core plus one thin painter, behind this barrel.

- `world_pvp_window_view.ts`: the pure core (registered in `UI_PURE_CORES`).
  Turns `IWorld.worldPvpInfo` + the honor balance + the window's confirm-step
  flag into ids and numbers: the status (up / down / disarming with the
  remaining clock), the one action the panel offers (`enable`, `disable`,
  `keepUp`, `locked`), the resolved stakes (`WORLD_PVP_STAKES`, read from
  `src/sim/pvp/world_pvp_rules.ts` so a retune never strands the copy), and
  the render-skip signature. DOM-free, i18n-free.
- `world_pvp_panel.ts`: the painter. Localizes the view through
  `hudChrome.worldPvp.*` (plus `hudChrome.warfare.balance` for the honor row)
  and wires the buttons back through `IWorld.setWorldPvpFlag`. The raise is a
  two-step confirm (the flag exposes the player to a gold stake); the confirm
  flag itself is window state so a tab switch or close clears it.
- The other player's flag is never read here: it rides `Entity.pvpFlag` and is
  the nameplate / target-frame / auto-attack gate's business
  (`src/sim/pvp/world_pvp_rules.ts` `worldPvpPairHostile`).

Cover changes in `tests/world_pvp_view.test.ts` (the core and the markup) and
`tests/pvp_tabs_view.test.ts` (the tab never pins or locks).
