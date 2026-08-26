// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreDecisionPrompts } from '../src/ui/store_decision_prompt';

describe('StoreDecisionPrompts', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="prompt-stack"></div>' +
      '<section id="store"><button id="buy" type="button">Buy</button></section>';
  });

  it('owns an accessible modal in the prompt stack and restores the exact opener on Escape', () => {
    const root = document.getElementById('store') as HTMLElement;
    const opener = document.getElementById('buy') as HTMLButtonElement;
    const cancelled = vi.fn();
    opener.focus();

    const prompts = new StoreDecisionPrompts(() => root);
    prompts.open({
      title: 'Confirm purchase',
      body: 'Buy the charter?',
      confirmText: 'Purchase',
      cancelText: 'Cancel',
      closeText: 'Close',
      onConfirm: vi.fn(),
      onCancel: cancelled,
    });

    const prompt = document.querySelector('#prompt-stack #confirm-dialog') as HTMLElement;
    expect(prompt.getAttribute('role')).toBe('dialog');
    expect(prompt.getAttribute('aria-modal')).toBe('true');
    expect(prompt.getAttribute('aria-labelledby')).toBeTruthy();
    expect(prompt.getAttribute('aria-describedby')).toBeTruthy();
    expect(root.inert).toBe(true);

    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).toHaveBeenCalledOnce();
    expect(document.getElementById('confirm-dialog')).toBeNull();
    expect(root.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('settles a decision once even when its confirm control is activated twice', () => {
    const root = document.getElementById('store') as HTMLElement;
    const opener = document.getElementById('buy') as HTMLButtonElement;
    const confirmed = vi.fn();
    const prompts = new StoreDecisionPrompts(() => root);
    opener.focus();
    prompts.open({
      title: 'Confirm purchase',
      body: 'Buy the charter?',
      confirmText: 'Purchase',
      cancelText: 'Cancel',
      closeText: 'Close',
      onConfirm: confirmed,
    });

    const confirm = document.querySelector<HTMLButtonElement>('[data-store-prompt-confirm]');
    expect(confirm).not.toBeNull();
    confirm?.click();
    confirm?.click();

    expect(confirmed).toHaveBeenCalledOnce();
    expect(document.getElementById('confirm-dialog')).toBeNull();
    expect(root.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('restores an inspector to its pre-existing inert state', () => {
    const root = document.getElementById('store') as HTMLElement;
    const inspector = document.createElement('div');
    inspector.className = 'armory-inspect-overlay';
    inspector.inert = true;
    document.body.appendChild(inspector);
    const prompts = new StoreDecisionPrompts(() => root);

    prompts.open({
      title: 'Confirm purchase',
      body: 'Buy the charter?',
      confirmText: 'Purchase',
      cancelText: 'Cancel',
      closeText: 'Close',
      onConfirm: vi.fn(),
    });
    prompts.dismiss(false);

    expect(inspector.inert).toBe(true);
  });

  it('cancels a replaced decision once and exposes stale async results nonmodally', async () => {
    const root = document.getElementById('store') as HTMLElement;
    const firstCancel = vi.fn();
    const prompts = new StoreDecisionPrompts(() => root);
    const common = {
      body: 'Body',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      closeText: 'Close',
      onConfirm: vi.fn(),
    };
    prompts.open({ ...common, title: 'First', onCancel: firstCancel });
    prompts.open({ ...common, title: 'Second' });

    expect(firstCancel).toHaveBeenCalledOnce();
    expect(document.querySelector('.prompt-text')?.textContent).toBe('Second');

    prompts.dismiss(false);
    prompts.showResult({ text: 'Purchase complete', tone: 'success', closeText: 'Close' });
    const result = document.querySelector('.woc-store-global-result') as HTMLElement;
    expect(result.getAttribute('role')).toBe('status');
    expect(result.getAttribute('aria-live')).toBe('polite');
    expect(result.querySelector('[data-store-result-text]')?.textContent).toBe('');
    await Promise.resolve();
    expect(result.textContent).toContain('Purchase complete');
    expect(root.inert).toBe(false);
  });

  it('keeps the nonmodal result dismissible through the mobile prompt-stack hit shield', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8');
    expect(css).toMatch(
      /body\.mobile-touch #prompt-stack \.woc-store-global-result\s*\{[^}]*pointer-events:\s*auto;/s,
    );
  });
});
