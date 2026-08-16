// Rideable-mount program prewarm (#2571): one hidden rig per catalog MountKey
// so the FIRST sighting of any mount, yours or another player's, never links
// its shader programs on a live frame. Mount GLBs are lazyPreload
// (characters/assets.ts), so warming one is real async fetch work, unlike the
// purely procedural vfx.weapon-skins rigs beside it in renderer.ts. This
// module only builds one hidden rig; renderer.ts's `vfx.mount-programs`
// manifest entry owns staging it into the scene, compiling it, and scheduling
// it as idle-time background work (see that entry for why).

import type { MountKey } from '../sim/content/mounts';
import { type CharacterVisual, createMountVisual } from './characters';
import { mountAssetsReady, preloadMountAssets } from './characters/assets';
import { MOUNT_VISUAL_SPECS } from './mount_visuals';
import { setRenderCategory } from './renderer_diagnostics';

/** Every mount the catalog carries. Derived from MOUNT_VISUAL_SPECS (typed
 *  Record<MountKey, ...>, so a new MountKey missing there is a compile error)
 *  rather than a separately hand-maintained list: nothing here can drift out
 *  of sync with src/sim/content/mounts.ts the way the prewarm manifest drifted
 *  from the mount catalog before this module existed. */
export function mountPrewarmKeys(): MountKey[] {
  return Object.keys(MOUNT_VISUAL_SPECS) as MountKey[];
}

/**
 * Build one hidden, off-screen rig for a mount, resolving its lazy GLB first
 * if it has not been fetched yet. Returns null when the asset never arrives
 * (a fetch failure): the caller skips this mount for the pass and a later
 * idle pass retries it, exactly like every other lazy character asset miss
 * in this renderer (never a synchronous throw on the render path).
 */
export async function buildMountPrewarmVisual(key: MountKey): Promise<CharacterVisual | null> {
  const { visualKey } = MOUNT_VISUAL_SPECS[key];
  if (!mountAssetsReady(visualKey)) {
    await preloadMountAssets(visualKey).catch(() => undefined);
  }
  if (!mountAssetsReady(visualKey)) return null;
  const visual = createMountVisual(visualKey);
  visual.root.name = `prewarm-mount:${key}`;
  visual.root.position.set(0, -1000, 0); // off-screen; compile ignores position
  setRenderCategory(visual.root, 'prewarm');
  return visual;
}
