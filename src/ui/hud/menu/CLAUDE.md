<!-- src/ui/hud/menu/: the touch menu control (one seat + a nine-item strip).
     Presentation and input only. Don't repeat root / src/ui / src/ui/hud
     CLAUDE.md, reference them. -->

# src/ui/hud/menu/: the touch menu control

One gesture control replacing the old five-button touch row (Chat, Social,
Quests, Settings, More). A tap runs the default action (chat); a hold or a
rightward swipe opens the nine-item strip: Mount, Map, Bags, Social, Quests,
Character, Spells, Settings, More.

## Load-bearing rules

- **The roster order IS the design.** It is sorted by how often a player reaches
  for it, because swipe distance is the cost. Mount leads it (issue #2739). Do
  not reorder `MENU_STRIP_ITEMS` for tidiness.
- **Nothing here implements an action.** Every strip item is a real `<button>`
  the touch HUD already binds (`mobile_controls.ts`), so a pick activates that
  button and the existing handler runs. Adding an action means adding its button
  and its binding, never a callback that duplicates the handler.
- **The caption reuses the tooltip chrome.** `.panel` for the box and `.tt-title`
  for the text, which is why those `.tt-title` metrics are lifted out of the
  `#tooltip` id scope in `hud.css`. Never ship a second copy of them.
- **One caption, never nine labels.** Nine 8px captions at this pitch collide and
  clip, and they name eight things the player is not choosing.

## Shape

| File | What it is |
|---|---|
| `menu_strip_core.ts` | PURE. Roster, release rules, reveal rule, caption clamp. Registered in `UI_PURE_CORES`. |
| `menu_strip_gesture_controller.ts` | Pointer capture, the reveal timer, ONE anchor measure per gesture, the window release backstop, and the sticky (assistive / Phase 6 tap mode) path. |
| `menu_strip_painter.ts` | Thin painter: item seating, live highlight, caption text and position. Takes no layout read. |
| `menu_control_controller.ts` | Builds it from the static markup and routes picks to the real buttons. |

Geometry is reused from `../action_bar/radial_action_core.ts`
(`placeConsumableStrip`, `resolveStripIndex`): the menu strip and the consumables
row are the same shape mirrored, so there is one tested implementation.

## Seating

Static seating is CSS (`src/styles/hud.mobile.css`, per tier): the anchor sits on
the action ring's Jump line so the bottom of the HUD reads as one row. Only the
strip's own item positions are measured, because they depend on where the anchor
actually is and are edge-clamped against the shared app-viewport box (`--app-vw`),
never `window.innerWidth`.
