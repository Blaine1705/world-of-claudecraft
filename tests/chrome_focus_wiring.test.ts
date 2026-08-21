// chrome_focus_wiring.ts: the root list and the wiring hud.ts applies once at
// boot for the "Space reopens the last-used menu" fix. Plain-Node suite over
// hand-rolled fakes (the tests/CLAUDE.md DOM rule): the root lists are pinned
// as data (the surfaces the bug was reported on must stay wired), the binding
// is observed per root (a keydown guard plus a CAPTURE-phase click drop on every
// panel, a capture-phase click drop keyed to the right selector on every
// tracker), and hud.ts is pinned to call the one wiring entry point.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHROME_GUARDED_PANELS,
  CHROME_TRACKER_BLURS,
  wireChromeFocus,
} from '../src/ui/chrome_focus_wiring';

interface BoundListener {
  type: string;
  listener: (e: Event) => void;
  capture: boolean;
}

class FakeRoot {
  listeners: BoundListener[] = [];
  addEventListener(
    type: string,
    listener: (e: Event) => void,
    options?: boolean | { capture?: boolean },
  ): void {
    const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);
    this.listeners.push({ type, listener, capture });
  }
  dispatch(type: string, e: unknown): void {
    for (const l of this.listeners) if (l.type === type) l.listener(e as Event);
  }
}

/** A click target that matches exactly one selector (its own), with no dialog root. */
class FakeControl {
  blurred = 0;
  constructor(private readonly matches: string) {}
  closest(selector: string): FakeControl | null {
    return selector === this.matches ? this : null;
  }
  blur(): void {
    this.blurred++;
  }
}

function wire(): Map<string, FakeRoot> {
  const roots = new Map<string, FakeRoot>();
  wireChromeFocus((selector) => {
    const root = new FakeRoot();
    roots.set(selector, root);
    return root;
  });
  return roots;
}

describe('the wired roots (the surfaces the fix covers)', () => {
  it('keeps the micromenu side rail, the reported surface, among the guarded panels', () => {
    expect(CHROME_GUARDED_PANELS).toContain('#side-buttons');
  });

  it('keeps the bank + bags cluster and the Book of Deeds among the guarded panels', () => {
    expect(CHROME_GUARDED_PANELS).toEqual(
      expect.arrayContaining(['#bank-window', '#bags', '#deeds-window']),
    );
  });

  it('keeps the three trackers, keyed to their header (and quest row) controls', () => {
    expect(CHROME_TRACKER_BLURS).toEqual([
      ['#quest-tracker', '.qt-header, .qt-title'],
      ['#deed-tracker', '.dt-header'],
      ['#reliquary-tracker', '.dt-header'],
    ]);
  });
});

describe('wireChromeFocus', () => {
  it('resolves every guarded panel and every tracker root exactly once', () => {
    const roots = wire();
    expect([...roots.keys()].sort()).toEqual(
      [...CHROME_GUARDED_PANELS, ...CHROME_TRACKER_BLURS.map(([root]) => root)].sort(),
    );
  });

  it('binds both halves over every guarded panel: a keydown guard plus a CAPTURE-phase click drop', () => {
    const roots = wire();
    for (const panelId of CHROME_GUARDED_PANELS) {
      const root = roots.get(panelId);
      if (!root) throw new Error(`unwired panel ${panelId}`);
      const types = root.listeners.map((l) => `${l.type}${l.capture ? ':capture' : ''}`).sort();
      expect(types, panelId).toEqual(['click:capture', 'keydown']);
      // The drop is the real pointer_blur one: a pointer click on a button blurs it,
      // a keyboard click (detail 0) does not.
      const btn = new FakeControl('button');
      root.dispatch('click', { detail: 1, target: btn });
      root.dispatch('click', { detail: 0, target: btn });
      expect(btn.blurred, panelId).toBe(1);
    }
  });

  it('binds the capture-phase click drop over every tracker, keyed to its own selector', () => {
    const roots = wire();
    for (const [trackerId, selector] of CHROME_TRACKER_BLURS) {
      const root = roots.get(trackerId);
      if (!root) throw new Error(`unwired tracker ${trackerId}`);
      const types = root.listeners.map((l) => `${l.type}${l.capture ? ':capture' : ''}`);
      expect(types, trackerId).toEqual(['click:capture']);
      const header = new FakeControl(selector);
      const other = new FakeControl('button');
      root.dispatch('click', { detail: 1, target: header });
      root.dispatch('click', { detail: 1, target: other });
      expect(header.blurred, trackerId).toBe(1);
      expect(other.blurred, trackerId).toBe(0);
    }
  });
});

describe('hud.ts wiring pin', () => {
  it('calls the one wiring entry point with its query (line comments stripped first)', () => {
    const hud = readFileSync(join(__dirname, '../src/ui/hud.ts'), 'utf8').replace(
      /^\s*\/\/.*$/gm,
      '',
    );
    expect(hud).toContain('wireChromeFocus($)');
  });
});
