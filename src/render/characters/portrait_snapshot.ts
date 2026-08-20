import * as THREE from 'three';
import { encodeCanvasPng, encodeRgbaPngDataUrl } from './portrait_png_encode';
import {
  asyncPortraitReadbackUsable,
  flipUnpremultiplyInto,
  portraitReadbackByteLength,
} from './portrait_readback_core';

// The portrait capture's readback adapter: the thin GL half over the pure
// buffer core (portrait_readback_core.ts) and the PNG encode
// (portrait_png_encode.ts).
//
// WHY THIS EXISTS. The capture used to render into the offscreen rig's DEFAULT
// framebuffer (preserveDrawingBuffer: true) and call canvas.toBlob. toBlob
// defers the PNG ENCODE, but it performs the GPU readback SYNCHRONOUSLY on the
// main thread: measured at 1477 ms of self time across a post-entry ride, 67 to
// 118 ms per portrait unit, once every prewarm-lane slot for the first minute of
// play. The lane grants a unit a slot, not a budget, so nothing capped it.
//
// So the capture renders into a WebGLRenderTarget and reads it back through
// three's readRenderTargetPixelsAsync, which issues readPixels into a
// PIXEL_PACK_BUFFER, plants a fenceSync, polls it off the frame, and only then
// runs getBufferSubData. The main thread pays the draw and the command
// submission; the transfer waits for the GPU on its own.
//
// Two things change between the paths, and both are undone in software before
// the encode so the output matches what toBlob wrote: readPixels numbers rows
// from the bottom while ImageData numbers them from the top, and both the
// drawing buffer and the target hold premultiplied colour while a PNG holds
// straight alpha. Both live in the pure core. The sRGB transfer is NOT one of
// them: the target texture carries the renderer's output colour space, so three
// allocates it SRGB8_ALPHA8 and the GPU encodes linear to sRGB on write.

/** Matches the offscreen rig's `antialias: true` drawing buffer, so the
 *  silhouette a render target captures is the one the default framebuffer
 *  produced. */
const PORTRAIT_SNAPSHOT_SAMPLES = 4;

/**
 * LIVENESS BACKSTOP, not a pacing knob: nothing waits on it in normal
 * operation, and it can only ever shorten a wait that is already broken.
 *
 * three's readback polls its fence through `probeAsync`, which rejects on
 * WAIT_FAILED but re-polls TIMEOUT_EXPIRED forever, with no timeout and no
 * cancellation. A fence that never signals on a live context is therefore a
 * promise that NEVER SETTLES, and this capture's promise is what the
 * serialised preview lane advances on and what holds a released-tail slot in
 * the shared GPU queue: one wedge stops every later preview unit and halves
 * the queue's tail budget for the session.
 *
 * The bound is deliberately three orders of magnitude above the measured
 * healthy cost (3.8 ms on a discrete GPU, 32.6 ms on a Mesa iGPU): a readback
 * that has not landed by now is broken, not slow, on any machine. Expiring it
 * costs one portrait and the async path for the session (every later capture
 * takes the synchronous one), never a slower portrait.
 */
export const PORTRAIT_READBACK_LIVENESS_BACKSTOP_MS = 10_000;

/** The renderer surface this adapter uses. `THREE.WebGLRenderer` satisfies it
 *  structurally; naming it keeps the path selection testable without a GL
 *  context. */
export interface PortraitSnapshotRenderer {
  readonly domElement: HTMLCanvasElement;
  /** three types this as a plain string on the renderer. */
  readonly outputColorSpace: string;
  getContext(): { isContextLost(): boolean };
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  getActiveCubeFace(): number;
  getActiveMipmapLevel(): number;
  setRenderTarget(
    target: THREE.WebGLRenderTarget | null,
    activeCubeFace?: number,
    activeMipmapLevel?: number,
  ): void;
  readRenderTargetPixelsAsync?(
    target: THREE.WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ): Promise<unknown>;
}

/**
 * One square capture surface for a portrait rig, reused by every capture on
 * that rig (target, readback buffer and flipped buffer are all allocated once).
 * Owned by the rig and disposed with it.
 */
export class PortraitSnapshotTarget {
  private target: THREE.WebGLRenderTarget | null = null;
  private pixels: Uint8Array | null = null;
  private topDown: Uint8ClampedArray<ArrayBuffer> | null = null;
  /** Latched by any async failure, so one broken readback costs one portrait
   *  and every later capture takes the synchronous path instead. */
  private asyncFailed = false;
  /** Bumped by dispose. A readback issued against the released buffers lands
   *  with a stale generation and writes nothing. */
  private generation = 0;
  /** True from the moment an async readback is issued until its bytes have
   *  been flipped out. `pixels` and `topDown` are shared by every capture on
   *  this rig while the lane above only dedupes per cache KEY, so a second
   *  concurrent capture takes the synchronous path rather than racing for
   *  those buffers. */
  private captureInFlight = false;

  constructor(private readonly size: number) {}

  /**
   * Draw one portrait and encode it as a PNG data URL.
   *
   * `draw` MUST be called before this returns its promise, on both paths: the
   * caller (runPortraitPrewarm) releases and disposes the subject as soon as
   * the promise exists, so nothing may be drawn after the first await. That is
   * also why the path is chosen up front rather than after a failure: once the
   * readback has been issued there is no subject left to re-render.
   */
  capture(renderer: PortraitSnapshotRenderer, draw: () => void): Promise<string | null> {
    const readAsync = renderer.readRenderTargetPixelsAsync;
    const usable = asyncPortraitReadbackUsable({
      hasAsyncReadback: typeof readAsync === 'function',
      failedBefore: this.asyncFailed,
      contextLost: this.contextLost(renderer),
      captureInFlight: this.captureInFlight,
    });
    if (!readAsync || !usable) return this.captureSync(renderer, draw);

    const target = this.ensureTarget(renderer);
    const pixels = this.ensurePixels();
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMipmapLevel = renderer.getActiveMipmapLevel();
    let readback: Promise<unknown>;
    try {
      renderer.setRenderTarget(target);
      draw();
      // three resolves a multisampled target at the END of render(), into the
      // same single-sample framebuffer the readback binds, so unbinding here is
      // safe and keeps the rig's state exactly as the caller left it.
      renderer.setRenderTarget(previousTarget, previousFace, previousMipmapLevel);
      readback = readAsync.call(renderer, target, 0, 0, this.size, this.size, pixels);
    } catch {
      renderer.setRenderTarget(previousTarget, previousFace, previousMipmapLevel);
      this.asyncFailed = true;
      // Still inside the caller's synchronous window, so the subject is mounted
      // and the fallback can draw it.
      return this.captureSync(renderer, draw);
    }

    this.captureInFlight = true;
    const generation = this.generation;
    return this.awaitReadback(readback, pixels).then((landed) => {
      // A dispose released `pixels` and `topDown` while this readback was in
      // flight, and a capture on the rebuilt rig may already own the new ones
      // AND the in-flight claim: flipping here would write a pre-rebuild frame
      // into a live buffer, and clearing the claim would free it under that
      // capture.
      if (generation !== this.generation) return null;
      this.captureInFlight = false;
      if (!landed) return null;
      const dest = this.ensureTopDown();
      flipUnpremultiplyInto(pixels, dest, this.size, this.size);
      return encodeRgbaPngDataUrl(dest, this.size, this.size).then((url) => {
        if (url === null) this.asyncFailed = true;
        return url;
      });
    });
  }

  /**
   * Resolve true when the readback landed, false when it failed OR when the
   * liveness backstop expired first. Either failure latches, so the capture
   * always settles and every later one takes the synchronous path.
   *
   * Landing is judged on the fulfilment VALUE, never on fulfilment alone:
   * `readRenderTargetPixelsAsync` returns undefined without throwing and
   * without writing a byte when the target has no `__webglFramebuffer` yet
   * (three 0.185.1), and `pixels` is shared across captures, so treating that
   * as landed would encode the PREVIOUS portrait and cache it under this key.
   * The success path hands back the very buffer it filled.
   */
  private awaitReadback(readback: Promise<unknown>, pixels: Uint8Array): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const backstop = setTimeout(() => {
        this.asyncFailed = true;
        resolve(false);
      }, PORTRAIT_READBACK_LIVENESS_BACKSTOP_MS);
      const settle = (landed: boolean): void => {
        clearTimeout(backstop);
        if (!landed) this.asyncFailed = true;
        resolve(landed);
      };
      readback.then(
        (value) => settle(value === pixels),
        () => settle(false),
      );
    });
  }

  /** Release the target and its buffers (graphics rebuild, page teardown). A
   *  fresh context gets a fresh chance at the async path. */
  dispose(): void {
    this.target?.dispose();
    this.target = null;
    this.pixels = null;
    this.topDown = null;
    this.asyncFailed = false;
    this.captureInFlight = false;
    this.generation++;
  }

  /** The original path: render into the default framebuffer and let toBlob do
   *  the (synchronous) readback. Slower, but it needs no extension and no
   *  render target, so it is what keeps a failure from dropping portraits. */
  private captureSync(
    renderer: PortraitSnapshotRenderer,
    draw: () => void,
  ): Promise<string | null> {
    draw();
    return encodeCanvasPng(renderer.domElement);
  }

  private contextLost(renderer: PortraitSnapshotRenderer): boolean {
    try {
      return renderer.getContext().isContextLost();
    } catch {
      return true;
    }
  }

  private ensureTarget(renderer: PortraitSnapshotRenderer): THREE.WebGLRenderTarget {
    const existing = this.target;
    if (existing) return existing;
    const target = new THREE.WebGLRenderTarget(this.size, this.size, {
      depthBuffer: true,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      samples: PORTRAIT_SNAPSHOT_SAMPLES,
    });
    // Load bearing, and not for sampling: for an UnsignedByte RGBA texture
    // whose colour space carries the sRGB transfer three allocates
    // SRGB8_ALPHA8 (getInternalFormat, three 0.185.1), and WebGL2 then encodes
    // linear to sRGB in hardware as the framebuffer is written. That is what
    // reproduces the canvas path's bytes; drop this and every portrait comes
    // back dark, encode a second time in software and every one washes out.
    target.texture.colorSpace = renderer.outputColorSpace;
    target.texture.generateMipmaps = false;
    this.target = target;
    return target;
  }

  private ensurePixels(): Uint8Array {
    const existing = this.pixels;
    if (existing) return existing;
    const pixels = new Uint8Array(portraitReadbackByteLength(this.size, this.size));
    this.pixels = pixels;
    return pixels;
  }

  private ensureTopDown(): Uint8ClampedArray<ArrayBuffer> {
    const existing = this.topDown;
    if (existing) return existing;
    const topDown = new Uint8ClampedArray(portraitReadbackByteLength(this.size, this.size));
    this.topDown = topDown;
    return topDown;
  }
}
