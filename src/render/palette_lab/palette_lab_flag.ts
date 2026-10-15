// Whether this session runs the palette lab (`?palette=on`): the dev tool that
// swaps a zone's whole colour look live (see ./CLAUDE.md). Read ONCE at module
// load, like the cel look: the lab's shader arms (the output grade's palette
// block, the sky dome's gradient) are compile-time, so a session without the
// flag builds the stock shaders byte for byte and pays nothing.
//
// Hosts without a location (Node, the headless env) always run stock.

function readFlag(): boolean {
  // Dev builds only (`npm run dev`): a shipped build never offers it, since
  // the lab can move fog distances and freeze the sky clock, the same
  // dev-only scope as `/daynight` (src/game/dev_chat_hooks.ts).
  if (!import.meta.env.DEV) return false;
  if (typeof location === 'undefined') return false;
  const mode = new URLSearchParams(location.search).get('palette');
  return mode === 'on' || mode === '1';
}

const enabled = readFlag();

/** True when `?palette=on` (or `=1`) opted this session into the palette lab. */
export function paletteLabEnabled(): boolean {
  return enabled;
}

// Boot. This module is imported by the two shader arms (post.ts, sky.ts), so
// it loads with the renderer; the runtime and its panel are a separate chunk
// fetched only for a lab session in a page with a DOM. The runtime itself
// waits for the live world (`window.__game`) before it touches anything.
if (enabled && typeof document !== 'undefined') {
  void import('./palette_lab_runtime').then((m) => m.startPaletteLab());
}
