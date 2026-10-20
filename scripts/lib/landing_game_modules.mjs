// The home page's landing-first boot (src/ui/landing_first.ts) prefetches the game
// client once the page has loaded, without running it. The client is a dynamic import
// of the index.html entry (src/boot.ts), so its chunk URLs exist only in the bundle:
// the woc-landing-game-modules plugin (vite.config.ts) lists them into index.html as
// JSON with these helpers. Kept beside the plugin so tests import them directly.

/** Mirrors GAME_MODULES_ELEMENT_ID in src/ui/landing_first.ts (pinned by the test). */
export const GAME_MODULES_ELEMENT_ID = 'woc-game-modules';

const MAIN_ENTRY = /(^|\/)src\/main\.ts$/;

function staticClosure(start, byName) {
  const seen = new Set();
  const stack = [start];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const dep of byName.get(file)?.imports ?? []) stack.push(dep);
  }
  return seen;
}

/**
 * The game client's chunk files: src/main.ts's chunk first, then every chunk it
 * statically imports, minus those the page's own entry chunk already loads.
 */
export function gameModuleFiles(bundle, entryFileName) {
  const chunks = Object.values(bundle).filter((item) => item?.type === 'chunk');
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  // play.html also enters src/main.ts, so the bundler can place it in a shared chunk
  // with no facade (Vite 8 does): find the chunk by the modules it holds.
  const holdsMain = (chunk) =>
    [chunk.facadeModuleId, ...(chunk.moduleIds ?? [])].some((id) =>
      MAIN_ENTRY.test(String(id ?? '').replaceAll('\\', '/')),
    );
  const main = chunks.find(holdsMain);
  if (!main) return [];
  const loaded = entryFileName ? staticClosure(entryFileName, byName) : new Set();
  const rest = [...staticClosure(main.fileName, byName)]
    .filter((file) => file !== main.fileName && !loaded.has(file))
    .sort();
  return loaded.has(main.fileName) ? rest : [main.fileName, ...rest];
}

/** index.html with the module list as a JSON block before </body>. */
export function injectGameModules(html, urls) {
  const json = JSON.stringify(urls).replaceAll('<', '\\u003c');
  const tag = `<script type="application/json" id="${GAME_MODULES_ELEMENT_ID}">${json}</script>`;
  return html.replace('</body>', `${tag}\n</body>`);
}
