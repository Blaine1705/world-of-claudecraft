// The launcher's 3D character stage: the one CharacterPreview that the character select, the
// online creator and the offline creator share (src/main.ts moves it between their containers
// as the panels change, updatePreviewContainer).
//
// It is built AT ONCE on the launcher, never behind the character boot set: the stage waits
// per body for exactly the files that body draws (CharacterPreview.setVisualKey over
// render/characters/assets.ts directBuildAssetsResident), while the boot set (on a desktop,
// every creature body and item weapon in the game: a few hundred files) downloads behind them
// in the loader's background class. It used to wait on charactersReady(), that whole set, so
// a first visit's creator stood empty for minutes; and a stage built that late while the
// player sat on the ONLINE creator went into the char-select container, so it never showed at
// all until the player changed panels.
//
// Until its character draws, the stage shows the yellow loading silhouette
// (src/ui/preview_loading_silhouette.ts). On the phone interface (body.mobile-touch, read live
// so an Interface Mode change applies at once) it is a touch stage: pinch, drag and the
// head-and-shoulders opening shot (render/characters/preview_touch_core.ts).

import { CharacterPreview } from '../render/characters';
import { GFX } from '../render/gfx';
import { createPreviewLoadingSilhouette } from '../ui/preview_loading_silhouette';

/** The launcher panels that show the stage, each with the container it shows it in. */
export const PREVIEW_PANEL_CONTAINERS: Readonly<Record<string, string>> = {
  '#charselect-panel': '#online-preview-container',
  '#charcreate-panel': '#charcreate-preview-container',
  '#offline-select': '#offline-preview-container',
};

/** The stage container a launcher panel shows it in (the offline creator's for any other
 *  panel, as the launcher always resolved it). */
export function previewContainerFor(panelId: string): string {
  return PREVIEW_PANEL_CONTAINERS[panelId] ?? '#offline-preview-container';
}

/** The stage panel on screen now, or null (the landing's world choice, the login panels).
 *  Resolved defensively: play.html has no #offline-select. */
export function activePreviewPanel(doc: Pick<Document, 'querySelector'> = document): string | null {
  for (const id of Object.keys(PREVIEW_PANEL_CONTAINERS)) {
    const panel = doc.querySelector(id);
    if (panel && !panel.hasAttribute('hidden')) return id;
  }
  return null;
}

/** Build the stage on `#char-preview-canvas` in its markup home (the char-select container;
 *  the caller moves it to the panel on screen), with the loading silhouette and the phone's
 *  touch stage. Null on a page with no stage. */
export function createLauncherPreview(doc: Document = document): CharacterPreview | null {
  const canvas = doc.querySelector<HTMLCanvasElement>('#char-preview-canvas');
  const home = doc.querySelector<HTMLElement>('#online-preview-container');
  if (!canvas || !home) return null;
  const preview = new CharacterPreview(home, canvas, {
    // GFX.constrainedMemory covers every iOS WebKit host (Safari and other iOS browsers, not
    // just the packaged app) plus the general touch/coarse-pointer detector: the launcher's
    // stage sits in the same entry-allocation window the boot preload defers and streams for
    // (assets/preload.ts: "a 12 GB iPhone 17 Pro was killed 1.6s into the LAUNCHER").
    constrainedMemory: GFX.constrainedMemory,
    touchStage: () => doc.body.classList.contains('mobile-touch'),
  });
  preview.setLoadingLayer(createPreviewLoadingSilhouette(doc));
  return preview;
}
