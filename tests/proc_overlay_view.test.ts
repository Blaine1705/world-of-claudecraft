// The Rising Phoenix proc overlay: the pure state cores (fire Heating Up / Hot
// Streak, and the Chronomancy 4-charge variant) plus the thin painter's class
// mapping. No DOM: the painter routes through a fake writer that records the
// toggled classes, so the quarter-by-quarter reveal is pinned.
import { describe, expect, it } from 'vitest';
import type { PainterHostWriters } from '../src/ui/painter_host';
import { ProcOverlayPainter } from '../src/ui/proc_overlay_painter';
import { chronoOverlayCharges, procOverlayState } from '../src/ui/proc_overlay_view';

describe('procOverlayState (fire)', () => {
  it('maps Heating Up / Hot Streak / none', () => {
    expect(procOverlayState([])).toBe('none');
    expect(procOverlayState([{ id: 'heating_up' }])).toBe('heating');
    expect(procOverlayState([{ id: 'hot_streak' }])).toBe('hot');
    // Hot Streak wins over Heating Up.
    expect(procOverlayState([{ id: 'heating_up' }, { id: 'hot_streak' }])).toBe('hot');
  });
});

describe('chronoOverlayCharges (Chronomancy 4-charge variant)', () => {
  it('reads the Aether Surge charge count (0-4) off the arcane_surge aura', () => {
    expect(chronoOverlayCharges([])).toBe(0);
    expect(chronoOverlayCharges([{ id: 'arcane_surge', value: 1 }])).toBe(1);
    expect(chronoOverlayCharges([{ id: 'arcane_surge', value: 3 }])).toBe(3);
    expect(chronoOverlayCharges([{ id: 'arcane_surge', value: 4 }])).toBe(4);
  });

  it('clamps to 0-4 and ignores unrelated auras', () => {
    expect(chronoOverlayCharges([{ id: 'temporal_echo', value: 1 }])).toBe(0);
    expect(chronoOverlayCharges([{ id: 'arcane_surge', value: 9 }])).toBe(4);
    expect(chronoOverlayCharges([{ id: 'arcane_surge' }])).toBe(0); // no value -> 0
  });
});

function fakeWriters() {
  const classes = new Map<string, boolean>();
  const writers = {
    toggleClass: (_el: HTMLElement, cls: string, on: boolean) => {
      classes.set(cls, on);
    },
  } as unknown as PainterHostWriters;
  return { writers, classes };
}

describe('ProcOverlayPainter class mapping', () => {
  it('lights one quarter per charge and clears the fire classes', () => {
    const { writers, classes } = fakeWriters();
    const painter = new ProcOverlayPainter(writers, {} as HTMLElement);

    painter.paintChronoCharges(2);
    expect(classes.get('chrono')).toBe(true);
    expect(classes.get('c1')).toBe(true);
    expect(classes.get('c2')).toBe(true);
    expect(classes.get('c3')).toBe(false);
    expect(classes.get('c4')).toBe(false);
    expect(classes.get('heating')).toBe(false);
    expect(classes.get('hot')).toBe(false);

    painter.paintChronoCharges(4); // full bird
    expect(classes.get('c3')).toBe(true);
    expect(classes.get('c4')).toBe(true);

    painter.paintChronoCharges(0); // Aether Darts spent them -> off
    expect(classes.get('c1')).toBe(false);
    expect(classes.get('c4')).toBe(false);
    expect(classes.get('chrono')).toBe(true); // theme stays; opacity handles hiding
  });

  it('the fire path clears every Chronomancy class', () => {
    const { writers, classes } = fakeWriters();
    const painter = new ProcOverlayPainter(writers, {} as HTMLElement);
    painter.paintChronoCharges(4);
    painter.paint('hot');
    expect(classes.get('chrono')).toBe(false);
    expect(classes.get('c1')).toBe(false);
    expect(classes.get('c2')).toBe(false);
    expect(classes.get('c3')).toBe(false);
    expect(classes.get('c4')).toBe(false);
    expect(classes.get('hot')).toBe(true);
  });
});
