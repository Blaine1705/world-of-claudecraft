// The map canvas size controller over a fake canvas and a fake ResizeObserver:
// a sized desktop window gets a backing store that follows the displayed box
// (with one repaint per real change), anything else keeps the shipped 560.
import { afterEach, describe, expect, it } from 'vitest';
import { MapCanvasSizeController } from '../src/ui/hud/map/map_canvas_size_controller';

type ObserverCallback = (
  entries: { contentBoxSize: { inlineSize: number; blockSize: number }[] }[],
) => void;

const g = globalThis as { ResizeObserver?: unknown };
const realObserver = g.ResizeObserver;
afterEach(() => {
  g.ResizeObserver = realObserver;
});

function rig(sized: boolean) {
  const canvas = { width: 560, height: 560 } as HTMLCanvasElement;
  let callback: ObserverCallback | null = null;
  const observed: unknown[] = [];
  let disconnected = false;
  g.ResizeObserver = class {
    constructor(cb: ObserverCallback) {
      callback = cb;
    }
    observe(target: unknown) {
      observed.push(target);
    }
    disconnect() {
      disconnected = true;
    }
  };
  const state = { sized, repaints: 0 };
  const controller = new MapCanvasSizeController({
    canvas,
    sized: () => state.sized,
    repaint: () => {
      state.repaints += 1;
    },
  });
  controller.install();
  const deliver = (inlineSize: number, blockSize: number) =>
    callback?.([{ contentBoxSize: [{ inlineSize, blockSize }] }]);
  return { canvas, controller, deliver, observed, state, disconnected: () => disconnected };
}

describe('MapCanvasSizeController', () => {
  it('observes the canvas once', () => {
    const r = rig(true);
    r.controller.install();
    expect(r.observed).toEqual([r.canvas]);
  });

  it('follows the displayed box on a sized window and repaints once per change', () => {
    const r = rig(true);
    r.deliver(812, 812);
    expect([r.canvas.width, r.canvas.height]).toEqual([812, 812]);
    expect(r.state.repaints).toBe(1);
    r.deliver(812, 812);
    expect(r.state.repaints).toBe(1);
    r.deliver(700, 900);
    expect([r.canvas.width, r.canvas.height]).toEqual([700, 700]);
    expect(r.state.repaints).toBe(2);
  });

  it('keeps the shipped 560 store while the window is not player-sized', () => {
    const r = rig(false);
    r.deliver(330, 330); // the touch sheet CSS-scales the canvas down
    expect(r.canvas.width).toBe(560);
    expect(r.state.repaints).toBe(0);
  });

  it('returns to 560 when the size is cleared, and ignores a hidden window', () => {
    const r = rig(true);
    r.deliver(900, 900);
    r.deliver(0, 0); // display: none
    expect(r.canvas.width).toBe(900);
    r.state.sized = false;
    r.deliver(560, 560);
    expect(r.canvas.width).toBe(560);
    expect(r.state.repaints).toBe(2);
  });

  it('disconnects on dispose, and a host without ResizeObserver keeps the shipped size', () => {
    const r = rig(true);
    r.controller.dispose();
    expect(r.disconnected()).toBe(true);
    g.ResizeObserver = undefined;
    const canvas = { width: 560, height: 560 } as HTMLCanvasElement;
    new MapCanvasSizeController({ canvas, sized: () => true, repaint: () => {} }).install();
    expect(canvas.width).toBe(560);
  });
});
