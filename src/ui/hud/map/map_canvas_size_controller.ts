// Keeps the world map canvas's backing store in step with its displayed box,
// so a resized map window draws crisp at its new size instead of stretching
// the shipped 560 px store. The window itself is resized by the shared corner
// grip (src/ui/window_resize.ts); the CSS face rule in src/styles/components.css
// sizes the canvas display box to the largest square the stage fits.
//
// Event-driven: one ResizeObserver on the canvas, so there is no per-frame
// work and no forced layout read (the observer hands over the laid-out content
// box, in author px). A backing write clears the canvas, so every write is
// followed by the injected repaint. The size decision is map_canvas_size_core.ts.
import { MAP_CANVAS_DEFAULT_SIDE, mapCanvasBackingSide } from './map_canvas_size_core';

export interface MapCanvasSizeDeps {
  canvas: HTMLCanvasElement;
  /**
   * True while the map window carries a player-chosen size (desktop, after the
   * corner grip engaged). Otherwise the shipped backing stays: the touch sheet
   * CSS-scales the 560 store on purpose (its compact marker profile is tuned
   * for that), and an unsized desktop window displays it 1:1 already.
   */
  sized(): boolean;
  /** Repaint the map right after the backing store changed (it is now blank). */
  repaint(): void;
}

export class MapCanvasSizeController {
  private observer: ResizeObserver | null = null;

  constructor(private readonly deps: MapCanvasSizeDeps) {}

  /** Start observing. A host without ResizeObserver keeps the shipped size. */
  install(): void {
    if (this.observer || typeof ResizeObserver === 'undefined') return;
    this.observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentBoxSize?.[0];
      if (box) this.apply(box.inlineSize, box.blockSize);
    });
    this.observer.observe(this.deps.canvas);
  }

  /** Match the backing store to a displayed content box of `width` x `height`. */
  apply(width: number, height: number): void {
    const side = this.deps.sized() ? mapCanvasBackingSide(width, height) : MAP_CANVAS_DEFAULT_SIDE;
    const canvas = this.deps.canvas;
    if (side === null || (canvas.width === side && canvas.height === side)) return;
    canvas.width = side;
    canvas.height = side;
    this.deps.repaint();
  }

  dispose(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}

/**
 * Hud's one-call wiring: a player-sized map window is a desktop #map-window
 * carrying the shared grip's permanent `window-sized` stamp.
 */
export function installMapCanvasSize(
  canvas: HTMLCanvasElement,
  repaint: () => void,
): MapCanvasSizeController {
  const win = canvas.closest<HTMLElement>('#map-window');
  const controller = new MapCanvasSizeController({
    canvas,
    sized: () =>
      !!win?.classList.contains('window-sized') &&
      !canvas.ownerDocument.body?.classList.contains('mobile-touch'),
    repaint,
  });
  controller.install();
  return controller;
}
