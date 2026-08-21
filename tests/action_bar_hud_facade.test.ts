import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hud } from '../src/ui/hud';

vi.mock('../src/render/characters', () => ({ CharacterPreview: class {} }));
vi.mock('../src/render/characters/assets', () => ({ preloadMechAssets: vi.fn() }));
vi.mock('../src/render/characters/portrait', () => ({
  onPortraitsReady: vi.fn(),
  onPortraitUpdate: vi.fn(),
  playerPortraitDataUrl: vi.fn(),
  visualPortraitDataUrl: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

describe('Hud action-bar facade', () => {
  it('routes both configurable slot paths through the Shift-only clear gesture', () => {
    const source = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    const buildStart = source.indexOf('private buildActionBar(): void');
    const configurableStart = source.indexOf('if (slot >= 1) {', buildStart);
    const attackSlotStart = source.indexOf('// Slot 0 (Attack).', configurableStart);
    const configurableSlots = source.slice(configurableStart, attackSlotStart);

    expect(configurableSlots).toContain('bindShiftClear(btn, clearSlot);');
    expect(configurableSlots).toContain(
      'this.hotbarActions = clearHotbarSlot(this.hotbarActions, slot - 1);',
    );
    expect(configurableSlots).toContain('this.saveSlotMap();');

    const actionBarBuild = source.slice(
      buildStart,
      source.indexOf('private buildCastBar()', buildStart),
    );
    // Only the attack slot (slot 0) still calls the two handlers directly; every
    // configurable slot routes through bindShiftClear instead (checked above).
    expect(actionBarBuild.match(/handleShiftClearContextMenu\(/g)).toHaveLength(1);
    expect(actionBarBuild.match(/handleShiftClearKeydown\(/g)).toHaveLength(1);
    expect(actionBarBuild).toContain('handleShiftClearContextMenu(e, clearAttackSlotAction);');
    expect(actionBarBuild).toContain('this.attackSlotAction = null;');
    expect(actionBarBuild).toContain('this.saveAttackSlotAction();');

    // bindShiftClear is the one place that knows a slot surface must offer BOTH
    // desktop clear affordances; pin that its body still registers the pair, so a
    // future surface cannot ship contextmenu without keydown (or vice versa).
    const clearSource = readFileSync(
      new URL('../src/ui/hud/action_bar/action_bar_clear.ts', import.meta.url),
      'utf8',
    );
    const bindStart = clearSource.indexOf('export function bindShiftClear');
    expect(bindStart).toBeGreaterThan(-1);
    const bindBody = clearSource.slice(bindStart);
    expect(bindBody).toContain("btn.addEventListener('contextmenu'");
    expect(bindBody).toContain("btn.addEventListener('keydown'");
  });

  it('checks drag eligibility before every drop and the touch bar editor place', () => {
    // Four desktop drag/drop sites plus the bar editor's placeAbility, the touch
    // binding path: it takes the SAME eligibility gate the desktop drop takes,
    // so a passive or unknown ability cannot reach a slot through the overlay.
    const source = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    expect(source.match(/actionBarController\.isAssignableAction\(/g)).toHaveLength(5);
    expect(source).toContain(
      "if (!this.actionBarController.isAssignableAction({ type: 'ability', id: abilityId })) return;",
    );
  });

  // WAS: 'cancels a mobile drag before exposing a newly loaded form page'. The
  // long-press rearrange that drag belonged to is retired, so there is no drag
  // to cancel here any more. What still matters at this seam is the OTHER half
  // that test covered: a form swap must drop the desktop drag AND re-clamp the
  // ring page, or the newly loaded bar is exposed through a stale page.
  it('drops the desktop drag and re-clamps the ring page on a form swap', () => {
    const hud = Object.create(Hud.prototype) as unknown as {
      actionBarController: { syncActiveForm(): boolean };
      dragAction: unknown;
      mobileActionPage: number;
      currentMobileActionPage(): number;
      syncActiveHotbarForm(): void;
    };
    hud.actionBarController = { syncActiveForm: () => true };
    hud.dragAction = { action: { type: 'ability', id: 'strike' }, sourceIndex: 0 };
    hud.mobileActionPage = 4;
    hud.currentMobileActionPage = () => 1;

    hud.syncActiveHotbarForm();

    expect(hud.dragAction).toBeNull();
    expect(hud.mobileActionPage).toBe(1);
  });

  it('leaves no touch long-press rearrange path on the action bar', () => {
    const source = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    for (const token of [
      'mobileHotbarDrag',
      'bindMobileActionDrag',
      'bindMobileRingDrag',
      'mobile-hotbar-dragging',
    ]) {
      expect(source, `${token} must not survive the removal`).not.toContain(token);
    }
    // The desktop HTML5 path is untouched: both halves still there.
    expect(source).toContain("btn.addEventListener('dragstart', (e) => {");
    expect(source).toContain("btn.addEventListener('dragover', (e) => {");
  });
});
