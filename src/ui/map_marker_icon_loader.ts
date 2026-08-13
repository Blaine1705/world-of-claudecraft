// Bounded browser adapter for the stable map-marker paintings. One Hud-owned
// instance decodes each 64px WebP once and pre-rasterizes only the exact sizes
// requested by the painters. Every raster gets a crisp light exterior keyline
// over the master's dark contour. Gathering state is also baked here: cooldown
// uses a smaller grayscale subject inside a broken neutral ring, and locked
// variants retain a bronze padlock whether the node is ready or cooling down.
// Rift/delve navigation and reward state is baked by the same bounded cache:
// rank notches, sealed locks, active rings, opened checks, jammed crosses, and
// bountiful corner points never run in either painter's redraw loop.
// All treatment happens once here, never in a redraw. A missing/loading asset
// returns null so procedural fallbacks remain available.

import {
  MAP_MARKER_ART_IDS,
  MAP_MARKER_SIZES,
  type MapMarkerArt,
  type MapMarkerArtId,
  type MapMarkerSize,
  mapMarkerIconUrl,
  mapMarkerSizesFor,
} from './map_marker_icon_art';

type IconLoadState = HTMLImageElement | 'loading' | 'missing';
type ImageFactory = () => HTMLImageElement | null;

const MARKER_KEYLINE_COLOR = '#f5dfad';
const GATHER_COOLDOWN_ARC_DARK = '#24292a';
const GATHER_COOLDOWN_ARC_LIGHT = '#c8cdcc';
const GATHER_LOCK_DARK = '#24170f';
const GATHER_LOCK_BRONZE = '#d39a45';
const GATHER_LOCK_HIGHLIGHT = '#f2c46d';
const MARKER_KEYLINE_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
const MARKER_SOURCE_INSET = 1;
// Keep the cooled-down identity large enough that ore, wood, and herb remain
// distinguishable beneath the timer ring and optional lock at the 16px
// standard minimap size. The state still reads through grayscale, smaller
// outer footprint, the broken ring, and absence of the ready glow.
const GATHER_COOLDOWN_SOURCE_INSET = 2;
const GATHER_COOLDOWN_ARC_DARK_WIDTH = 3;
const GATHER_COOLDOWN_ARC_LIGHT_WIDTH = 1.5;
const GATHER_COOLDOWN_ARC_EDGE_INSET = 3;
const GATHER_COOLDOWN_ARC_START = (Math.PI * 5) / 12;
const GATHER_COOLDOWN_ARC_END = GATHER_COOLDOWN_ARC_START + (Math.PI * 5) / 3;
const GATHER_LOCK_BADGE_WIDTH_RATIO = 0.34;
const GATHER_LOCK_BADGE_MIN_WIDTH = 6;
const GATHER_LOCK_BODY_HEIGHT_RATIO = 0.58;
const GATHER_LOCK_BODY_MIN_HEIGHT = 4;
const GATHER_LOCK_BADGE_EDGE_INSET = 2;
const GATHER_LOCK_SHACKLE_RADIUS_RATIO = 0.28;
const GATHER_LOCK_SHACKLE_CENTER_LIFT = 0.5;
const GATHER_LOCK_SHACKLE_DARK_WIDTH = 3;
const GATHER_LOCK_SHACKLE_BRONZE_WIDTH = 1.4;
const GRAYSCALE_LUMA_RED = 0.2126;
const GRAYSCALE_LUMA_GREEN = 0.7152;
const GRAYSCALE_LUMA_BLUE = 0.0722;
const GRAYSCALE_CONTRAST = 0.75;
const GRAYSCALE_LIFT = 40;
const SEMANTIC_DARK = '#171a1d';
const SEMANTIC_BRONZE = '#c28a42';
const SEMANTIC_SILVER = '#d7dce1';
const SEMANTIC_GOLD = '#f2c357';
const SEMANTIC_CYAN = '#70d8ff';
const SEMANTIC_JAMMED = '#e56d45';
const SEMANTIC_OPENED = '#d8dddc';

function isGatherCooldown(size: MapMarkerSize): boolean {
  return size.includes('GatherCooldown');
}

function isGatherLocked(size: MapMarkerSize): boolean {
  return size.includes('Gather') && size.includes('Locked');
}

function isSemanticOpened(size: MapMarkerSize): boolean {
  return size.includes('RewardOpened');
}

function isSemanticJammed(size: MapMarkerSize): boolean {
  return size.includes('RewardJammed');
}

function isSemanticLocked(size: MapMarkerSize): boolean {
  return size.includes('NavigationLocked') || size.includes('RewardLocked');
}

function isSemanticActive(size: MapMarkerSize): boolean {
  return size.includes('RewardActive');
}

function isSemanticBountiful(size: MapMarkerSize): boolean {
  return size.includes('Reward') && size.includes('Bountiful');
}

function semanticRank(size: MapMarkerSize): 'C' | 'B' | 'A' | 'S' | null {
  if (size.includes('NavigationRankC')) return 'C';
  if (size.includes('NavigationRankB')) return 'B';
  if (size.includes('NavigationRankA')) return 'A';
  if (size.includes('NavigationRankS')) return 'S';
  return null;
}

/** The clockwise arc leaves a sixty-degree gap at the lower right. That gap
 * reads as an incomplete timer at micro scale and reserves clear space for
 * the independent padlock on a combined cooldown + locked node. */
function drawGatherCooldownArc(ctx: CanvasRenderingContext2D, pixels: number): void {
  const center = pixels / 2;
  const radius = center - GATHER_COOLDOWN_ARC_EDGE_INSET;
  ctx.lineCap = 'round';
  ctx.strokeStyle = GATHER_COOLDOWN_ARC_DARK;
  ctx.lineWidth = GATHER_COOLDOWN_ARC_DARK_WIDTH;
  ctx.beginPath();
  ctx.arc(center, center, radius, GATHER_COOLDOWN_ARC_START, GATHER_COOLDOWN_ARC_END);
  ctx.stroke();
  ctx.strokeStyle = GATHER_COOLDOWN_ARC_LIGHT;
  ctx.lineWidth = GATHER_COOLDOWN_ARC_LIGHT_WIDTH;
  ctx.beginPath();
  ctx.arc(center, center, radius, GATHER_COOLDOWN_ARC_START, GATHER_COOLDOWN_ARC_END);
  ctx.stroke();
}

/** A simplified two-value padlock survives the smallest standard raster. The
 * dark under-shape separates it from both bright ore and pale cooldown art;
 * the bronze body and one-pixel highlight keep it in the forged UI family. */
function drawGatherLockBadge(ctx: CanvasRenderingContext2D, pixels: number): void {
  const width = Math.max(
    GATHER_LOCK_BADGE_MIN_WIDTH,
    Math.round(pixels * GATHER_LOCK_BADGE_WIDTH_RATIO),
  );
  const bodyHeight = Math.max(
    GATHER_LOCK_BODY_MIN_HEIGHT,
    Math.round(width * GATHER_LOCK_BODY_HEIGHT_RATIO),
  );
  const x = pixels - width - GATHER_LOCK_BADGE_EDGE_INSET;
  const y = pixels - bodyHeight - GATHER_LOCK_BADGE_EDGE_INSET;
  const shackleX = x + width / 2;
  const shackleY = y + GATHER_LOCK_SHACKLE_CENTER_LIFT;
  const shackleRadius = width * GATHER_LOCK_SHACKLE_RADIUS_RATIO;

  ctx.lineCap = 'round';
  ctx.strokeStyle = GATHER_LOCK_DARK;
  ctx.lineWidth = GATHER_LOCK_SHACKLE_DARK_WIDTH;
  ctx.beginPath();
  ctx.arc(shackleX, shackleY, shackleRadius, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = GATHER_LOCK_BRONZE;
  ctx.lineWidth = GATHER_LOCK_SHACKLE_BRONZE_WIDTH;
  ctx.beginPath();
  ctx.arc(shackleX, shackleY, shackleRadius, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = GATHER_LOCK_DARK;
  ctx.fillRect(x - 1, y - 1, width + 2, bodyHeight + 2);
  ctx.fillStyle = GATHER_LOCK_BRONZE;
  ctx.fillRect(x, y, width, bodyHeight);
  ctx.fillStyle = GATHER_LOCK_HIGHLIGHT;
  ctx.fillRect(x + 1, y + 1, Math.max(1, width - 2), 1);
  ctx.fillStyle = GATHER_LOCK_DARK;
  ctx.fillRect(Math.round(shackleX) - 1, y + 2, 2, Math.max(1, bodyHeight - 2));
}

function drawSemanticLockBadge(ctx: CanvasRenderingContext2D, pixels: number): void {
  drawGatherLockBadge(ctx, pixels);
}

function drawSemanticRank(
  ctx: CanvasRenderingContext2D,
  pixels: number,
  rank: 'C' | 'B' | 'A' | 'S',
): void {
  const center = pixels / 2;
  const radius = center - 2.5;
  const count = rank === 'C' ? 1 : rank === 'B' ? 2 : rank === 'A' ? 3 : 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = SEMANTIC_DARK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = rank === 'C' ? SEMANTIC_BRONZE : rank === 'B' ? SEMANTIC_SILVER : SEMANTIC_GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
  const notchWidth = Math.max(2, Math.round(pixels * 0.1));
  const startX = Math.round(center - ((count - 1) * (notchWidth + 1)) / 2);
  ctx.fillStyle = SEMANTIC_DARK;
  for (let index = 0; index < count; index++) {
    ctx.fillRect(startX + index * (notchWidth + 1) - 1, 0, notchWidth + 2, 4);
  }
  ctx.fillStyle = rank === 'C' ? SEMANTIC_BRONZE : rank === 'B' ? SEMANTIC_SILVER : SEMANTIC_GOLD;
  for (let index = 0; index < count; index++) {
    ctx.fillRect(startX + index * (notchWidth + 1), 0, notchWidth, 3);
  }
  if (rank === 'S') {
    // S keeps the four-notch progression but also owns a bottom diamond. This
    // survives compact downsampling and makes A/S distinct by silhouette, not
    // merely by one crowded top notch or the shared gold ring.
    const diamondY = pixels - 4;
    ctx.fillStyle = SEMANTIC_DARK;
    ctx.fillRect(Math.round(center) - 2, diamondY - 1, 5, 5);
    ctx.fillStyle = SEMANTIC_GOLD;
    ctx.fillRect(Math.round(center) - 1, diamondY, 3, 3);
  }
}

function drawSemanticActive(ctx: CanvasRenderingContext2D, pixels: number): void {
  const center = pixels / 2;
  const radius = center - 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = SEMANTIC_DARK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center, center, radius, Math.PI / 4, Math.PI * 1.75);
  ctx.stroke();
  ctx.strokeStyle = SEMANTIC_CYAN;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(center, center, radius, Math.PI / 4, Math.PI * 1.75);
  ctx.stroke();
}

function drawSemanticOpened(ctx: CanvasRenderingContext2D, pixels: number): void {
  const badge = Math.max(6, Math.round(pixels * 0.34));
  const x = pixels - badge - 1;
  const y = 1;
  ctx.fillStyle = SEMANTIC_DARK;
  ctx.fillRect(x, y, badge, badge);
  ctx.strokeStyle = SEMANTIC_OPENED;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 1.5, y + badge * 0.52);
  ctx.lineTo(x + badge * 0.42, y + badge - 1.5);
  ctx.lineTo(x + badge - 1, y + 1.5);
  ctx.stroke();
}

function drawSemanticJammed(ctx: CanvasRenderingContext2D, pixels: number): void {
  const inset = Math.max(3, Math.round(pixels * 0.18));
  ctx.lineCap = 'round';
  ctx.strokeStyle = SEMANTIC_DARK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  ctx.lineTo(pixels - inset, pixels - inset);
  ctx.moveTo(pixels - inset, inset);
  ctx.lineTo(inset, pixels - inset);
  ctx.stroke();
  ctx.strokeStyle = SEMANTIC_JAMMED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(inset, inset);
  ctx.lineTo(pixels - inset, pixels - inset);
  ctx.moveTo(pixels - inset, inset);
  ctx.lineTo(inset, pixels - inset);
  ctx.stroke();
}

function drawSemanticBountiful(ctx: CanvasRenderingContext2D, pixels: number): void {
  const center = Math.round(pixels / 2);
  const length = Math.max(3, Math.round(pixels * 0.16));
  ctx.fillStyle = SEMANTIC_DARK;
  ctx.fillRect(center - 2, 0, 4, length + 1);
  ctx.fillRect(center - 2, pixels - length - 1, 4, length + 1);
  ctx.fillRect(0, center - 2, length + 1, 4);
  ctx.fillRect(pixels - length - 1, center - 2, length + 1, 4);
  ctx.fillStyle = SEMANTIC_GOLD;
  ctx.fillRect(center - 1, 0, 2, length);
  ctx.fillRect(center - 1, pixels - length, 2, length);
  ctx.fillRect(0, center - 1, length, 2);
  ctx.fillRect(pixels - length, center - 1, length, 2);
}

/** Neutralize a cooldown sprite without flattening its painted facets. The
 * contrast lift keeps the master's near-black contour distinct from the pale
 * outer keyline after a 16px to 32px downsample. Alpha is never changed. */
export function grayscaleMapMarkerPixels(data: Uint8ClampedArray): void {
  for (let offset = 0; offset < data.length; offset += 4) {
    const luma =
      data[offset] * GRAYSCALE_LUMA_RED +
      data[offset + 1] * GRAYSCALE_LUMA_GREEN +
      data[offset + 2] * GRAYSCALE_LUMA_BLUE;
    const gray = Math.min(255, Math.round(luma * GRAYSCALE_CONTRAST + GRAYSCALE_LIFT));
    data[offset] = gray;
    data[offset + 1] = gray;
    data[offset + 2] = gray;
  }
}

function browserImage(): HTMLImageElement | null {
  return typeof Image === 'undefined' ? null : new Image();
}

export function createMapMarkerArt(
  hostDocument: Pick<Document, 'createElement'>,
  createImage: ImageFactory = browserImage,
): MapMarkerArt {
  const images = new Map<MapMarkerArtId, IconLoadState>();
  const sprites = new Map<MapMarkerArtId, Map<MapMarkerSize, HTMLCanvasElement>>();
  let scratch: HTMLCanvasElement | null = null;

  const rasterize = (id: MapMarkerArtId, image: HTMLImageElement): void => {
    if (sprites.has(id)) return;
    const bySize = new Map<MapMarkerSize, HTMLCanvasElement>();
    for (const sizeId of mapMarkerSizesFor(id)) {
      const pixels = MAP_MARKER_SIZES[sizeId];
      scratch ??= hostDocument.createElement('canvas');
      scratch.width = pixels;
      scratch.height = pixels;
      const scratchCtx = scratch.getContext('2d');
      if (!scratchCtx) {
        images.set(id, 'missing');
        return;
      }
      scratchCtx.clearRect(0, 0, pixels, pixels);
      scratchCtx.imageSmoothingEnabled = true;
      scratchCtx.imageSmoothingQuality = 'high';
      const sourceInset = isGatherCooldown(sizeId)
        ? GATHER_COOLDOWN_SOURCE_INSET
        : MARKER_SOURCE_INSET;
      const contentPixels = pixels - sourceInset * 2;
      scratchCtx.drawImage(image, sourceInset, sourceInset, contentPixels, contentPixels);
      if (isGatherCooldown(sizeId) || isSemanticOpened(sizeId) || isSemanticJammed(sizeId)) {
        try {
          const imageData = scratchCtx.getImageData(0, 0, pixels, pixels);
          grayscaleMapMarkerPixels(imageData.data);
          scratchCtx.putImageData(imageData, 0, 0);
        } catch {
          // Same-origin project art should always allow pixel access. Retain a
          // truthful neutral silhouette if a host nevertheless denies it.
          scratchCtx.globalCompositeOperation = 'source-in';
          scratchCtx.fillStyle = '#9ba1a2';
          scratchCtx.fillRect(0, 0, pixels, pixels);
          scratchCtx.globalCompositeOperation = 'source-over';
        }
      }
      const canvas = hostDocument.createElement('canvas');
      canvas.width = pixels;
      canvas.height = pixels;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        images.set(id, 'missing');
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      for (const [dx, dy] of MARKER_KEYLINE_OFFSETS) ctx.drawImage(scratch, dx, dy);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = MARKER_KEYLINE_COLOR;
      ctx.fillRect(0, 0, pixels, pixels);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(scratch, 0, 0);
      if (isGatherCooldown(sizeId)) drawGatherCooldownArc(ctx, pixels);
      if (isGatherLocked(sizeId)) drawGatherLockBadge(ctx, pixels);
      if (isSemanticLocked(sizeId)) drawSemanticLockBadge(ctx, pixels);
      const rank = semanticRank(sizeId);
      if (rank) drawSemanticRank(ctx, pixels, rank);
      if (isSemanticActive(sizeId)) drawSemanticActive(ctx, pixels);
      if (isSemanticOpened(sizeId)) drawSemanticOpened(ctx, pixels);
      if (isSemanticJammed(sizeId)) drawSemanticJammed(ctx, pixels);
      if (isSemanticBountiful(sizeId)) drawSemanticBountiful(ctx, pixels);
      bySize.set(sizeId, canvas);
    }
    sprites.set(id, bySize);
    images.set(id, image);
  };

  const ensure = (id: MapMarkerArtId): void => {
    if (images.has(id)) return;
    const image = createImage();
    if (!image) {
      images.set(id, 'missing');
      return;
    }
    image.decoding = 'async';
    images.set(id, 'loading');
    image.onload = () => rasterize(id, image);
    image.onerror = () => images.set(id, 'missing');
    image.src = mapMarkerIconUrl(id);
    if (image.complete && image.naturalWidth > 0) rasterize(id, image);
  };

  return {
    sprite(id, size): CanvasImageSource | null {
      ensure(id);
      return sprites.get(id)?.get(size) ?? null;
    },
    preload(): void {
      for (const id of MAP_MARKER_ART_IDS) ensure(id);
    },
  };
}
