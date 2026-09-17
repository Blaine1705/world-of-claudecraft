// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { itemDisplayName } from '../src/ui/entity_i18n';
import type { PainterHostPresentation } from '../src/ui/painter_host';
import {
  attachWeeklyVaultReveal,
  WEEKLY_REVEAL_DURATION_MS,
} from '../src/ui/weekly_vault_reveal_controller';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('does not publish loot or animate while awaiting a host opening', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const stage = document.createElement('div');
  stage.innerHTML = '<img src="/ui/weekly-vault/normal.webp" alt="">';
  document.body.append(stage);
  const request = vi.fn();
  const reveal = vi.fn();
  const icon = vi.fn();
  const view = attachWeeklyVaultReveal(
    stage,
    undefined,
    'Reward 1',
    0,
    false,
    { itemIcon: icon, attachTooltip: vi.fn() } as unknown as PainterHostPresentation,
    () => true,
    reveal,
    undefined,
    request,
  );
  stage.querySelector<HTMLButtonElement>('.vault-reveal-trigger')!.click();
  view.animate();
  vi.runAllTimers();
  expect(request).toHaveBeenCalledTimes(1);
  expect(reveal).not.toHaveBeenCalled();
  expect(icon).not.toHaveBeenCalled();
  expect(stage.querySelector('.vault-reveal-loot')!.hasAttribute('hidden')).toBe(true);
  expect(stage.classList.contains('vault-is-open')).toBe(false);
  view.dispose();
  stage.querySelector<HTMLButtonElement>('.vault-reveal-trigger')!.click();
  expect(request).toHaveBeenCalledTimes(1);
  stage.remove();
});
it('opens once, reveals the provided item and cancels safely on teardown', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const stage = document.createElement('div');
  document.body.append(stage);
  stage.innerHTML = '<img src="/ui/weekly-vault/normal.webp" alt="">';
  const reveal = vi.fn();
  let allowed = false;
  const view = attachWeeklyVaultReveal(
    stage,
    ITEMS.orb_of_the_last_spring,
    'Reward 1',
    0,
    false,
    { itemIcon: () => '', attachTooltip: vi.fn() } as unknown as PainterHostPresentation,
    () => allowed,
    reveal,
  );
  const trigger = stage.querySelector<HTMLButtonElement>('.vault-reveal-trigger')!;
  trigger.click();
  expect(stage.classList.contains('vault-is-open')).toBe(false);
  allowed = true;
  trigger.focus();
  trigger.click();
  trigger.click();
  vi.advanceTimersByTime(WEEKLY_REVEAL_DURATION_MS);
  expect(reveal).toHaveBeenCalledTimes(1);
  expect(stage.querySelector<HTMLButtonElement>('.vault-reveal-loot')?.disabled).toBe(false);
  expect(trigger.disabled).toBe(true);
  expect(stage.querySelector('.vault-reveal-loot strong')?.textContent).toBe(
    itemDisplayName(ITEMS.orb_of_the_last_spring),
  );
  expect(document.activeElement).toBe(stage.querySelector('.vault-reveal-loot'));
  view.dispose();
  vi.runAllTimers();
  expect(reveal).toHaveBeenCalledTimes(1);
  stage.remove();
});
