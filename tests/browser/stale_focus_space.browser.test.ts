// Real-browser regression suite for "Space reopens the last-used menu": a mouse
// click on a micromenu button left it holding document focus (the canvas is not
// focusable), and any state that skips the game layer's Space preventDefault (a
// modal, a prompt, chat focus, a graphics rebuild pause) let the browser
// natively re-activate that stale button on keyup. Runs in Browser Mode because
// the bug IS native activation semantics: only trusted key events make a
// focused button click on Space keyup, so a Node DOM fake cannot express either
// the bug or the fix.
//
// It drives the REAL modules end to end: the real Input (window-level keydown,
// the blocked-state stale-focus guard, the jump latch), the real pointer_blur
// wiring helpers hud.ts binds over the side rail and panels, the real
// stale_chrome_focus dialog carve-out, and the real installPromptDialog trap.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Input } from '../../src/game/input';
import { Keybinds } from '../../src/game/keybinds';
import { bindChromeButtonKeyGuard, bindPointerBlur } from '../../src/ui/pointer_blur';
import { installPromptDialog } from '../../src/ui/prompt_dialog';

// One shared Input for the whole file: its window-level listeners cannot be
// removed, so a per-test instance would stack handlers. `blocked` stands in for
// main.ts's gameplayInputBlocked() (modal / prompt / camera prompt / rebuild).
let input: Input;
let blocked = false;

beforeAll(() => {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  input = new Input(
    canvas,
    {
      onTab: () => undefined,
      onTabPrev: () => undefined,
      onTargetFriendly: () => undefined,
      onCycleFriendly: () => undefined,
      onPet: () => undefined,
      onTargetPet: () => undefined,
      onAbility: () => undefined,
      onAbilityDown: () => undefined,
      onAbilityUp: () => undefined,
      onUiKey: () => undefined,
      onEmoteWheel: () => undefined,
      onClickPick: () => undefined,
      canUseGameKeys: () => !blocked,
    },
    new Keybinds(),
  );
  canvas.remove();
});

afterEach(async () => {
  // Belt and braces: release Space if a failed assertion left it held, then
  // clear the fixtures and the blocked flag.
  await userEvent.keyboard('[/Space]').catch(() => undefined);
  blocked = false;
  document.body.innerHTML = '';
});

/** A micromenu-rail fixture wired exactly the way hud.ts wires #side-buttons:
 *  the chrome key guard (Enter/Space stopPropagation, native default kept) plus
 *  the delegated capture-phase pointer-only blur. */
function makeRail(): { rail: HTMLElement; btn: HTMLButtonElement; toggles: () => number } {
  const rail = document.createElement('div');
  rail.id = 'side-buttons';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'mm-char';
  btn.textContent = 'Character';
  let count = 0;
  btn.addEventListener('click', () => {
    count++;
  });
  rail.appendChild(btn);
  document.body.appendChild(rail);
  bindChromeButtonKeyGuard(rail);
  bindPointerBlur(rail);
  return { rail, btn, toggles: () => count };
}

async function pressSpace(): Promise<void> {
  await userEvent.keyboard('[Space>]');
  await userEvent.keyboard('[/Space]');
}

describe('stale focus vs Space (the reported bug and its fix)', () => {
  it('(a) mouse-click a micromenu button, then Space: no re-toggle, jump requested', async () => {
    const { btn, toggles } = makeRail();
    await userEvent.click(btn);
    expect(toggles()).toBe(1);
    // Layer 1: the pointer click must not leave the button focused.
    expect(document.activeElement).not.toBe(btn);
    // Space is the jump key again, not a menu key.
    await userEvent.keyboard('[Space>]');
    expect(input.readMoveInput().jump).toBe(true);
    await userEvent.keyboard('[/Space]');
    expect(toggles()).toBe(1);
  });

  it('(b) mouse-click, open a modal, then Space: the stale button does not activate', async () => {
    const { btn, toggles } = makeRail();
    await userEvent.click(btn);
    expect(toggles()).toBe(1);
    blocked = true; // a modal window is now up (isModalOpen -> canUseGameKeys false)
    await pressSpace();
    expect(toggles()).toBe(1);
  });

  it('(b2) layer 2 alone: a stale-focused chrome button outside the rail guards is suppressed and blurred while blocked', async () => {
    // A chrome button OUTSIDE every key-guarded container and dialog root, e.g.
    // a window button the audit missed: the input-layer guard is its only net.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'chrome';
    let count = 0;
    btn.addEventListener('click', () => {
      count++;
    });
    document.body.appendChild(btn);
    btn.focus();
    expect(document.activeElement).toBe(btn);
    blocked = true;
    await pressSpace();
    expect(count).toBe(0);
    // Blurred, not just suppressed, so the stale focus cannot bite again.
    expect(document.activeElement).not.toBe(btn);
  });

  it('(c) keyboard focus on a micromenu button: Space DOES activate it, and does not jump', async () => {
    const { btn, toggles } = makeRail();
    btn.focus(); // where Tab would land
    await userEvent.keyboard('[Space>]');
    // The rail guard stopped the keydown before the game layer: no jump. Read
    // the raw key-held state rather than readMoveInput(), whose 150ms tap latch
    // could still be warm from an earlier test's Space press.
    expect(input.debugState().movementHeld.jump).toBe(false);
    await userEvent.keyboard('[/Space]');
    // Native activation on keyup: the menu opens for keyboard users.
    expect(toggles()).toBe(1);
    // And keyboard users keep their focus position (no pointer blur).
    expect(document.activeElement).toBe(btn);
  });

  it('(d) a button inside an open prompt dialog still activates with Space', async () => {
    // The real prompt recipe: window behind goes inert, prompt owns its keys.
    const windowBehind = document.createElement('div');
    document.body.appendChild(windowBehind);
    const prompt = document.createElement('div');
    prompt.className = 'prompt';
    const text = document.createElement('div');
    text.className = 'prompt-text';
    text.textContent = 'Confirm?';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.textContent = 'OK';
    let confirmed = 0;
    confirm.addEventListener('click', () => {
      confirmed++;
    });
    prompt.append(text, confirm);
    document.body.appendChild(prompt);
    const handle = installPromptDialog(prompt, null, () => prompt.remove(), {
      inertRoot: windowBehind,
      idPrefix: 'stale-space-test',
    });
    blocked = true; // promptModalOpen() blocks gameplay keys
    confirm.focus();
    await pressSpace();
    expect(confirmed).toBe(1);
    // The blocked-state guard must not have blurred the dialog's own control.
    expect(document.activeElement).toBe(confirm);
    handle.dismiss();
  });

  it('(d2) a button inside any [role="dialog"] root (options window shape) keeps Space activation while blocked', async () => {
    // Unlike the prompt (which stops propagation itself), an options-window
    // button's keydown DOES reach the window handler; the stale_chrome_focus
    // dialog carve-out is what keeps its native activation alive.
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'setting';
    let count = 0;
    btn.addEventListener('click', () => {
      count++;
    });
    dialog.appendChild(btn);
    document.body.appendChild(dialog);
    blocked = true;
    btn.focus();
    await pressSpace();
    expect(count).toBe(1);
    expect(document.activeElement).toBe(btn);
  });
});
