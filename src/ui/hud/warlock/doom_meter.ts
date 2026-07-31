import type { PainterHostWriters } from '../../painter_host';
import { DoomMeterPainter } from './doom_meter_painter';
import { type DoomMeterInput, doomMeterState } from './doom_meter_view';

export interface DoomMeter {
  paint(input: DoomMeterInput): void;
  relocalize(): void;
}

export interface DoomMeterStrings {
  label(): string;
  formatCount(value: number): string;
  formatEmptyStatus(value: string, max: string): string;
  formatStatus(value: string, max: string, seconds: number): string;
}

export function createDoomMeter(
  doc: Document,
  parent: HTMLElement,
  before: HTMLElement,
  writers: PainterHostWriters,
  strings: DoomMeterStrings,
): DoomMeter {
  const frame = doc.createElement('div');
  frame.id = 'warlock-doom-frame';
  frame.className = 'warlock-doom-frame';

  const root = doc.createElement('div');
  root.id = 'warlock-doom';
  root.className = 'warlock-doom';
  root.setAttribute('role', 'meter');
  root.setAttribute('aria-label', strings.label());
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');

  const fill = doc.createElement('div');
  fill.className = 'warlock-doom-fill';
  fill.setAttribute('aria-hidden', 'true');

  const label = doc.createElement('span');
  label.className = 'warlock-doom-label';

  root.append(fill, label);
  frame.appendChild(root);
  parent.insertBefore(frame, before);

  const painter = new DoomMeterPainter(writers, frame, root, fill, label);
  return {
    paint(input): void {
      if (!input.affliction) {
        painter.hide();
        return;
      }
      painter.paint(
        doomMeterState(input, strings.formatCount, strings.formatEmptyStatus, strings.formatStatus),
      );
    },
    relocalize(): void {
      writers.setAttr(root, 'aria-label', strings.label());
    },
  };
}
