// The Key Bindings panel's "convert to keyboard layout" row: a Convert button
// that opens an expando with the layout the hotkeys were made for, the layout
// to convert them to, a keep-movement-in-place switch, a live count of the
// hotkeys that will move, and the apply button. The conversion itself is the
// pure keyboard_layout_convert_core.ts; this is its thin DOM consumer, built
// here rather than as another method cluster on the options painter, which is
// at its line ceiling (tests/monolith_budget.test.ts).

import { audio } from '../game/audio';
import { BIND_ACTIONS } from '../game/keybinds';
import { useTouchInterface } from '../game/mobile_controls';
import { formatNumber, t } from './i18n';
import type { KeybindSetup } from './keybind_transfer_core';
import {
  convertBindingsLayout,
  DEFAULT_SOURCE_LAYOUT,
  isKeyboardLayoutId,
  KEYBOARD_LAYOUTS,
  type KeyboardLayoutId,
} from './keyboard_layout_convert_core';
import { detectOsKeyboardLayout } from './keyboard_map';

/** The seam the options painter hands in; OptionsWindowDeps satisfies it
 *  structurally. */
export interface KeybindLayoutConvertDeps {
  /** The live Keybinds store (only its snapshot is read). */
  keybinds(): { snapshot(): KeybindSetup };
  /** The shared themed dropdown. */
  buildDropdown(
    options: { value: string; label: string }[],
    current: string,
    onChange?: (value: string) => void,
    placeholder?: string,
    a11y?: { ariaLabel?: string; labelledBy?: string },
  ): HTMLElement;
  /** Move a dropdown's shown value without firing its onChange. */
  setDropdownValue(root: HTMLElement, value: string): void;
  /** The listed layout the OS reports, or null when the browser cannot tell.
   *  Defaults to the keyboard overview's layout-map read. */
  detectLayout?(): Promise<KeyboardLayoutId | null>;
}

/** The held (movement) actions the keep-in-place switch pins. */
export const MOVEMENT_ACTION_IDS: ReadonlySet<string> = new Set(
  BIND_ACTIONS.filter((a) => a.kind === 'held').map((a) => a.id),
);

const layoutLabel = (id: KeyboardLayoutId): string =>
  t(KEYBOARD_LAYOUTS.find((l) => l.id === id)?.labelKey ?? KEYBOARD_LAYOUTS[0].labelKey);

/** Append the row and its expando to `body`. `apply` replaces the live map with
 *  the converted snapshot and shows `note` (the painter's applyKeybindSetup). */
export function buildKeybindLayoutConvertRow(
  body: HTMLElement,
  deps: KeybindLayoutConvertDeps,
  apply: (binds: KeybindSetup, note: string) => void,
): void {
  // Keyboard-only, like the keyboard overview: touch has no layout to convert.
  if (useTouchInterface()) return;
  const wrap = document.createElement('div');
  wrap.className = 'kb-transfer kb-layout';
  const row = document.createElement('div');
  row.className = 'set-row ui-stat-row';
  const name = document.createElement('span');
  name.className = 'set-name';
  name.textContent = t('hudChrome.keybindLayout.title');
  const actions = document.createElement('div');
  actions.className = 'set-seg ui-seg';
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn ui-seg-tab set-toggle';
  openBtn.textContent = t('hudChrome.keybindLayout.open');
  openBtn.setAttribute('aria-expanded', 'false');
  actions.appendChild(openBtn);
  row.append(name, actions);

  const pane = document.createElement('div');
  pane.className = 'transfer-pane kb-layout-pane';
  pane.hidden = true;
  wrap.append(row, pane);
  body.appendChild(wrap);

  const state = {
    from: DEFAULT_SOURCE_LAYOUT as KeyboardLayoutId,
    to: DEFAULT_SOURCE_LAYOUT as KeyboardLayoutId,
    toChosen: false,
    keepMovement: true,
  };
  const options = KEYBOARD_LAYOUTS.map((l) => ({ value: l.id, label: t(l.labelKey) }));
  const status = document.createElement('div');
  status.className = 'set-note';
  status.setAttribute('role', 'status');
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn ui-btn ui-btn--gold';
  applyBtn.textContent = t('hudChrome.keybindLayout.apply');

  const convert = () =>
    convertBindingsLayout(
      deps.keybinds().snapshot(),
      state.from,
      state.to,
      state.keepMovement ? MOVEMENT_ACTION_IDS : new Set<string>(),
    );
  const sync = () => {
    const { moved } = convert();
    status.textContent =
      moved > 0
        ? t('hudChrome.keybindLayout.moves', { count: formatNumber(moved) })
        : t('hudChrome.keybindLayout.noChange');
    applyBtn.disabled = moved === 0;
  };

  const pickRow = (
    labelText: string,
    current: KeyboardLayoutId,
    onPick: (id: KeyboardLayoutId) => void,
  ) => {
    const pick = document.createElement('div');
    pick.className = 'set-row ui-stat-row';
    const label = document.createElement('span');
    label.className = 'set-name';
    label.textContent = labelText;
    const dropdown = deps.buildDropdown(
      options,
      current,
      (value) => {
        if (!isKeyboardLayoutId(value)) return;
        audio.click();
        onPick(value);
        sync();
      },
      undefined,
      { ariaLabel: labelText },
    );
    dropdown.querySelector('.ui-dd-btn')?.classList.add('ui-btn');
    pick.append(label, dropdown);
    pane.appendChild(pick);
    return dropdown;
  };
  pickRow(t('hudChrome.keybindLayout.from'), state.from, (id) => {
    state.from = id;
  });
  const toDropdown = pickRow(t('hudChrome.keybindLayout.to'), state.to, (id) => {
    state.to = id;
    state.toChosen = true;
  });

  const keepRow = document.createElement('div');
  keepRow.className = 'set-row ui-stat-row';
  const keepName = document.createElement('span');
  keepName.className = 'set-name';
  keepName.textContent = t('hudChrome.keybindLayout.keepMovement');
  const keepToggle = document.createElement('button');
  keepToggle.type = 'button';
  keepToggle.className = 'btn ui-btn ui-btn--plate set-toggle';
  const syncKeep = () => {
    keepToggle.textContent = state.keepMovement ? t('hud.options.on') : t('hud.options.off');
    keepToggle.classList.toggle('off', !state.keepMovement);
    keepToggle.classList.toggle('is-off', !state.keepMovement);
    keepToggle.setAttribute('aria-pressed', String(state.keepMovement));
  };
  syncKeep();
  keepToggle.addEventListener('click', () => {
    audio.click();
    state.keepMovement = !state.keepMovement;
    syncKeep();
    sync();
  });
  keepRow.append(keepName, keepToggle);
  const help = document.createElement('div');
  help.className = 'set-note';
  help.textContent = t('hudChrome.keybindLayout.help');
  pane.append(keepRow, help, status, applyBtn);

  applyBtn.addEventListener('click', () => {
    const { binds, moved } = convert();
    if (moved === 0) return;
    audio.click();
    apply(
      binds,
      t('hudChrome.keybindLayout.converted', {
        from: layoutLabel(state.from),
        to: layoutLabel(state.to),
      }),
    );
  });

  openBtn.addEventListener('click', () => {
    audio.click();
    pane.hidden = !pane.hidden;
    openBtn.setAttribute('aria-expanded', String(!pane.hidden));
    if (pane.hidden) return;
    sync();
    // Preselect the OS layout as the target, unless the player already picked one.
    void (deps.detectLayout ?? detectOsKeyboardLayout)().then((id) => {
      if (id === null || state.toChosen || id === state.from) return;
      state.to = id;
      deps.setDropdownValue(toDropdown, id);
      sync();
    });
  });
}
