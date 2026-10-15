// The launcher turntable's two new host-facing behaviors, through CharacterPreview's own loop
// (a constructor-free harness, as in tests/character_preview_loop_parking.test.ts):
// - the LOADING LAYER (the yellow silhouette, src/ui/preview_loading_silhouette.ts) shows
//   over a visible stage with no character drawn, as a bust when the camera frames the head
//   and shoulders, and comes off the frame the body draws or the stage hides;
// - the TOUCH STAGE (a phone): the creator opens on the head and shoulders, and a face
//   builder category no longer eases the camera to its close-up (the "skin zoom").
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { CharacterPreview } from '../src/render/characters/preview';
import {
  creationFocusPose,
  PREVIEW_FRAMING,
  touchShouldersPose,
} from '../src/render/characters/preview_framing';
import { createPreviewOpenGate } from '../src/render/characters/preview_open_gate_core';
import type { TouchStep } from '../src/render/characters/preview_touch_core';

vi.mock('../src/render/characters/assets', () => ({
  directBuildAssetsResident: () => true,
  mechAssetsReady: () => true,
  onCharacterAssetReady: () => () => {},
  preloadMechAssets: () => Promise.resolve(),
}));

vi.mock('../src/render/characters/visual', () => ({
  CharacterVisual: class {
    root = {};
    setWeaponSkin = vi.fn();
    setSkin = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
  },
}));

// a WOC body's head as the stage measures it: eye line and head height (about three units tall)
const HEAD = { y: 2.64, h: 0.58 };

/** The loading layer's two calls, typed as PreviewLoadingLayer takes them. */
interface LayerMock {
  show: Mock<(container: HTMLElement, shape: 'body' | 'bust') => void>;
  hide: Mock<() => void>;
}

function layerMock(): LayerMock {
  return {
    show: vi.fn<(container: HTMLElement, shape: 'body' | 'bust') => void>(),
    hide: vi.fn<() => void>(),
  };
}

interface Harness {
  preview: CharacterPreview;
  state: Record<string, unknown>;
  container: { clientWidth: number; clientHeight: number };
  canvas: { isConnected: boolean };
  layer: LayerMock;
  frame(): void;
  pose(): { x: number; y: number; z: number; lookY: number };
}

function harness(opts: { touch: boolean; creator: boolean }): Harness {
  const pending: (() => void)[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    pending.push(cb);
    return pending.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const container = { clientWidth: 300, clientHeight: 330 };
  const canvas = { isConnected: true };
  const layer = layerMock();
  const preview = Object.create(CharacterPreview.prototype) as CharacterPreview;
  const state = preview as unknown as Record<string, unknown>;
  const sheet = PREVIEW_FRAMING.sheet;
  Object.assign(state, {
    destroyed: false,
    prewarming: false,
    pendingActive: null,
    renderActive: false,
    animationFrameId: null,
    animate: () => (preview as unknown as { animateFrame: () => void }).animateFrame(),
    container,
    canvas,
    timer: { reset: vi.fn(), update: vi.fn(), getDelta: () => 0.016 },
    openGate: createPreviewOpenGate(),
    standIn: null,
    currentVisual: null,
    scene: {},
    camera: {
      aspect: 300 / 330,
      position: { set: vi.fn() },
      lookAt: vi.fn(),
      updateProjectionMatrix: () => {},
    },
    renderer: { render: () => {}, setSize: () => {} },
    // the constructor's camera state: the sheet framing, no focus
    focus: null,
    camEase: 1,
    camPose: { x: 0, y: sheet.y, z: sheet.z, lookY: sheet.lookY },
    camFrom: { x: 0, y: sheet.y, z: sheet.z, lookY: sheet.lookY },
    // a measured head (focusHeadOf reads it back while the body stays the same)
    focusHeadFor: null,
    focusHead: HEAD,
    focusHeadFinal: true,
    armorSurface: opts.creator ? 'creator' : 'own',
    touchStage: () => opts.touch,
    touchWasActive: false,
    touchView: null,
    touchSolvedFor: { aspect: 0, headY: 0, headH: -1, creator: false, view: null },
    loadingLayer: null,
  });
  return {
    preview,
    state,
    container,
    canvas,
    layer,
    frame() {
      const batch = pending.splice(0, pending.length);
      for (const cb of batch) cb();
    },
    pose: () => state.camPose as { x: number; y: number; z: number; lookY: number },
  };
}

/** Put a body on the stage whose draw state the test controls. */
function stageBody(h: Harness, shown: boolean): { bodyShown: boolean } {
  const body = { bodyShown: shown, update: vi.fn(), root: {} };
  h.state.currentVisual = body;
  // the face measure belongs to this body
  h.state.focusHeadFor = body;
  return body;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the loading layer', () => {
  it('stands over a visible stage until its body draws, then comes off', () => {
    const h = harness({ touch: false, creator: true });
    h.preview.setLoadingLayer(h.layer);
    // hidden stage: nothing shown
    expect(h.layer.show).not.toHaveBeenCalled();
    // the stage gets a size: a body is still streaming, the layer stands in (full body)
    h.preview.syncSize();
    expect(h.layer.show).toHaveBeenLastCalledWith(h.container, 'body');
    h.frame();
    expect(h.layer.show).toHaveBeenLastCalledWith(h.container, 'body');
    h.layer.hide.mockClear();
    // the body is built but its head still streams: still standing in
    const body = stageBody(h, false);
    h.frame();
    expect(h.layer.hide).not.toHaveBeenCalled();
    // the body draws: off on that frame
    body.bodyShown = true;
    const shows = h.layer.show.mock.calls.length;
    h.frame();
    expect(h.layer.hide).toHaveBeenCalled();
    expect(h.layer.show.mock.calls.length).toBe(shows);
  });

  it('comes off when the stage hides, and never shows on a hidden stage', () => {
    const h = harness({ touch: false, creator: true });
    h.preview.setLoadingLayer(h.layer);
    h.preview.syncSize();
    expect(h.layer.show).toHaveBeenCalled();
    h.container.clientWidth = 0;
    h.container.clientHeight = 0;
    h.layer.hide.mockClear();
    h.preview.syncSize();
    expect(h.layer.hide).toHaveBeenCalled();
  });

  it('draws the bust while the camera frames the head and shoulders (a touch creator)', () => {
    const h = harness({ touch: true, creator: true });
    h.preview.setLoadingLayer(h.layer);
    h.preview.syncSize();
    expect(h.layer.show).toHaveBeenLastCalledWith(h.container, 'bust');
  });

  it('hands a replaced layer back before taking the new one', () => {
    const h = harness({ touch: false, creator: true });
    h.preview.setLoadingLayer(h.layer);
    h.preview.syncSize();
    expect(h.layer.show).toHaveBeenCalled();
    h.layer.hide.mockClear();
    const next = layerMock();
    h.preview.setLoadingLayer(next);
    expect(h.layer.hide).toHaveBeenCalledTimes(1);
    expect(next.show).toHaveBeenLastCalledWith(h.container, 'body');
  });
});

describe('the touch stage (a phone)', () => {
  it('opens the creator on the head and shoulders', () => {
    const h = harness({ touch: true, creator: true });
    stageBody(h, true);
    h.preview.syncSize();
    const want = touchShouldersPose(300 / 330, HEAD.y, HEAD.h);
    expect(h.pose().lookY).toBeCloseTo(want.lookY, 6);
    expect(h.pose().z).toBeCloseTo(want.z, 6);
    expect(h.pose().y).toBeCloseTo(want.y, 6);
  });

  it('opens any other stage (the roster pick) on the whole body', () => {
    const h = harness({ touch: true, creator: false });
    stageBody(h, true);
    h.preview.syncSize();
    expect(h.pose().z).toBeCloseTo(PREVIEW_FRAMING.sheet.z, 6);
    expect(h.pose().lookY).toBeCloseTo(PREVIEW_FRAMING.sheet.lookY, 6);
  });

  it('never moves the camera for a category: no zoom on Skin Tone', () => {
    const h = harness({ touch: true, creator: true });
    stageBody(h, true);
    h.preview.syncSize();
    const opened = { ...h.pose() };
    // the face builder opens Skin Tone (focusForCategory: 'face'), then Body Type ('body')
    h.preview.setFocus('face');
    for (let i = 0; i < 40; i++) h.frame();
    expect(h.pose()).toEqual(opened);
    h.preview.setFocus('body');
    for (let i = 0; i < 40; i++) h.frame();
    expect(h.pose()).toEqual(opened);
  });

  it('a desktop stage still eases to the face close-up for a category', () => {
    const h = harness({ touch: false, creator: true });
    stageBody(h, true);
    h.preview.syncSize();
    h.preview.setFocus('face');
    // the ease is time based (dt 0.016 a frame, FOCUS_EASE_SECONDS long): run it out
    for (let i = 0; i < 60; i++) h.frame();
    const face = creationFocusPose('face', 300 / 330, HEAD.y, HEAD.h, { w: 300, h: 330 });
    expect(h.pose().z).toBeCloseTo(face.z, 6);
    expect(h.pose().lookY).toBeCloseTo(face.lookY, 6);
  });
});

describe('the touch stage, frame by frame', () => {
  const step = (s: Partial<TouchStep>): TouchStep => ({
    dragX: 0,
    dragY: 0,
    pinch: 1,
    slideX: 0,
    slideY: 0,
    ...s,
  });
  const gesture = (h: Harness, s: Partial<TouchStep>) =>
    (h.preview as unknown as { applyTouchStep(s: TouchStep): void }).applyTouchStep(step(s));

  it('a pinch moves the camera on the next frame', () => {
    const h = harness({ touch: true, creator: true });
    stageBody(h, true);
    h.preview.syncSize();
    const opened = { ...h.pose() };
    // fingers closing: zoom out
    gesture(h, { pinch: 0.5 });
    h.frame();
    expect(h.pose().z).toBeGreaterThan(opened.z * 1.5);
  });

  it('a one-finger drag turns the character', () => {
    const h = harness({ touch: true, creator: true });
    const group = { rotation: { y: 0 } };
    h.state.characterGroup = group;
    stageBody(h, true);
    h.preview.syncSize();
    gesture(h, { dragX: 50 });
    expect(group.rotation.y).toBeCloseTo(0.5, 6);
  });

  it('keeps a category asked for on a touch stage, landed, for a stage that stops being one', () => {
    const opts = { touch: true, creator: true };
    const h = harness(opts);
    stageBody(h, true);
    h.preview.syncSize();
    h.preview.setFocus('face');
    // the phone interface is switched off: the face close-up holds at once, with no ease
    opts.touch = false;
    h.preview.syncSize();
    const face = creationFocusPose('face', 300 / 330, HEAD.y, HEAD.h, { w: 300, h: 330 });
    expect(h.pose().z).toBeCloseTo(face.z, 6);
    expect(h.pose().lookY).toBeCloseTo(face.lookY, 6);
  });

  it('re-aims the camera when the phone interface is switched with no resize', () => {
    const opts = { touch: true, creator: true };
    const h = harness(opts);
    stageBody(h, true);
    h.preview.syncSize();
    h.frame();
    const opened = { ...h.pose() };
    h.preview.setFocus('face');
    // switched to the desktop interface: the face close-up the editor asked for eases in
    opts.touch = false;
    for (let i = 0; i < 60; i++) h.frame();
    const face = creationFocusPose('face', 300 / 330, HEAD.y, HEAD.h, { w: 300, h: 330 });
    expect(h.pose().z).toBeCloseTo(face.z, 6);
    expect(h.pose().lookY).toBeCloseTo(face.lookY, 6);
    // and back to the phone interface: the opening shot at once, whatever the cache held
    opts.touch = true;
    h.frame();
    expect(h.pose().z).toBeCloseTo(opened.z, 6);
    expect(h.pose().lookY).toBeCloseTo(opened.lookY, 6);
  });

  it('re-solves the opening shot when the head measure changes (a body type switch)', () => {
    const h = harness({ touch: true, creator: true });
    stageBody(h, true);
    h.preview.syncSize();
    h.frame();
    const next = { y: 2.3, h: 0.5 };
    h.state.focusHead = next;
    h.frame();
    const want = touchShouldersPose(300 / 330, next.y, next.h);
    expect(h.pose().lookY).toBeCloseTo(want.lookY, 6);
    expect(h.pose().z).toBeCloseTo(want.z, 6);
  });

  it('a new stage puts the camera back on its opening shot', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const h = harness({ touch: true, creator: true });
    stageBody(h, true);
    h.preview.syncSize();
    const opened = { ...h.pose() };
    gesture(h, { pinch: 0.5, slideX: 40 });
    h.frame();
    expect(h.pose().z).not.toBeCloseTo(opened.z, 3);
    const next = { clientWidth: 300, clientHeight: 330, appendChild: vi.fn() };
    h.preview.setContainer(next as unknown as HTMLElement);
    expect(h.state.touchView).toBeNull();
    expect(h.pose().z).toBeCloseTo(opened.z, 6);
    expect(h.pose().lookY).toBeCloseTo(opened.lookY, 6);
  });

  it('the loading layer comes off when the loop parks on a hidden stage', () => {
    const h = harness({ touch: false, creator: true });
    h.preview.setLoadingLayer(h.layer);
    h.preview.syncSize();
    expect(h.layer.show).toHaveBeenCalled();
    h.layer.hide.mockClear();
    // the window closes without a resize callback: the next frame parks
    h.container.clientWidth = 0;
    h.frame();
    expect(h.layer.hide).toHaveBeenCalled();
  });
});

describe('the mouse turntable on a touch stage', () => {
  function withDragControls(touch: boolean) {
    const canvasHandlers = new Map<string, (e: unknown) => void>();
    const windowHandlers = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, h: (e: unknown) => void) => windowHandlers.set(type, h),
      removeEventListener: () => {},
    });
    const h = harness({ touch, creator: true });
    const group = { rotation: { y: 0 } };
    h.state.characterGroup = group;
    h.state.canvas = {
      isConnected: true,
      addEventListener: (type: string, fn: (e: unknown) => void) => canvasHandlers.set(type, fn),
      removeEventListener: () => {},
    };
    (h.preview as unknown as { setupDragControls(): void }).setupDragControls();
    const touchAt = (x: number) => ({ touches: [{ clientX: x }] });
    canvasHandlers.get('touchstart')?.(touchAt(100));
    windowHandlers.get('touchmove')?.(touchAt(150));
    return group;
  }

  it('a one-finger touch turns a plain stage, as before', () => {
    expect(withDragControls(false).rotation.y).toBeCloseTo(0.5, 6);
  });

  it('stands down on a touch stage (its own finger tracking turns it, never twice)', () => {
    expect(withDragControls(true).rotation.y).toBe(0);
  });
});
