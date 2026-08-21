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

## Tap mode is shared, never per menu

`settings.touchTapMenus` replaces every touch gesture menu (the action radial,
the consumables row, the menu strip) with a tap-only flow, which is what closes
WCAG 2.5.1 for the touch HUD. It must mean the same thing in all three or it is
not a mode: `tap_menu_core.ts` owns the whole table (open / choose / default /
dismiss, plus the untouched gesture path when the setting is off) and
`tap_menu.ts` owns the two host-reaching halves (the live setting read and the
capture-phase outside-dismiss listener, which is what keeps the press that
OPENED a menu from also closing it). A new gesture menu asks those two; it does
not grow a fourth dialect.

## Preservation contract

- Keep existing DOM selectors, event order, focus restoration, storage keys, and
  localization keys unchanged during extraction.
- Every player or server value interpolated into HTML passes through `esc()`.
- Hot painters use the shared `PainterHost` writers. Do not create a second write
  cache inside a domain.
- All three adapter names above are swept by the painter gate
  (`tests/hud_perf_budget.test.ts`). A `*_controller.ts` holds the same cold contract a
  `*_window.ts` does (defined in `src/ui/CLAUDE.md`): no forced-reflow layout read and no
  repeating driver of its own, beyond a documented, counted allowance. WHICH modules hold an
  allowance is never listed here: the authoritative registry is `COLD_PAINTER_ALLOWANCES` in
  that test, where every entry carries its own rationale comment and a granted driver's
  `drivers` entry declares what ONE TICK may do, counted over everything the tick reaches.
  Renaming between the adapter names sheds nothing, which is the point: name by role.
- Domain tests import the owning module directly and assert behavior, not source
  line placement.
