// The Stormbrass Foundry's encounter alert: the thin painter over
// foundry_alert_view.ts. A self-mounted panel in the dungeon prompts' slot
// (low over the action bar; the Gaol's prompts never share a fight with it),
// shown while a Foundry mechanic asks something of the local player: the
// title, the line saying what to do, an optional hint (the drop key while you
// carry a Storm Cell) and the bar. While carrying a cell the whole panel is a
// button: a tap (or a click) is the interact press that drops it, so on a
// touch screen it IS the drop control. The skeleton is built once; every
// per-frame value rides the PainterHost elided writers, so a still frame
// writes nothing.

import type { PainterHostWriters } from '../../painter_host';
import type { FoundryAlertKind, FoundryAlertView } from './foundry_alert_view';

export interface FoundryAlertDeps {
  /** The HUD layer the panel mounts into (null before the HUD exists). */
  layer: () => HTMLElement | null;
  writers: PainterHostWriters;
  /** One interact press (the same command the interact key sends). */
  onPress: () => void;
}

interface Slots {
  title: HTMLElement;
  line: HTMLElement;
  hint: HTMLElement;
  key: HTMLElement;
  hintText: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
}

const KINDS: readonly FoundryAlertKind[] = [
  'cell-closed',
  'cell-warn',
  'cell-open',
  'locked',
  'grounded',
  'charged',
];

export class FoundryAlert {
  private root: HTMLButtonElement | null = null;
  private slots: Slots | null = null;
  private pressable = false;

  constructor(private readonly deps: FoundryAlertDeps) {}

  paint(view: FoundryAlertView): void {
    const w = this.deps.writers;
    if (!view.visible) {
      this.pressable = false;
      if (this.root) w.setDisplay(this.root, 'none');
      return;
    }
    const root = this.ensureRoot();
    const slots = this.slots;
    if (!root || !slots) return;
    this.pressable = view.pressable;
    w.setDisplay(root, 'flex');
    for (const k of KINDS) w.toggleClass(root, `is-${k}`, view.kind === k);
    w.toggleClass(root, 'is-pressable', view.pressable);
    w.setText(slots.title, view.title);
    w.setText(slots.line, view.line);
    w.setDisplay(slots.hint, view.hint ? 'flex' : 'none');
    w.setText(slots.hintText, view.hint);
    w.setText(slots.key, view.key);
    w.setDisplay(slots.key, view.key ? 'inline-flex' : 'none');
    w.setAttr(root, 'aria-label', view.buttonAria);
    w.setDisplay(slots.bar, view.progress === null ? 'none' : 'block');
    const progress = view.progress ?? 0;
    w.setWidth(slots.fill, `${(progress * 100).toFixed(1)}%`);
    w.setAttr(slots.bar, 'aria-valuenow', String(Math.round(progress * 100)));
    w.setAttr(slots.bar, 'aria-valuetext', view.progressAria);
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
    this.slots = null;
  }

  private press(e: Event): void {
    if (!this.pressable) return;
    e.preventDefault();
    this.deps.onPress();
  }

  private ensureRoot(): HTMLButtonElement | null {
    if (this.root) return this.root;
    const layer = this.deps.layer();
    if (!layer) return null;
    const doc = layer.ownerDocument;
    const root = doc.createElement('button');
    root.type = 'button';
    root.id = 'foundry-alert';
    root.className = 'ui-panel-strong foundry-alert';
    const title = doc.createElement('div');
    title.className = 'fa-title ui-cin';
    const line = doc.createElement('div');
    line.className = 'fa-line';
    const hint = doc.createElement('div');
    hint.className = 'fa-hint';
    const key = doc.createElement('span');
    key.className = 'ui-keycap fa-key';
    const hintText = doc.createElement('span');
    hint.append(key, hintText);
    const bar = doc.createElement('div');
    bar.className = 'ui-bar fa-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const fill = doc.createElement('div');
    fill.className = 'ui-bar-fill fa-fill';
    bar.append(fill);
    root.append(title, line, hint, bar);
    // While a cell is carried, a press on the panel drops it (the sim owns the
    // drop and the retake lock); otherwise the panel ignores the pointer.
    root.addEventListener('pointerdown', (e) => this.press(e));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.press(e);
    });
    layer.appendChild(root);
    this.root = root;
    this.slots = { title, line, hint, key, hintText, bar, fill };
    return root;
  }
}
