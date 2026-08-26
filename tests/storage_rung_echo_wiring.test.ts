import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('storage rung authoritative-refusal wiring', () => {
  const hud = readFileSync('src/ui/hud.ts', 'utf8');

  it('observes raw error and log text before either localization path transforms it', () => {
    expect(hud).toContain('this.localizeErrorText(this.bankWindow.observeStorageText(ev.text))');
    expect(hud).toContain('this.localizeSystemText(this.bankWindow.observeStorageText(ev.text))');
    expect(hud.match(/observeStorageText\(ev\.text\)/g)).toHaveLength(2);
  });
});
