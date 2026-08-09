// @vitest-environment jsdom
//
// The one-shot redesign editor. The token is the point: a character gets ONE
// free appearance change, so every path that could spend it without the player
// getting the design they chose — or that could leave it unspent while the
// player believes it landed — is a bug worth a test rather than a click.
//
// Pinned here: the stage always shows the DRAFT while the editor is open, a
// rejected save keeps both the token and the draft, Cancel writes nothing at
// all, and the helmet toggle is part of what Save posts (it is the character's
// standing wardrobe preference, exactly as it is at creation, not a turntable
// view that evaporates).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAppearancePanelsForTests } from '../src/ui/appearance_panel_locale';
import {
  CharselectRedesignEditor,
  type RedesignEditorDeps,
  type RedesignTarget,
} from '../src/ui/charselect_redesign';

const TARGET: RedesignTarget = {
  id: 42,
  name: 'Oldtimer',
  class: 'rogue',
  appearance: null,
  mainhandItemId: 'dagger',
  weaponSkinId: null,
};

/** The char-select markup the editor drives, reduced to the ids it reads. */
function mountShell(): void {
  document.body.innerHTML = `
    <div id="charselect-news"></div>
    <div id="charselect-reroll" hidden>
      <div id="charselect-reroll-title"></div>
      <div id="charselect-reroll-host"></div>
      <div id="charselect-reroll-error"></div>
      <button id="btn-reroll-save"></button>
      <button id="btn-reroll-cancel"></button>
    </div>`;
}

/** A host of spies. Typed loosely on purpose: the tests read `.mock.calls` off
 *  them, which the RedesignEditorDeps signatures alone do not carry. */
function fakeDeps(over: Record<string, unknown> = {}) {
  return {
    previewModular: vi.fn(),
    restoreStage: vi.fn(),
    setPreviewName: vi.fn(),
    saveAppearance: vi.fn(async (_id: number, _app: unknown, _helmHidden: boolean) => {}),
    refreshRoster: vi.fn(async () => {}),
    errorText: (err: unknown) => String((err as Error)?.message ?? err),
    ...over,
  };
}

/** The editor takes the spy host; the cast is the test-double seam, not a
 *  loosening of the interface (a missing member still fails tsc below). */
function editorWith(deps: ReturnType<typeof fakeDeps>): CharselectRedesignEditor {
  return new CharselectRedesignEditor(deps as unknown as RedesignEditorDeps);
}

beforeEach(() => {
  mountShell();
  resetAppearancePanelsForTests();
});

describe('opening', () => {
  it('shows the panel over the news feed and drives the stage with the draft', () => {
    const deps = fakeDeps();
    editorWith(deps).open(TARGET);
    expect(document.getElementById('charselect-reroll')?.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('charselect-news')?.hasAttribute('hidden')).toBe(true);
    expect(deps.setPreviewName).toHaveBeenCalledWith('Oldtimer');
    expect(deps.previewModular).toHaveBeenCalled();
    // The character's own gear rides the preview, not a generic class body.
    const [, , cls, mainhand] = deps.previewModular.mock.calls[0];
    expect(cls).toBe('rogue');
    expect(mainhand).toBe('dagger');
  });

  it('seeds the helm from the character rather than forcing it open', () => {
    // The toggle is a SAVED preference now, not a turntable preview, so opening
    // the editor must not decide it. A character wearing its helm opens wearing
    // it, and Save is a no-op on this field unless the player moves the row.
    const shown = fakeDeps();
    editorWith(shown).open({ ...TARGET, helmHidden: false });
    expect((shown.previewModular.mock.calls[0][1] as { head?: unknown }).head).not.toBeNull();

    const hidden = fakeDeps();
    editorWith(hidden).open({ ...TARGET, helmHidden: true });
    expect((hidden.previewModular.mock.calls[0][1] as { head?: unknown }).head).toBeNull();
  });

  it('saves the helm it was opened with when the player never touches it', async () => {
    const deps = fakeDeps();
    const editor = editorWith(deps);
    editor.open({ ...TARGET, helmHidden: false });
    await editor.save();
    // Not `true`: a redesign must not hide a helm the player never hid.
    expect(deps.saveAppearance.mock.calls[0][2]).toBe(false);
  });

  it('opening on a second character discards the first draft', () => {
    const deps = fakeDeps();
    const editor = editorWith(deps);
    editor.open(TARGET);
    editor.open({ ...TARGET, id: 43, name: 'Another' });
    expect(deps.setPreviewName).toHaveBeenLastCalledWith('Another');
    expect(editor.isOpen).toBe(true);
  });

  it('does nothing at all when the panel is not in the document', () => {
    document.body.innerHTML = '';
    const deps = fakeDeps();
    const editor = editorWith(deps);
    editor.open(TARGET);
    expect(editor.isOpen).toBe(false);
    expect(deps.previewModular).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('posts the draft with the helm choice, then closes and re-pulls the roster', async () => {
    const deps = fakeDeps();
    const editor = editorWith(deps);
    editor.open(TARGET);
    await editor.save();
    expect(deps.saveAppearance).toHaveBeenCalledTimes(1);
    const [characterId, app, helmHidden] = deps.saveAppearance.mock.calls[0];
    expect(characterId).toBe(42);
    expect(app).toMatchObject({ gender: expect.any(String) });
    // The helmet toggle IS saved, matching creation. It is not a preview — and
    // its value is the character's, not a default this editor invented.
    expect(helmHidden).toBe(false);
    expect(deps.refreshRoster).toHaveBeenCalledTimes(1);
    expect(editor.isOpen).toBe(false);
    expect(document.getElementById('charselect-reroll')?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps the editor open with its draft when the server rejects', async () => {
    const deps = fakeDeps({
      saveAppearance: vi.fn(async () => {
        throw new Error('reroll unavailable');
      }),
    });
    const editor = editorWith(deps);
    editor.open(TARGET);
    await editor.save();
    expect(editor.isOpen).toBe(true);
    expect(deps.refreshRoster).not.toHaveBeenCalled();
    expect(document.getElementById('charselect-reroll-error')?.textContent).toBe(
      'reroll unavailable',
    );
    // Re-enabled, or a player who hit a transient error could never retry.
    expect((document.getElementById('btn-reroll-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('posts exactly the draft the player authored, not a default', async () => {
    // Mutation check this closes: making save() post DEFAULT_APPEARANCE
    // instead of the draft stayed green, because nothing drove the customizer
    // before saving. Drive a real control (the gender row), then assert the
    // POSTED document carries the change and IS the last previewed draft.
    const deps = fakeDeps();
    const editor = editorWith(deps);
    editor.open(TARGET);
    const before = deps.previewModular.mock.calls.at(-1)![0] as { gender: string };
    const flipTo = before.gender === 'female' ? 'Male' : 'Female';
    const btn = [...document.querySelectorAll('#charselect-reroll-host button')].find(
      (b) => b.textContent?.trim() === flipTo,
    ) as HTMLButtonElement;
    expect(btn, 'gender control not found in the mounted customizer').toBeTruthy();
    btn.click();
    const previewed = deps.previewModular.mock.calls.at(-1)![0] as { gender: string };
    expect(previewed.gender).not.toBe(before.gender); // the draft really moved
    await editor.save();
    expect(deps.saveAppearance.mock.calls[0][1]).toEqual(previewed);
  });

  it('a rejected save keeps the DRAFT itself, not just the panel', async () => {
    const deps = fakeDeps({
      saveAppearance: vi
        .fn()
        .mockRejectedValueOnce(new Error('reroll unavailable'))
        .mockResolvedValueOnce(undefined),
    });
    const editor = editorWith(deps);
    editor.open(TARGET);
    const btn = [...document.querySelectorAll('#charselect-reroll-host button')].find(
      (b) => b.textContent?.trim() === 'Female',
    ) as HTMLButtonElement;
    btn.click();
    const authored = deps.previewModular.mock.calls.at(-1)![0];
    await editor.save(); // rejected
    await editor.save(); // retried
    // The retry posts the SAME authored draft: a failure did not reset it.
    const calls = (deps.saveAppearance as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toEqual(authored);
    expect(calls[1][1]).toEqual(calls[0][1]);
  });

  it('is a no-op with no editor open, so a stray click cannot spend a token', async () => {
    const deps = fakeDeps();
    await editorWith(deps).save();
    expect(deps.saveAppearance).not.toHaveBeenCalled();
  });
});

describe('cancelling', () => {
  it('writes nothing and puts the stage back on the roster selection', () => {
    const deps = fakeDeps();
    const editor = editorWith(deps);
    editor.open(TARGET);
    editor.close(true);
    expect(deps.saveAppearance).not.toHaveBeenCalled();
    expect(editor.isOpen).toBe(false);
    expect(deps.restoreStage).toHaveBeenCalledTimes(1);
    expect(document.getElementById('charselect-news')?.hasAttribute('hidden')).toBe(false);
  });

  it('leaves the stage alone when the caller is about to drive it itself', () => {
    const deps = fakeDeps();
    const editor = editorWith(deps);
    editor.open(TARGET);
    editor.close(false);
    expect(deps.restoreStage).not.toHaveBeenCalled();
  });
});

describe('drivePreview', () => {
  it('is a no-op when nothing is being redesigned', () => {
    const deps = fakeDeps();
    editorWith(deps).drivePreview();
    expect(deps.previewModular).not.toHaveBeenCalled();
  });
});
