// Builds and wires the consumables seat: the ring's 5th arc position plus the
// row it opens (Phase 3 of the touch rework). It replaces the retired top-left
// quick bar, which was designed for mid-combat use yet sat further from the
// nearer thumb than anything else in the HUD; in the ring's own seat it is inside
// the reach the rest of combat already lives in.
//
// Extracted from Hud so the seat lands behind the action_bar seam instead of
// growing the coordinator: Hud keeps the item-use call and one per-frame paint,
// and hands this module a narrow dependency bag. Nothing here imports Hud.
//
// What it composes:
//   - createActionBarView over the seat plus the row, so the seat and the item it
//     duplicates can never disagree (slot 0 is the seat, slots 1..n the row),
//   - consumable_bar_view.ts UNCHANGED for the auto-populated list itself,
//   - the gesture layer (consumable_strip_gesture_controller.ts) and the strip
//     painter.
//
// The static markup lives in index.html / play.html (#mobile-consumable-seat,
// #mobile-consumable-strip). On a build that omits it, buildMobileConsumableSeat
// returns null and the seat silently stays unbuilt, exactly like the ring.

import { audio } from '../../../game/audio';
import type { ItemDef } from '../../../sim/types';
import { formatAbilityNumber } from '../../ability_description';
import { abilityDisplayName } from '../../ability_display_name';
import { itemDisplayName } from '../../entity_i18n';
import { formatNumber, type TranslationKey, t } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import { tapMenusEnabled } from '../tap_menu';
import type { ActionBarSlotElements } from './action_bar_painter';
import { type ActionBarWorldInput, createActionBarView } from './action_bar_view';
import { CONSUMABLE_BAR_SLOTS, consumableBarItems } from './consumable_bar_view';
import { ConsumableStripGesture } from './consumable_strip_gesture_controller';
import { ConsumableStripPainter } from './consumable_strip_painter';

const SEAT_ID = 'mobile-consumable-seat';
const STRIP_ID = 'mobile-consumable-strip';
const CANCEL_ID = 'mobile-consumable-cancel';
const ITEM_SELECTOR = '.mobile-consumable-item';
const ITEM_INDEX_DATASET = 'consumableIndex';
/** The seat's own slot label, so a screen reader names the control rather than
 *  reading a slot number the player never sees. */
const SEAT_LABEL_KEY: TranslationKey = 'hudChrome.mobile.consumableSeat';

/** Everything the seat needs from Hud, as callbacks. */
export interface MobileConsumableSeatDeps {
  writers: PainterHostWriters;
  /** Resolve a hotbar icon key to a background-image value. */
  iconBackground(iconKey: string): string;
  lookupItem(itemId: string): ItemDef | undefined;
  /** Use a carried consumable, reporting whether it actually went through (an
   *  open trade window blocks it). Routes through the SAME IWorld.useItem seam
   *  the retired quick bar used, so offline runs the sim directly and online
   *  sends the authoritative 'use' command. */
  useItem(itemId: string): boolean;
  /** The used-flash the cast path gives every other action button. */
  flash(btn: HTMLButtonElement): void;
  hideTooltip(): void;
  consumePeekGuard(): void;
}

export interface MobileConsumableSeat {
  /** Ticked and painted by Hud each frame; the row rides the same snapshot. */
  paint(world: ActionBarWorldInput): void;
  gesture: ConsumableStripGesture;
  seatBtn: HTMLButtonElement;
}

/** Mint the per-slot child nodes ActionBarPainter writes into. Build-time DOM,
 *  not a per-frame path: everything repeated goes through the painter. */
function slotElements(btn: HTMLElement): ActionBarSlotElements {
  const label = document.createElement('span');
  label.className = 'icon-label';
  const countEl = document.createElement('span');
  countEl.className = 'item-count';
  const keybindEl = document.createElement('span');
  keybindEl.className = 'keybind';
  const cdOverlay = document.createElement('div');
  cdOverlay.className = 'cd-overlay';
  const cdText = document.createElement('div');
  cdText.className = 'cdtext';
  const rechargeOverlay = document.createElement('div');
  rechargeOverlay.className = 'recharge-overlay';
  btn.append(label, countEl, keybindEl, cdOverlay, rechargeOverlay, cdText);
  return { btn, label, countEl, keybindEl, cdOverlay, cdText, rechargeOverlay };
}

/** Build the seat, or return null when the markup is absent. */
export function buildMobileConsumableSeat(
  deps: MobileConsumableSeatDeps,
): MobileConsumableSeat | null {
  const seatBtn = document.getElementById(SEAT_ID) as HTMLButtonElement | null;
  const strip = document.getElementById(STRIP_ID);
  const cancel = document.getElementById(CANCEL_ID);
  const itemBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR)).sort(
    (a, b) =>
      Number(a.dataset[ITEM_INDEX_DATASET] ?? 0) - Number(b.dataset[ITEM_INDEX_DATASET] ?? 0),
  );
  if (!seatBtn || !strip || !cancel || itemBtns.length !== CONSUMABLE_BAR_SLOTS) return null;

  // The ONE reused array the pure core fills. It is FROZEN while the row is open
  // so an item never shifts out from under the thumb travelling toward it (a
  // depleted stack stays in place, greyed at count 0, exactly like a desktop bar
  // item shortcut), and refreshed on every closed frame so the seat always shows
  // what the player is actually carrying.
  const ids: string[] = [];

  const view = createActionBarView(
    {
      slots: [
        {
          slotIndex: 0,
          isAttack: () => false,
          hasAction: () => ids[0] !== undefined,
          ability: () => null,
          item: () => itemAt(deps, ids, 0),
          keybindLabel: () => '',
        },
        ...Array.from({ length: CONSUMABLE_BAR_SLOTS }, (_, i) => ({
          slotIndex: i + 1,
          isAttack: () => false,
          hasAction: () => ids[i] !== undefined,
          ability: () => null,
          item: () => itemAt(deps, ids, i),
          keybindLabel: () => '',
        })),
      ],
    },
    {
      t,
      abilityName: abilityDisplayName,
      itemName: itemDisplayName,
      slotLabel: (i) => (i === 0 ? t(SEAT_LABEL_KEY) : formatAbilityNumber(i)),
      formatCount: (n) => formatNumber(n, { maximumFractionDigits: 0 }),
    },
  );

  const painter = new ConsumableStripPainter(
    deps.writers,
    { strip, cancel, seat: slotElements(seatBtn), items: itemBtns.map(slotElements) },
    (iconKey) => deps.iconBackground(iconKey),
  );

  const gesture = new ConsumableStripGesture({
    seat: seatBtn,
    // The row's geometry tokens live on the overlay, which is a sibling of the
    // ring so its items are seated in viewport coordinates rather than inside
    // the ring's own scaled, corner-anchored box.
    metricsHost: strip,
    items: itemBtns,
    cancel,
    tapMenus: () => tapMenusEnabled(),
    count: () => ids.length,
    use: (index) => {
      const id = ids[index];
      if (id === undefined) return;
      deps.consumePeekGuard();
      deps.hideTooltip();
      audio.click();
      if (deps.useItem(id)) deps.flash(seatBtn);
      seatBtn.blur();
    },
    onCancel: () => {
      deps.consumePeekGuard();
      deps.hideTooltip();
    },
  });
  gesture.attach();

  return {
    paint(world: ActionBarWorldInput): void {
      if (!gesture.isOpen()) {
        consumableBarItems(world.inventory, (id) => deps.lookupItem(id), ids);
      }
      painter.paint(view.tick(world), gesture.openState());
    },
    gesture,
    seatBtn,
  };
}

function itemAt(deps: MobileConsumableSeatDeps, ids: readonly string[], i: number): ItemDef | null {
  const id = ids[i];
  return id === undefined ? null : (deps.lookupItem(id) ?? null);
}
