import { ABILITIES } from '../sim/content/classes';
import type { PlayerClass } from '../sim/types';
import { abilityDisplayName } from './ability_display_name';
import type { AuraOverlayConfig, AuraOverlayPatch } from './aura_overlay_config';
import type { AuraOverlayPart } from './aura_overlay_controller';
import type { WarriorProcDef, WarriorProcId } from './aura_overlay_view';
import { classDisplayName } from './entity_i18n';
import type { FocusTrapHandle } from './focus_manager';
import { formatNumber, t } from './i18n';
import { iconDataUrl } from './icons';
import { colorControl, settingsCard, sliderControl, toggleControl } from './settings_controls';

export interface AuraOverlayHooks {
  playerClass(): PlayerClass;
  defs(): readonly WarriorProcDef[];
  get(id: WarriorProcId): AuraOverlayConfig;
  patch(id: WarriorProcId, patch: AuraOverlayPatch): void;
  reset(id: WarriorProcId): void;
  nudge(id: WarriorProcId, part: AuraOverlayPart, deltaX: number, deltaY: number): void;
  setAll(enabled: boolean): void;
  beginPlacement(id: WarriorProcId, part: AuraOverlayPart): void;
  endPlacement(): void;
  setPlacement(on: boolean): void;
  onPositionChange(listener: (id: WarriorProcId, config: AuraOverlayConfig) => void): () => void;
  onPlacementChange(listener: (id: WarriorProcId, part: AuraOverlayPart) => void): () => void;
}

export interface AuraOverlaySettingsHost {
  auras: AuraOverlayHooks;
  click(): void;
  openFocusTrap(root: () => HTMLElement, returnFocusTo: HTMLElement): FocusTrapHandle;
}

const percent = (value: number): string =>
  formatNumber(value, { style: 'percent', maximumFractionDigits: 0 });

export class AuraOverlaySettingsPanel {
  private placementToolbar: HTMLElement | null = null;
  private placementMenu: HTMLElement | null = null;
  private placementFocus: FocusTrapHandle | null = null;
  private placementSelectionUnsubscribe: (() => void) | null = null;

  constructor(private readonly host: AuraOverlaySettingsHost) {}

  render(parent: HTMLElement): void {
    const hooks = this.host.auras;
    parent.replaceChildren();

    const intro = document.createElement('div');
    intro.className = 'aura-settings-intro';
    const classLabel = document.createElement('strong');
    classLabel.textContent = t('hudChrome.auraOverlay.currentClass', {
      class: classDisplayName(hooks.playerClass()),
    });
    const hint = document.createElement('span');
    hint.textContent = t('hudChrome.auraOverlay.previewHint');
    intro.append(classLabel, hint);
    parent.appendChild(intro);

    const defs = hooks.defs();
    if (defs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'set-note';
      empty.textContent = t('hudChrome.auraOverlay.noProcs');
      parent.appendChild(empty);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'aura-bulk-actions';
    const allOn = document.createElement('button');
    allOn.type = 'button';
    allOn.className = 'btn aura-all-on';
    allOn.textContent = t('hudChrome.auraOverlay.allOn');
    const allOff = document.createElement('button');
    allOff.type = 'button';
    allOff.className = 'btn aura-all-off';
    allOff.textContent = t('hudChrome.auraOverlay.allOff');
    const setAll = (enabled: boolean): void => {
      this.host.click();
      hooks.setAll(enabled);
      this.render(parent);
    };
    allOn.addEventListener('click', () => setAll(true));
    allOff.addEventListener('click', () => setAll(false));
    actions.append(allOn, allOff);
    parent.appendChild(actions);

    const grid = document.createElement('div');
    grid.className = 'aura-settings-grid';
    parent.appendChild(grid);
    for (const def of defs) this.buildProcCard(grid, def);
  }

  private buildProcCard(parent: HTMLElement, def: WarriorProcDef): void {
    const hooks = this.host.auras;
    const ability = ABILITIES[def.iconAbilityId];
    const abilityName = ability ? abilityDisplayName(ability) : def.iconAbilityId;
    const card = settingsCard(parent, def.labelKey ? t(def.labelKey) : abilityName, {
      className: 'aura-settings-card',
    });
    const preview = document.createElement('div');
    preview.className = `aura-settings-chip aura-overlay-${def.theme}`;
    const icon = document.createElement('img');
    icon.src = iconDataUrl('ability', def.iconAbilityId);
    icon.alt = '';
    const label = document.createElement('span');
    label.textContent = abilityName;
    preview.style.setProperty('--aura-color', hooks.get(def.id).color);
    preview.append(icon, label);
    card.appendChild(preview);

    const toggle = (
      labelText: string,
      get: () => boolean,
      patch: (value: boolean) => AuraOverlayPatch,
    ): void => {
      toggleControl({
        parent: card,
        label: labelText,
        get,
        set: (value) => hooks.patch(def.id, patch(value)),
        onLabel: t('hud.options.on'),
        offLabel: t('hud.options.off'),
        onActivate: () => this.host.click(),
      });
    };
    toggle(
      t('hudChrome.auraOverlay.enabled'),
      () => hooks.get(def.id).enabled,
      (enabled) => ({
        enabled,
      }),
    );
    toggle(
      t('hudChrome.auraOverlay.icon'),
      () => hooks.get(def.id).showIcon,
      (showIcon) => ({
        showIcon,
      }),
    );
    toggle(
      t('hudChrome.auraOverlay.arcs'),
      () => hooks.get(def.id).showArcs,
      (showArcs) => ({
        showArcs,
      }),
    );
    sliderControl({
      parent: card,
      label: t('hudChrome.auraOverlay.opacity'),
      get: () => hooks.get(def.id).opacity,
      set: (opacity) => hooks.patch(def.id, { opacity }),
      min: 0.25,
      max: 1,
      step: 0.05,
      format: percent,
    });
    colorControl({
      parent: card,
      label: t('hudChrome.auraOverlay.color'),
      get: () => hooks.get(def.id).color,
      set: (color) => {
        hooks.patch(def.id, { color });
        preview.style.setProperty('--aura-color', color);
      },
    });
    const iconPositionLabel = document.createElement('div');
    iconPositionLabel.className = 'set-note aura-position-label';
    iconPositionLabel.textContent = t('hudChrome.auraOverlay.icon');
    card.appendChild(iconPositionLabel);
    sliderControl({
      parent: card,
      label: t('hudChrome.auraOverlay.size'),
      get: () => hooks.get(def.id).scale,
      set: (scale) => hooks.patch(def.id, { scale }),
      min: 0.65,
      max: 1.6,
      step: 0.05,
      format: percent,
    });
    const arcsPositionLabel = document.createElement('div');
    arcsPositionLabel.className = 'set-note aura-position-label';
    arcsPositionLabel.textContent = t('hudChrome.auraOverlay.arcs');
    card.appendChild(arcsPositionLabel);
    sliderControl({
      parent: card,
      label: t('hudChrome.auraOverlay.size'),
      get: () => hooks.get(def.id).arcsScale,
      set: (arcsScale) => hooks.patch(def.id, { arcsScale }),
      min: 0.65,
      max: 1.6,
      step: 0.05,
      format: percent,
    });
    const reposition = document.createElement('button');
    reposition.type = 'button';
    reposition.className = 'btn aura-reposition-btn';
    reposition.textContent = t('hudChrome.auraOverlay.reposition');
    reposition.addEventListener('click', () => this.openPlacement(reposition, def, abilityName));
    card.appendChild(reposition);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn aura-reset-btn';
    reset.textContent = t('hudChrome.auraOverlay.reset');
    reset.addEventListener('click', () => {
      this.host.click();
      hooks.reset(def.id);
    });
    card.appendChild(reset);
  }

  private openPlacement(source: HTMLElement, def: WarriorProcDef, abilityName: string): void {
    const hooks = this.host.auras;
    const menu = source.closest<HTMLElement>('#options-menu');
    this.closePlacement();
    menu?.classList.add('aura-placement-hidden');

    const toolbar = document.createElement('div');
    toolbar.className = 'aura-placement-toolbar';
    toolbar.setAttribute('role', 'dialog');
    toolbar.setAttribute('aria-modal', 'true');
    toolbar.setAttribute(
      'aria-label',
      t('hudChrome.auraOverlay.positioning', { aura: abilityName }),
    );
    const title = document.createElement('strong');
    title.textContent = t('hudChrome.auraOverlay.positioning', { aura: abilityName });
    const defs = hooks.defs();
    const displayName = (entry: WarriorProcDef): string => {
      const entryAbility = ABILITIES[entry.iconAbilityId];
      return entry.labelKey
        ? t(entry.labelKey)
        : entryAbility
          ? abilityDisplayName(entryAbility)
          : entry.iconAbilityId;
    };
    let selectedId = def.id;
    let selectedPart: AuraOverlayPart = 'icon';
    const selector = document.createElement('label');
    selector.className = 'aura-placement-selector';
    const selectorLabel = document.createElement('span');
    selectorLabel.textContent = t('hudChrome.auraOverlay.selectAura');
    const auraSelect = document.createElement('select');
    auraSelect.className = 'hud-select aura-placement-select';
    for (const entry of defs) {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = displayName(entry);
      auraSelect.appendChild(option);
    }
    selector.append(selectorLabel, auraSelect);
    const iconPart = document.createElement('button');
    iconPart.type = 'button';
    iconPart.className = 'btn aura-placement-part aura-placement-icon';
    iconPart.textContent = t('hudChrome.auraOverlay.icon');
    const arcsPart = document.createElement('button');
    arcsPart.type = 'button';
    arcsPart.className = 'btn aura-placement-part aura-placement-arcs';
    arcsPart.textContent = t('hudChrome.auraOverlay.arcs');
    const syncSelection = (id: WarriorProcId, part: AuraOverlayPart): void => {
      selectedId = id;
      selectedPart = part;
      auraSelect.value = id;
      const selectedDef = defs.find((entry) => entry.id === id);
      if (selectedDef) {
        const label = t('hudChrome.auraOverlay.positioning', {
          aura: displayName(selectedDef),
        });
        title.textContent = label;
        toolbar.setAttribute('aria-label', label);
      }
      iconPart.classList.toggle('active', part === 'icon');
      iconPart.setAttribute('aria-pressed', String(part === 'icon'));
      arcsPart.classList.toggle('active', part === 'arcs');
      arcsPart.setAttribute('aria-pressed', String(part === 'arcs'));
    };
    const selectPlacement = (id: WarriorProcId, part: AuraOverlayPart): void => {
      syncSelection(id, part);
      hooks.beginPlacement(id, part);
    };
    iconPart.addEventListener('click', () => {
      this.host.click();
      selectPlacement(selectedId, 'icon');
    });
    arcsPart.addEventListener('click', () => {
      this.host.click();
      selectPlacement(selectedId, 'arcs');
    });
    auraSelect.addEventListener('change', () => {
      this.host.click();
      selectPlacement(auraSelect.value as WarriorProcId, selectedPart);
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn aura-placement-reset';
    reset.textContent = t('hudChrome.auraOverlay.reset');
    const nudges = [
      { className: 'left', label: t('hudChrome.auraOverlay.moveLeft'), x: -1, y: 0 },
      { className: 'up', label: t('hudChrome.auraOverlay.moveUp'), x: 0, y: -1 },
      { className: 'down', label: t('hudChrome.auraOverlay.moveDown'), x: 0, y: 1 },
      { className: 'right', label: t('hudChrome.auraOverlay.moveRight'), x: 1, y: 0 },
    ];
    const nudgeButtons = nudges.map(({ className, label, x, y }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn aura-placement-nudge aura-placement-${className}`;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', () => {
        this.host.click();
        hooks.nudge(selectedId, selectedPart, x, y);
      });
      return button;
    });
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'btn aura-placement-done';
    done.textContent = t('hudChrome.auraOverlay.done');

    reset.addEventListener('click', () => {
      this.host.click();
      hooks.reset(selectedId);
    });
    done.addEventListener('click', () => {
      this.host.click();
      this.closePlacement();
    });
    toolbar.append(title, selector, iconPart, arcsPart, ...nudgeButtons, reset, done);
    document.body.appendChild(toolbar);
    this.placementToolbar = toolbar;
    this.placementMenu = menu;
    this.placementFocus = this.host.openFocusTrap(() => toolbar, source);
    this.placementSelectionUnsubscribe = hooks.onPlacementChange((id, part) =>
      syncSelection(id, part),
    );
    selectPlacement(def.id, 'icon');
    this.placementFocus.focusFirst('.aura-placement-icon');
  }

  closePlacement(): void {
    if (this.placementToolbar) this.host.auras.endPlacement();
    this.placementToolbar?.remove();
    this.placementMenu?.classList.remove('aura-placement-hidden');
    this.placementFocus?.release();
    this.placementSelectionUnsubscribe?.();
    this.placementToolbar = null;
    this.placementMenu = null;
    this.placementFocus = null;
    this.placementSelectionUnsubscribe = null;
  }
}
