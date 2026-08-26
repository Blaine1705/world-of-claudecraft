import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPadConnectedClass, PAD_CONNECTED_CLASS } from '../src/game/mobile_pad_chrome';

// Fake body.classList sufficient for toggle(name, force).
function fakeDocument() {
  const classes = new Set<string>();
  return {
    doc: {
      body: {
        classList: {
          toggle: (name: string, force?: boolean) => {
            const next = force ?? !classes.has(name);
            if (next) classes.add(name);
            else classes.delete(name);
            return next;
          },
          contains: (name: string) => classes.has(name),
        },
      },
    },
    classes,
  };
}

describe('applyPadConnectedClass', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the pad-connected class when the pad is connected', () => {
    const { doc, classes } = fakeDocument();
    vi.stubGlobal('document', doc);
    applyPadConnectedClass(true);
    expect(classes.has(PAD_CONNECTED_CLASS)).toBe(true);
  });

  it('removes the pad-connected class once the pad disconnects', () => {
    const { doc, classes } = fakeDocument();
    vi.stubGlobal('document', doc);
    applyPadConnectedClass(true);
    expect(classes.has(PAD_CONNECTED_CLASS)).toBe(true);
    applyPadConnectedClass(false);
    expect(classes.has(PAD_CONNECTED_CLASS)).toBe(false);
  });

  it('is a silent no-op with no document (headless/tests, mirroring input_hint_mode.ts)', () => {
    vi.stubGlobal('document', undefined);
    expect(() => applyPadConnectedClass(true)).not.toThrow();
  });

  it('is a silent no-op when body/classList is not the expected shape', () => {
    vi.stubGlobal('document', { body: {} });
    expect(() => applyPadConnectedClass(true)).not.toThrow();
  });
});
