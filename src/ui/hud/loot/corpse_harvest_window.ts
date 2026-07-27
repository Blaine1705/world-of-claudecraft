// Thin DOM consumer for the per-corpse focus picker (#1142).
//
// Composed into hud.ts's existing loot window (openLoot) rather than a new
// window: a harvestable, unclaimed corpse gets an extra "Harvest" section
// appended below the loot rows, with one checkbox per tagged component and a
// Harvest button. It owns no state beyond the checked set it reports back
// through `onHarvest`; Hud tracks nothing extra and just re-renders the loot
// window like it already does for a plain loot-only corpse.

import { esc } from '../../esc';
import { type TranslationKey, t } from '../../i18n';
import { type CorpseHarvestViewModel, corpseHarvestView } from './corpse_harvest_view';

export interface CorpseHarvestPainterDeps {
  /** Called with the checked component tags (may be empty = spread across all). */
  onHarvest(chosen: string[]): void;
  /** The Hud's shared tooltip idiom: hover, mobile long-press, keyboard focus. */
  attachTooltip(element: HTMLElement, html: () => string): void;
}

const COMPONENT_LABEL_KEYS: Record<string, string> = {
  hide: 'hudChrome.corpseHarvest.components.hide',
  fang: 'hudChrome.corpseHarvest.components.fang',
  silk: 'hudChrome.corpseHarvest.components.silk',
  venomSac: 'hudChrome.corpseHarvest.components.venomSac',
  gills: 'hudChrome.corpseHarvest.components.gills',
  claw: 'hudChrome.corpseHarvest.components.claw',
  horn: 'hudChrome.corpseHarvest.components.horn',
  tusk: 'hudChrome.corpseHarvest.components.tusk',
  meat: 'hudChrome.corpseHarvest.components.meat',
  cloth: 'hudChrome.corpseHarvest.components.cloth',
};

/** Exported for tests only, so the label map can be pinned against the real set of
 *  componentTags used across mob content (see tests/town_focus_i18n.test.ts). */
export function componentLabel(tag: string): string {
  const key = COMPONENT_LABEL_KEYS[tag];
  return key ? t(key as TranslationKey) : tag;
}

/** Append the harvest picker section into a container (the loot window body). */
export function renderCorpseHarvestPicker(
  container: HTMLElement,
  view: CorpseHarvestViewModel,
  deps: CorpseHarvestPainterDeps,
): void {
  if (view.rows.length === 0) return;
  const document = container.ownerDocument;
  const section = document.createElement('div');
  section.className = 'corpse-harvest';
  section.innerHTML = `<div class="corpse-harvest-title">${esc(t('hudChrome.corpseHarvest.title'))}</div>
    <div class="corpse-harvest-hint">${esc(t('hudChrome.corpseHarvest.concentrateHint'))}</div>`;
  const list = document.createElement('div');
  list.className = 'corpse-harvest-list';
  for (const row of view.rows) {
    const label = document.createElement('label');
    label.className = 'corpse-harvest-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'corpse-harvest-check';
    box.checked = row.checked;
    box.value = row.tag;
    box.setAttribute(
      'aria-label',
      t('hudChrome.corpseHarvest.componentAria', { component: componentLabel(row.tag) }),
    );
    const span = document.createElement('span');
    span.textContent = componentLabel(row.tag);
    label.appendChild(box);
    label.appendChild(span);
    list.appendChild(label);
  }
  section.appendChild(list);
  // #2509: the reason a Harvest can be refused, stated in place rather than in
  // the button's tooltip. A `disabled` button takes no pointer events and
  // leaves the tab order (src/ui/focus_manager.ts), so a tooltip on it would
  // never be reachable by hover, touch, or keyboard; a line in the section is.
  // Reuses the .corpse-harvest-hint metrics via its own class so only the
  // color differs, and rides in the DOM right before the button it explains.
  const warning = document.createElement('div');
  warning.className = 'corpse-harvest-warning';
  warning.textContent = t('hudChrome.corpseHarvest.nothingSelectedYields');
  section.appendChild(warning);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn corpse-harvest-btn';
  const harvestLabel = t('hudChrome.corpseHarvest.harvestButton');
  btn.textContent = harvestLabel;
  // Attached ONCE, at build: Hud.attachTooltip registers a fresh listener set
  // per call, so re-attaching it on every toggle would stack them.
  deps.attachTooltip(btn, () => esc(t('hudChrome.corpseHarvest.harvestTooltip')));
  const chosenTags = (): string[] =>
    [...list.querySelectorAll<HTMLInputElement>('.corpse-harvest-check')]
      .filter((c) => c.checked)
      .map((c) => c.value);
  // The button state, the reason line and the accessible name all come from
  // ONE model, so they cannot drift apart. The WHY rides in the accessible
  // name as well as the visible line, the crafting-window idiom
  // (src/ui/crafting_window.ts): a reader that reaches the button through the
  // section rather than the tab order still hears it.
  const apply = (model: CorpseHarvestViewModel): void => {
    btn.disabled = model.harvestDisabled;
    warning.hidden = !model.forfeitsEveryYield;
    if (model.forfeitsEveryYield) {
      btn.setAttribute(
        'aria-label',
        `${harvestLabel}. ${t('hudChrome.corpseHarvest.nothingSelectedYields')}`,
      );
    } else {
      btn.removeAttribute('aria-label');
    }
  };
  // Initial state is the caller's model, so the view-core stays the single
  // source of the picker's decisions; every later state is that same core
  // re-run over the live checkbox set. A discrete change listener, not a
  // repeating driver: the picker is a cold window
  // (tests/hud_perf_budget.test.ts) and this handler reads no geometry, so
  // neither cold contract is touched.
  apply(view);
  list.addEventListener('change', () => {
    apply(
      corpseHarvestView(
        view.rows.map((row) => row.tag),
        new Set(chosenTags()),
      ),
    );
  });
  btn.addEventListener('click', () => {
    deps.onHarvest(chosenTags());
  });
  section.appendChild(btn);
  container.appendChild(section);
}
