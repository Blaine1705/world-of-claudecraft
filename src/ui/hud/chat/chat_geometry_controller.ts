import { t } from '../../i18n';
import { storePromoReservedHeight } from '../../store_promo_card';
import {
  cursorForFrameEdge,
  type FrameEdge,
  frameEdgeAtPoint,
  MIN_FRAME_BOX,
} from '../../target_frame_pos';
import {
  anchorAdjustedChatBox,
  CHAT_BOX_LIMITS,
  type ChatBoxGeometry,
  parseChatBox,
  placeChatBox,
  serializeChatBox,
} from './chat_window';

const CHAT_GEOMETRY_KEY = 'woc_chat_geometry';
const MOBILE_CHAT_BOTTOM_KEY = 'woc_mobile_chat_bottom';
/** Delay for the trailing post-resize re-derive, long enough for a fullscreen
 *  transition's window metrics to settle (mirrors MovableFrame's). */
const CHAT_RESIZE_SETTLE_MS = 200;

export interface ChatGeometryControllerDeps {
  document: Document;
  window: Window;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  isMobileLayout(): boolean;
  hasStorePromoCard(): boolean;
  uiScale(): number;
  /** True while the global "Unlock interface" toggle is on: the whole chat box
   *  then drags from anywhere, not only the tab strip, so it moves like every
   *  other unlocked HUD frame. Optional so callers without the toggle (tests)
   *  keep the tab-strip-only contract unchanged. */
  isInterfaceUnlocked?(): boolean;
}

type ChatBoxGesture =
  | { kind: 'move'; pointerId: number; grabX: number; grabY: number }
  | {
      kind: 'resize';
      pointerId: number;
      startX: number;
      startY: number;
      startW: number;
      startH: number;
    }
  | {
      // The arrange-mode border resize: the chat box is one of the two frames
      // whose contents genuinely reflow, so every border sizes the real box.
      // `edge` also decides which corner stays anchored.
      kind: 'edge';
      pointerId: number;
      edge: FrameEdge;
      startX: number;
      startY: number;
      startLeft: number;
      startTop: number;
      startW: number;
      startH: number;
    };

export class ChatGeometryController {
  private chatBox: ChatBoxGeometry | null = null;
  private chatBoxGesture: ChatBoxGesture | null = null;
  private mobileChatResize: {
    pointerId: number;
    startY: number;
    startBottom: number;
  } | null = null;
  /** Elides the inline border-hover cursor write (a CSS keyword, never text). */
  private hoverCursor = '';
  /** Coalesces the trailing post-resize re-derive (CHAT_RESIZE_SETTLE_MS). */
  private resizeSettleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: ChatGeometryControllerDeps) {}

  init(): void {
    const wrap = this.deps.document.getElementById('chatlog-wrap');
    const tabs = this.deps.document.getElementById('chatlog-tabs');
    const frame = this.deps.document.getElementById('chatlog-frame');
    if (!wrap || !tabs || !frame) return;

    const grip = this.deps.document.createElement('div');
    grip.className = 'chat-resize-grip';
    grip.title = t('hudChrome.chatWindow.resize');
    grip.setAttribute('aria-hidden', 'true');
    frame.appendChild(grip);

    const resizeHandle = this.deps.document.createElement('div');
    resizeHandle.className = 'chat-mobile-resize';
    resizeHandle.title = t('hudChrome.chatWindow.resize');
    resizeHandle.setAttribute('aria-hidden', 'true');
    this.deps.document.body.appendChild(resizeHandle);
    resizeHandle.addEventListener('pointerdown', (event) =>
      this.onMobileResizeStart(event, resizeHandle),
    );
    resizeHandle.addEventListener('pointermove', (event) => this.onMobileResizeMove(event));
    const endMobileResize = (event: PointerEvent): void => this.onMobileResizeEnd(event);
    resizeHandle.addEventListener('pointerup', endMobileResize);
    resizeHandle.addEventListener('pointercancel', endMobileResize);
    try {
      const savedBottom = this.deps.storage.getItem(MOBILE_CHAT_BOTTOM_KEY);
      if (savedBottom) {
        const clamped = this.clampMobileBottom(Number.parseInt(savedBottom, 10) || 52);
        this.deps.document.documentElement.style.setProperty(
          '--mobile-chat-bottom',
          `${clamped}px`,
        );
      }
    } catch {
      // Storage can be unavailable in private browsing modes.
    }

    tabs.setAttribute('aria-label', t('hudChrome.chatWindow.move'));
    tabs.addEventListener('pointerdown', (event) => this.onMoveStart(event, wrap, tabs));
    // While the interface is unlocked the whole box is a drag handle (its panes
    // are pointer-inert under body.interface-unlocked, so the event target is
    // the wrap itself). The tab strip keeps its own listener either way.
    wrap.addEventListener('pointerdown', (event) => {
      if (!this.deps.isInterfaceUnlocked?.()) return;
      // Border first, body second: the same desktop-window split every other
      // unlocked frame uses. The chat box has no MovableFrame, so it wires the
      // shared edge helpers itself.
      const edge = this.edgeAt(event, wrap);
      if (edge) this.onEdgeStart(event, wrap, tabs, edge);
      else this.onMoveStart(event, wrap, tabs);
    });
    wrap.addEventListener('pointermove', (event) => {
      if (this.chatBoxGesture || !this.deps.isInterfaceUnlocked?.()) return;
      const edge = this.edgeAt(event, wrap);
      const cursor = edge ? cursorForFrameEdge(edge) : '';
      if (cursor !== this.hoverCursor) {
        this.hoverCursor = cursor;
        wrap.style.cursor = cursor;
      }
    });
    // The arrange-mode name chip every movable frame wears; resolved at init
    // like the tab strip's own aria label above, and shown by the stylesheet
    // only under body.interface-unlocked.
    const frameLabel = this.deps.document.createElement('span');
    frameLabel.className = 'tf-frame-label';
    frameLabel.textContent = t('hudChrome.interfaceUnlock.frameNames.chat');
    wrap.appendChild(frameLabel);
    grip.addEventListener('pointerdown', (event) => this.onResizeStart(event, wrap, frame));
    this.deps.document.addEventListener('pointermove', (event) => this.onPointerMove(event));
    const end = (event: PointerEvent): void => this.onPointerEnd(event);
    this.deps.document.addEventListener('pointerup', end);
    this.deps.document.addEventListener('pointercancel', end);
    // Derive from the SAVED geometry rather than the last render: apply()
    // clamps into the current viewport AND keeps the clamped box, so leaving
    // fullscreen would otherwise make the shrink permanent. From storage,
    // growing the window back restores the exact saved box. A box that never
    // reached storage keeps its in-memory one; a live drag owns the geometry.
    const rederiveFromSaved = () => {
      if (!this.chatBox) return;
      if (this.chatBoxGesture === null) {
        const savedBox = this.loadSaved();
        // A payload without the viewport stamp cannot re-anchor honestly; the
        // in-memory box carries the stamp of the viewport it was last applied
        // under (the pre-change one), so it is the better basis then.
        if (savedBox?.vw !== undefined) this.chatBox = savedBox;
      }
      this.apply();
    };
    this.deps.window.addEventListener('resize', () => {
      // Once now and once after the metrics settle: a resize event fired
      // mid-transition (an OS fullscreen exit, emulated viewports) can still
      // observe the OLD innerWidth/Height, making the re-anchor a silent
      // no-op with no follow-up event to correct it. The trailing pass
      // re-derives from storage again, which is idempotent.
      rederiveFromSaved();
      clearTimeout(this.resizeSettleTimer);
      this.resizeSettleTimer = setTimeout(rederiveFromSaved, CHAT_RESIZE_SETTLE_MS);
    });

    this.chatBox = this.loadSaved();
    if (this.chatBox) {
      const legacy = this.chatBox.vw === undefined;
      this.apply();
      // One-time migration, exactly as MovableFrame does it: a pre-stamp save
      // cannot re-anchor, so the apply above stamps the current viewport and
      // the persist upgrades the save in place.
      if (legacy) this.persist();
    }
  }

  private loadSaved(): ChatBoxGeometry | null {
    let saved: string | null = null;
    try {
      saved = this.deps.storage.getItem(CHAT_GEOMETRY_KEY);
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
    return parseChatBox(saved);
  }

  reapply(): void {
    const host = this.deps.document.getElementById('chatlog-wrap');
    const tabs = this.deps.document.getElementById('chatlog-tabs');
    if (host && tabs) this.ensureGeometry(host, tabs);
    this.apply();
  }

  reset(): void {
    this.chatBox = null;
    try {
      this.deps.storage.removeItem(CHAT_GEOMETRY_KEY);
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
    for (const id of ['chatlog-wrap', 'chatlog-frame', 'chat-input']) {
      const element = this.deps.document.getElementById(id);
      if (!element) continue;
      for (const property of ['left', 'top', 'right', 'bottom', 'width', 'height']) {
        element.style.removeProperty(property);
      }
    }
  }

  private ensureGeometry(wrap: HTMLElement, tabs: HTMLElement): void {
    if (this.chatBox) return;
    const wrapRect = wrap.getBoundingClientRect();
    const frameRect = this.deps.document.getElementById('chatlog-frame')?.getBoundingClientRect();
    const chromeHeight = tabs.getBoundingClientRect().height;
    this.chatBox = {
      left: wrapRect.left,
      top: wrapRect.top,
      width: wrapRect.width,
      height: frameRect ? frameRect.height : Math.max(0, wrapRect.height - chromeHeight),
    };
  }

  private onMoveStart(event: PointerEvent, wrap: HTMLElement, tabs: HTMLElement): void {
    if (event.button !== 0 || this.deps.isMobileLayout()) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest('button')) return;
    event.preventDefault();
    this.ensureGeometry(wrap, tabs);
    const rect = wrap.getBoundingClientRect();
    this.chatBoxGesture = {
      kind: 'move',
      pointerId: event.pointerId,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
    };
    this.deps.document.body.classList.add('chat-box-dragging');
    try {
      tabs.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers do not always implement capture.
    }
  }

  /** Which border of the chat wrap the pointer is on, or null for its body. */
  private edgeAt(event: PointerEvent, wrap: HTMLElement): FrameEdge | null {
    if (this.deps.isMobileLayout()) return null;
    return frameEdgeAtPoint(wrap.getBoundingClientRect(), event.clientX, event.clientY);
  }

  private onEdgeStart(
    event: PointerEvent,
    wrap: HTMLElement,
    tabs: HTMLElement,
    edge: FrameEdge,
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.ensureGeometry(wrap, tabs);
    if (!this.chatBox) return;
    this.chatBoxGesture = {
      kind: 'edge',
      pointerId: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: this.chatBox.left,
      startTop: this.chatBox.top,
      startW: this.chatBox.width,
      startH: this.chatBox.height,
    };
    this.deps.document.body.classList.add('chat-box-dragging');
    try {
      wrap.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers do not always implement capture.
    }
  }

  private onResizeStart(event: PointerEvent, wrap: HTMLElement, frame: HTMLElement): void {
    if (event.button !== 0 || this.deps.isMobileLayout()) return;
    event.preventDefault();
    event.stopPropagation();
    const tabs = this.deps.document.getElementById('chatlog-tabs');
    if (tabs) this.ensureGeometry(wrap, tabs);
    if (!this.chatBox) return;
    this.chatBoxGesture = {
      kind: 'resize',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startW: this.chatBox.width,
      startH: this.chatBox.height,
    };
    this.deps.document.body.classList.add('chat-box-dragging');
    try {
      frame.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers do not always implement capture.
    }
  }

  private onPointerMove(event: PointerEvent): void {
    const gesture = this.chatBoxGesture;
    if (!gesture || gesture.pointerId !== event.pointerId || !this.chatBox) return;
    event.preventDefault();
    if (gesture.kind === 'move') {
      this.chatBox = {
        ...this.chatBox,
        left: event.clientX - gesture.grabX,
        top: event.clientY - gesture.grabY,
      };
    } else if (gesture.kind === 'edge') {
      // Recomputed from the gesture-start snapshot each event, so a west/north
      // drag keeps the opposite border anchored for the whole gesture.
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const width = gesture.edge.includes('w')
        ? Math.max(MIN_FRAME_BOX, gesture.startW - dx)
        : gesture.edge.includes('e')
          ? Math.max(MIN_FRAME_BOX, gesture.startW + dx)
          : gesture.startW;
      const height = gesture.edge.includes('n')
        ? Math.max(MIN_FRAME_BOX, gesture.startH - dy)
        : gesture.edge.includes('s')
          ? Math.max(MIN_FRAME_BOX, gesture.startH + dy)
          : gesture.startH;
      this.chatBox = {
        left: gesture.edge.includes('w')
          ? gesture.startLeft + (gesture.startW - width)
          : gesture.startLeft,
        top: gesture.edge.includes('n')
          ? gesture.startTop + (gesture.startH - height)
          : gesture.startTop,
        width,
        height,
      };
    } else {
      this.chatBox = {
        ...this.chatBox,
        width: gesture.startW + (event.clientX - gesture.startX),
        height: gesture.startH + (event.clientY - gesture.startY),
      };
    }
    this.apply();
  }

  private onPointerEnd(event: PointerEvent): void {
    const gesture = this.chatBoxGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.chatBoxGesture = null;
    this.deps.document.body.classList.remove('chat-box-dragging');
    this.persist();
  }

  private clampMobileBottom(value: number): number {
    const maximum = Math.max(12, this.deps.window.innerHeight - 320);
    return Math.min(maximum, Math.max(12, value));
  }

  private onMobileResizeStart(event: PointerEvent, handle: HTMLElement): void {
    if (!this.deps.isMobileLayout()) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = this.deps.document.documentElement.style.getPropertyValue('--mobile-chat-bottom');
    const startBottom = this.clampMobileBottom(raw ? Number.parseInt(raw, 10) || 52 : 52);
    this.mobileChatResize = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startBottom,
    };
    this.deps.document.body.classList.add('chat-box-dragging');
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers do not always implement capture.
    }
  }

  private onMobileResizeMove(event: PointerEvent): void {
    const gesture = this.mobileChatResize;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const bottom = this.clampMobileBottom(gesture.startBottom - (event.clientY - gesture.startY));
    this.deps.document.documentElement.style.setProperty(
      '--mobile-chat-bottom',
      `${Math.round(bottom)}px`,
    );
  }

  private onMobileResizeEnd(event: PointerEvent): void {
    const gesture = this.mobileChatResize;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.mobileChatResize = null;
    this.deps.document.body.classList.remove('chat-box-dragging');
    const bottom =
      this.deps.document.documentElement.style.getPropertyValue('--mobile-chat-bottom');
    try {
      if (bottom) this.deps.storage.setItem(MOBILE_CHAT_BOTTOM_KEY, bottom.trim());
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
  }

  private apply(): void {
    if (!this.chatBox || this.deps.isMobileLayout()) return;
    const wrap = this.deps.document.getElementById('chatlog-wrap');
    const tabs = this.deps.document.getElementById('chatlog-tabs');
    const frame = this.deps.document.getElementById('chatlog-frame');
    if (!wrap || !tabs || !frame) return;
    const chromeHeight = tabs.getBoundingClientRect().height || 22;
    const scale = this.deps.uiScale();
    const viewport = { w: this.deps.window.innerWidth, h: this.deps.window.innerHeight };
    // A box saved under a different viewport re-anchors per axis first, so a
    // bottom-parked chat rides the bottom edge across a fullscreen exit; the
    // applied geometry is stamped with the CURRENT viewport for the next save.
    const placement = placeChatBox(
      anchorAdjustedChatBox(this.chatBox, chromeHeight, viewport),
      viewport,
      chromeHeight,
      scale,
      CHAT_BOX_LIMITS,
      this.deps.hasStorePromoCard() ? (width) => storePromoReservedHeight(width, scale) : 0,
    );
    this.chatBox = { ...placement.geo, vw: viewport.w, vh: viewport.h };
    const { css } = placement;
    wrap.style.left = `${css.left}px`;
    wrap.style.top = `${css.top}px`;
    wrap.style.right = 'auto';
    wrap.style.bottom = 'auto';
    wrap.style.width = `${css.width}px`;
    frame.style.height = `${css.height}px`;

    const input = this.deps.document.getElementById('chat-input');
    if (input) {
      const { geo } = placement;
      input.style.left = `${geo.left}px`;
      input.style.width = `${geo.width}px`;
      input.style.bottom = `${Math.max(0, this.deps.window.innerHeight - geo.top + 4)}px`;
    }
  }

  private persist(): void {
    if (!this.chatBox) return;
    try {
      this.deps.storage.setItem(CHAT_GEOMETRY_KEY, serializeChatBox(this.chatBox));
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
  }
}
