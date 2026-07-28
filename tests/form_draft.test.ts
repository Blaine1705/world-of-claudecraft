// @vitest-environment jsdom

// The draft carrier three windows use to survive the woc:languagechange rebuild
// (#2529). The windows' own arms in language_fanout_relocalize.test.ts prove the
// happy path end to end; what is pinned here is the behavior at the edges, where
// getting it wrong is silent: a key that is not stable, a field whose `.value` is
// not its state, a focus restore that fires when focus was somewhere else, and a
// number input that throws on a selection range.

import { afterEach, describe, expect, it } from 'vitest';
import { captureFormDraft, restoreFormDraft } from '../src/ui/form_draft';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('form_draft: what it carries', () => {
  it('captures text inputs and textareas by id and by data-field', () => {
    const root = mount(
      '<input id="a" type="text"><textarea id="b"></textarea><input data-field="c">',
    );
    (root.querySelector<HTMLInputElement>('#a') as HTMLInputElement).value = 'one';
    (root.querySelector<HTMLTextAreaElement>('#b') as HTMLTextAreaElement).value = 'two';
    (root.querySelector<HTMLInputElement>('[data-field="c"]') as HTMLInputElement).value = 'three';
    const draft = captureFormDraft(root);

    // The rebuild: same fields, all emitted empty, exactly as innerHTML does it.
    root.innerHTML = '<input id="a" type="text"><textarea id="b"></textarea><input data-field="c">';
    restoreFormDraft(root, draft);

    expect(root.querySelector<HTMLInputElement>('#a')?.value).toBe('one');
    expect(root.querySelector<HTMLTextAreaElement>('#b')?.value).toBe('two');
    expect(root.querySelector<HTMLInputElement>('[data-field="c"]')?.value).toBe('three');
  });

  it('prefers the id when a field carries both, so one key finds it again', () => {
    const root = mount('<input id="a" data-field="other">');
    (root.querySelector<HTMLInputElement>('#a') as HTMLInputElement).value = 'kept';
    const draft = captureFormDraft(root);
    expect([...draft.values.keys()]).toEqual(['#a']);
  });

  it('skips a field with no stable key rather than guessing at its position', () => {
    const root = mount('<input type="text"><input id="a" type="text">');
    root.querySelectorAll('input')[0].value = 'anonymous';
    (root.querySelector<HTMLInputElement>('#a') as HTMLInputElement).value = 'named';
    const draft = captureFormDraft(root);
    expect([...draft.values.keys()]).toEqual(['#a']);

    // Rebuilt in the OTHER order: an index-keyed restore would put "named" into
    // the anonymous field. Keying on identity cannot.
    root.innerHTML = '<input id="a" type="text"><input type="text">';
    restoreFormDraft(root, draft);
    expect(root.querySelector<HTMLInputElement>('#a')?.value).toBe('named');
    expect(root.querySelectorAll('input')[1].value).toBe('');
  });

  it('leaves a checkbox alone: its state is .checked, not .value', () => {
    const root = mount('<input id="a" type="checkbox" value="on">');
    const box = root.querySelector<HTMLInputElement>('#a') as HTMLInputElement;
    box.checked = true;
    const draft = captureFormDraft(root);
    expect(draft.values.size).toBe(0);
  });

  it('carries a number input, which the coin and hour fields are', () => {
    const root = mount('<input id="g" type="number" value="0">');
    (root.querySelector<HTMLInputElement>('#g') as HTMLInputElement).value = '42';
    const draft = captureFormDraft(root);
    root.innerHTML = '<input id="g" type="number" value="0">';
    restoreFormDraft(root, draft);
    expect(root.querySelector<HTMLInputElement>('#g')?.value).toBe('42');
  });

  it('records the first of two fields sharing a key, the one a restore would find', () => {
    const root = mount('<input id="dup" type="text"><input id="dup" type="text">');
    const inputs = root.querySelectorAll<HTMLInputElement>('input');
    inputs[0].value = 'first';
    inputs[1].value = 'second';
    expect(captureFormDraft(root).values.get('#dup')).toBe('first');
  });

  it('drops a field the rebuild did not bring back rather than recreating it', () => {
    const root = mount('<input id="a" type="text">');
    (root.querySelector<HTMLInputElement>('#a') as HTMLInputElement).value = 'gone';
    const draft = captureFormDraft(root);
    root.innerHTML = '<div>read only now</div>';
    expect(() => restoreFormDraft(root, draft)).not.toThrow();
    expect(root.querySelector('#a')).toBeNull();
  });
});

describe('form_draft: focus', () => {
  it('restores focus and the caret when focus was inside the root', () => {
    const root = mount('<input id="a" type="text">');
    const input = root.querySelector<HTMLInputElement>('#a') as HTMLInputElement;
    input.value = 'Mirabel';
    input.focus();
    input.setSelectionRange(3, 5);
    const draft = captureFormDraft(root);
    expect(draft.focusKey).toBe('#a');

    root.innerHTML = '<input id="a" type="text">';
    restoreFormDraft(root, draft);
    const rebuilt = root.querySelector<HTMLInputElement>('#a') as HTMLInputElement;
    expect(document.activeElement).toBe(rebuilt);
    expect([rebuilt.selectionStart, rebuilt.selectionEnd]).toEqual([3, 5]);
  });

  it('does NOT steal focus when the player was typing somewhere else', () => {
    // The live case: the language picker is in the Options window, so at the
    // moment of the switch focus is over there, and yanking the caret into a
    // mailbox field would be worse than the stale label.
    const root = mount('<input id="a" type="text">');
    (root.querySelector<HTMLInputElement>('#a') as HTMLInputElement).value = 'draft';
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    const draft = captureFormDraft(root);
    expect(draft.focusKey).toBeNull();
    root.innerHTML = '<input id="a" type="text">';
    restoreFormDraft(root, draft);

    expect(root.querySelector<HTMLInputElement>('#a')?.value).toBe('draft');
    expect(document.activeElement).toBe(elsewhere);
  });

  it('survives a focused number input, whose selection range the DOM refuses', () => {
    const root = mount('<input id="g" type="number" value="0">');
    const input = root.querySelector<HTMLInputElement>('#g') as HTMLInputElement;
    input.value = '9';
    input.focus();
    // Chromium and Firefox throw InvalidStateError on both of these for a
    // number input; jsdom reports null instead, so force the throwing shape.
    Object.defineProperty(input, 'selectionStart', {
      get() {
        throw new DOMException('not a text input', 'InvalidStateError');
      },
    });
    const draft = captureFormDraft(root);
    expect(draft.focusKey).toBe('#g');
    expect(draft.selection).toBeNull();

    root.innerHTML = '<input id="g" type="number" value="0">';
    const rebuilt = root.querySelector<HTMLInputElement>('#g') as HTMLInputElement;
    rebuilt.setSelectionRange = () => {
      throw new DOMException('not a text input', 'InvalidStateError');
    };
    expect(() => restoreFormDraft(root, { ...draft, selection: [0, 1] })).not.toThrow();
    expect(rebuilt.value).toBe('9');
  });
});
