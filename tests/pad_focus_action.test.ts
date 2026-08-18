import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusedPadAction } from '../src/game/pad_focus_action';

// Only what the reader touches: what has focus, and the two things it asks that
// element. jsdom is not a dependency here (tests/CLAUDE.md, "DOM in tests").
function row(attrs: { id?: string; draggable?: boolean }) {
  return {
    draggable: attrs.draggable ?? false,
    getAttribute: (name: string) => (name === 'data-ability-id' ? (attrs.id ?? null) : null),
  };
}

const withFocus = (activeElement: unknown) => vi.stubGlobal('document', { activeElement });

afterEach(() => vi.unstubAllGlobals());

describe('focusedPadAction', () => {
  it('reads the ability off a focused spellbook row', () => {
    withFocus(row({ id: 'heroic_strike', draggable: true }));
    expect(focusedPadAction()).toEqual({ type: 'ability', id: 'heroic_strike' });
  });

  it('refuses a row the spellbook did not make draggable', () => {
    // draggable is set only where isAbilityActionBarEligible passed, so this is
    // how a passive stays off the bar without deciding eligibility a second time.
    withFocus(row({ id: 'toughness', draggable: false }));
    expect(focusedPadAction()).toBeNull();
  });

  it('ignores a draggable element carrying no ability', () => {
    withFocus(row({ draggable: true }));
    expect(focusedPadAction()).toBeNull();
  });

  it('answers null with nothing focused', () => {
    withFocus(null);
    expect(focusedPadAction()).toBeNull();
  });

  it('answers null with no DOM at all', () => {
    // The headless env server and unit stubs import this module too.
    vi.stubGlobal('document', undefined);
    expect(focusedPadAction()).toBeNull();
  });
});
