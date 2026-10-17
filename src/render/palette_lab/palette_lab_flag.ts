// Whether this session runs the palette lab (`?palette=on`): the dev tool that
// swaps a zone's whole colour look live (see ./CLAUDE.md). Read ONCE at module
// load, like the cel look: the lab's shader arms (the output grade's palette
// block, the sky dome's gradient) are compile-time, so a session without the
// flag builds the stock shaders byte for byte and pays nothing.
//
// Hosts without a location (Node, the headless env) always run stock.
//
// A LEAF on purpose: the shader arms (gfx.ts, post.ts, sky.ts, the grass)
// import it, and the guide and editor pages reach gfx.ts too, so it must
// never pull the runtime into their module graph. The runtime boots from
// palette_lab_boot.ts, which only the game's composer (post.ts) imports.

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
