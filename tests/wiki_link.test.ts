// The wiki launcher seam (src/ui/wiki_link.ts): the URL decision and the
// confirm-first contract. The dialog itself is Hud.confirmDialog (injected),
// so what this suite pins is that nothing opens before OK, that a dismissal
// opens nothing, and that the URL follows the deploy being played.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_WIKI_URL, promptWikiVisit, resolveWikiUrl } from '../src/ui/wiki_link';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveWikiUrl', () => {
  it('stays same-origin on any http(s) deploy, so a dev deploy links its own wiki', () => {
    expect(resolveWikiUrl({ nativeApp: false, origin: 'https://dev.worldofclaudecraft.com' })).toBe(
      'https://dev.worldofclaudecraft.com/wiki/',
    );
    expect(resolveWikiUrl({ nativeApp: false, origin: 'https://worldofclaudecraft.com' })).toBe(
      'https://worldofclaudecraft.com/wiki/',
    );
    expect(resolveWikiUrl({ nativeApp: false, origin: 'http://localhost:5173' })).toBe(
      'http://localhost:5173/wiki/',
    );
  });

  it('falls back to the canonical wiki when there is no site origin to serve /wiki', () => {
    // The Capacitor WebView reports an origin, but it is not the site.
    expect(resolveWikiUrl({ nativeApp: true, origin: 'https://localhost' })).toBe(
      CANONICAL_WIKI_URL,
    );
    expect(resolveWikiUrl({ nativeApp: false, origin: 'file://' })).toBe(CANONICAL_WIKI_URL);
    expect(resolveWikiUrl({ nativeApp: false, origin: '' })).toBe(CANONICAL_WIKI_URL);
  });

  it('pins the canonical wiki URL to its literal', () => {
    expect(CANONICAL_WIKI_URL).toBe('https://worldofclaudecraft.com/wiki/');
  });
});

describe('promptWikiVisit', () => {
  it('asks with the wiki dialog copy and opens the resolved URL only on OK', () => {
    vi.stubGlobal('location', { origin: 'https://dev.worldofclaudecraft.com' });
    const openUrl = vi.fn();
    const confirm = vi.fn();
    promptWikiVisit({ confirm, openUrl });

    expect(confirm).toHaveBeenCalledTimes(1);
    const [title, body, okText, cancelText, onOk] = confirm.mock.calls[0];
    expect(title).toBe('Open the Wiki?');
    expect(body).toBe(
      'This opens the World of ClaudeCraft wiki in your browser. The game keeps running.',
    );
    expect(okText).toBe('Open Wiki');
    expect(cancelText).toBe('Cancel');

    // Nothing opens before the player chooses.
    expect(openUrl).not.toHaveBeenCalled();
    (onOk as () => void)();
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith('https://dev.worldofclaudecraft.com/wiki/');
  });

  it('a dismissed dialog (onOk never fired) opens nothing', () => {
    const openUrl = vi.fn();
    promptWikiVisit({ confirm: () => {}, openUrl });
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('uses the canonical URL when no browser origin exists (plain Node)', () => {
    const openUrl = vi.fn();
    const confirm = vi.fn();
    promptWikiVisit({ confirm, openUrl });
    (confirm.mock.calls[0][4] as () => void)();
    expect(openUrl).toHaveBeenCalledWith(CANONICAL_WIKI_URL);
  });
});
