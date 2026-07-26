# Extracted HUD domains

This tree owns cohesive HUD domains extracted from `src/ui/hud.ts`. The root
`src/ui/CLAUDE.md` remains canonical for DOM, accessibility, localization, painter,
and performance rules.

## Shape

- Each domain lives in its own directory and exposes a small public surface from
  `index.ts`.
- Pure decisions stay in `*_view.ts` or `*_core.ts`. DOM and browser adapters stay
  in controllers, windows, or painters. A controller or window that reads a browser
  global (`document`, `window`, `localStorage`, `getComputedStyle`, `Date.now`) is
  registered in `UI_DOM_MODULES` in `tests/architecture.test.ts`, or the
  classification sweep there fails; a DOM-touching helper that is neither an adapter
  nor a pure core goes in `UI_PAINTER_HELPERS` and takes that list's hard contract.
- Domain modules never import the `Hud` class. They receive narrow dependency bags
  and callbacks from the coordinator.
- `Hud` retains cross-window coordination, the shared writer caches, and the frame
  loop. A domain owns its local state, rendering, persistence, and event handling.

## Preservation contract

- Keep existing DOM selectors, event order, focus restoration, storage keys, and
  localization keys unchanged during extraction.
- Every player or server value interpolated into HTML passes through `esc()`.
- Hot painters use the shared `PainterHost` writers. Do not create a second write
  cache inside a domain.
- Of the three adapter names above, the painter gate (`tests/hud_perf_budget.test.ts`)
  sweeps two: `*_painter.ts` and `*_window.ts`. A `*_controller.ts` holds neither the
  forced-reflow nor the repeating-driver contract, and several make real layout reads
  today (`chat_geometry_controller`, `chat_window_controller`, `fiesta_controller`). So
  renaming a window to a controller drops both contracts while staying legal here: name
  by role, and if a controller owns a per-frame paint path, give it a painter name.
- Domain tests import the owning module directly and assert behavior, not source
  line placement.
