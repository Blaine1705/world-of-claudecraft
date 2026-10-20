// index.html's entry. A plain first visit paints the landing page without the game
// client: src/ui/landing_first.ts lifts the boot splash once the stylesheets are in,
// prefetches the client after the page has loaded, and starts it on the visitor's
// first interaction. Every other visit (src/ui/landing_first_core.ts, bootModeFor)
// starts the client straight away, exactly as before. play.html loads src/main.ts
// directly. The style barrel is imported here so the build links it from the HTML.
import './styles/index.css';
import { DESKTOP_APP, NATIVE_APP } from './client_origin';
import { BOOT_PENDING_CLASS, BOOT_SPLASH_ID } from './ui/boot_splash_core';
import { runLandingFirst } from './ui/landing_first';
import { bootModeFor } from './ui/landing_first_core';

function storageGetter(storage: () => Storage): (key: string) => string | null {
  return (key) => {
    try {
      return storage().getItem(key);
    } catch {
      return null;
    }
  };
}

const startClient = () => import('./main');

const mode = bootModeFor({
  pathname: location.pathname,
  search: location.search,
  nativeApp: NATIVE_APP,
  desktopApp: DESKTOP_APP,
  stored: storageGetter(() => localStorage),
  session: storageGetter(() => sessionStorage),
});

if (mode === 'game') {
  startClient().catch((err: unknown) => {
    // A dynamic import that fails (or throws while evaluating) rejects here rather than
    // firing the script error the inline splash fail-safe listens for, so release the
    // splash the same way it would: show the page instead of a spinner.
    console.error('game client failed to load:', err);
    document.body.classList.remove(BOOT_PENDING_CLASS);
    document.getElementById(BOOT_SPLASH_ID)?.remove();
  });
} else {
  runLandingFirst(startClient);
}
