// Canvas-2D painter for the world map's CONTINENT overview level.
//
// The imperative half of the pure-core + painter split: the pure geometry lives
// in continent_map_view.ts (buildContinentMapModel, unit-tested there); this
// module turns that flat draw model into canvas draws. It owns the 2D context,
// the decoded continent art plate, and the localized labels + color resolution.
// Hud routes here from updateMapWindow when the map level is 'continent'; the
// per-zone overworld branch stays in map_window_painter.ts.
//
// CADENCE: like the per-zone map, the continent redraws while open from
// hud.update()'s mediumHud band, so the art plate simply appears on the next
// redraw after it decodes (no repaint callback needed).
//
// NO-MAGIC-VALUES: a 2D context cannot read CSS vars, so the painter resolves the
// --color-map-* tokens via getComputedStyle ONCE per redraw (cached for the
// frame, never per-region); every other literal (font, radius, line width) is a
// named constant.
//
// ZONE WASH, NOT ZONE RECTANGLES. A zone's world bounds are a rectangle, but
// drawing that rectangle turned the plate into a grid of boxes and made the hover
// highlight a box over the sea. Instead the hovered (and the current) zone is
// washed through the LAND MASK built from the plate itself
// (continent_land_mask.ts), faded out near its own bounds, so the highlight
// follows the coastline, skips the lakes and rivers, and softens the one edge
// that is genuinely straight: the border it shares with the next zone. No plate,
// no mask: the wash degrades to the flat rectangle fill, which is still the only
// affordance available without art.

import type { IWorld } from '../world_api';
import { loadContinentArt } from './continent_art';
import { buildLandMaskCanvas } from './continent_land_mask';
import {
  buildContinentMapModel,
  CONTINENT_FALLBACK_ASPECT,
  type ContinentMapModel,
  type ContinentRect,
  type ContinentZoneRegion,
} from './continent_map_view';
import { zoneDisplayName } from './entity_i18n';
import { t } from './i18n';

// Typography (Georgia, matching the per-zone map painter).
const TITLE_FONT = 'bold 16px Georgia';
const TITLE_BASELINE_Y = 20; // px from the canvas top
const LABEL_FONT = 'bold 12px Georgia';
const LABEL_HOVER_FONT = 'bold 13px Georgia';
const LABEL_LINE_WIDTH = 3; // text outline width
// Zone wash: how far it fades in from the zone's own bounds, as a fraction of the
// zone's shorter side, with a floor so a thin band still fades. The fade is what
// keeps the border two zones share from reading as the drawn straight line it
// geometrically is.
const WASH_FEATHER_FRACTION = 0.14;
const WASH_FEATHER_MIN_PX = 6;
// Alpha-ramp endpoints for that fade. These are MASK stops, not themeable colors:
// the ramp composites destination-in, so only its alpha is ever read and the RGB
// it carries never reaches a pixel.
const MASK_STOP_OPAQUE = 'white';
const MASK_STOP_CLEAR = 'transparent';
// "You are here" marker: a filled dot inside a steady ring (no animation).
const HERE_DOT_RADIUS = 3.5;
const HERE_RING_RADIUS = 6.5;
const HERE_RING_LINE_WIDTH = 2;
// Party member dots (issue 2652): smaller than the player's own dot and with a
// thinner outline, so self stays the emphasized marker at a glance.
const PARTY_DOT_RADIUS = 3;
const PARTY_DOT_LINE_WIDTH = 1.5;

// The --color-map-* design tokens the painter resolves once per redraw. The
// label/outline/player group is shared with the per-zone map painter; the ocean
// and region groups are this level's own (the continent ocean is a wide visible
// letterbox beside the plate, so it tracks the plate art, not the zone map's
// off-map backdrop).
const CONTINENT_COLOR_TOKENS = {
  ocean: '--color-map-continent-ocean',
  label: '--color-map-label',
  outline: '--color-map-outline',
  player: '--color-map-player',
  partyDead: '--color-map-party-dead',
  regionHoverFill: '--color-map-region-hover-fill',
  regionCurrentFill: '--color-map-region-current-fill',
  regionCurrentLabel: '--color-map-region-current-label',
} as const;

type ContinentColors = Record<keyof typeof CONTINENT_COLOR_TOKENS, string>;

export interface ContinentPaintOptions {
  /** The square map-canvas side in px. */
  canvasSize: number;
  /** The zone id under the cursor, or null (drives the hover highlight). */
  hoveredZoneId: string | null;
}

export interface ContinentPaintResult {
  /** The painted zone regions, for Hud's hover/click hit-test (continentZoneAt). */
  regions: ContinentZoneRegion[];
}

/**
 * Owns painting the continent overview onto the map-window canvas. One instance
 * is built by Hud; it loads the art plate once and reuses it across redraws.
 */
export class ContinentMapPainter {
  private art: HTMLImageElement | null = null;
  private artState: 'idle' | 'loading' | 'ready' | 'missing' = 'idle';
  // The land mask built from the plate, and whether that build has been attempted
  // (it is one-shot: a null mask after an attempt means the flat fallback wash,
  // never a rebuild per redraw).
  private mask: HTMLCanvasElement | null = null;
  private maskBuilt = false;
  // Scratch surface the wash is composited on before it is blitted over the art.
  // Kept at the map canvas size and reused; resizing clears it, which is exactly
  // what a fresh composite wants anyway.
  private scratch: HTMLCanvasElement | null = null;
  private scratchCtx: CanvasRenderingContext2D | null = null;

  /** classColor resolves a party member's class to its display color (issue
   *  2652), the same resolver Hud threads into MinimapPainter / DelveMapPainter
   *  / MapWindowPainter, so a member reads as the same color on every surface. */
  constructor(private readonly classColor: (cls: string) => string) {}

  private ensureArt(): void {
    if (this.artState !== 'idle') return;
    this.artState = 'loading';
    loadContinentArt(
      (img) => {
        this.art = img;
        this.artState = 'ready';
      },
      () => {
        this.artState = 'missing';
      },
    );
  }

  /** Build the land mask once the plate has decoded. One attempt per session: the
   *  plate is static, and a mask that could not be built (no context, a tainted
   *  canvas) will not build on the next redraw either. */
  private ensureMask(): HTMLCanvasElement | null {
    if (this.maskBuilt) return this.mask;
    if (this.artState !== 'ready' || !this.art) return null;
    this.maskBuilt = true;
    this.mask = buildLandMaskCanvas(this.art, this.art.naturalWidth, this.art.naturalHeight);
    return this.mask;
  }

  /** The reusable composite surface, sized to the square map canvas. */
  private ensureScratch(
    S: number,
  ): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    if (!this.scratch) {
      this.scratch = document.createElement('canvas');
      this.scratchCtx = null;
    }
    if (this.scratch.width !== S || this.scratch.height !== S) {
      this.scratch.width = S;
      this.scratch.height = S;
    }
    if (!this.scratchCtx) this.scratchCtx = this.scratch.getContext('2d');
    return this.scratchCtx ? { canvas: this.scratch, ctx: this.scratchCtx } : null;
  }

  private resolveColors(): ContinentColors {
    const cs = getComputedStyle(document.documentElement);
    const read = (token: string): string => cs.getPropertyValue(token).trim();
    const colors = {} as ContinentColors;
    for (const key of Object.keys(
      CONTINENT_COLOR_TOKENS,
    ) as (keyof typeof CONTINENT_COLOR_TOKENS)[]) {
      colors[key] = read(CONTINENT_COLOR_TOKENS[key]);
    }
    return colors;
  }

  /** Paint the continent overview for one redraw and report the zone regions. */
  paintContinent(
    ctx: CanvasRenderingContext2D,
    world: IWorld,
    opts: ContinentPaintOptions,
  ): ContinentPaintResult {
    this.ensureArt();
    const contentAspect =
      this.art && this.art.naturalHeight > 0
        ? this.art.naturalWidth / this.art.naturalHeight
        : CONTINENT_FALLBACK_ASPECT;
    const model = buildContinentMapModel({
      world,
      canvasSize: opts.canvasSize,
      contentAspect,
      hoveredZoneId: opts.hoveredZoneId,
    });
    const colors = this.resolveColors();
    this.draw(ctx, model, opts.canvasSize, colors);
    return { regions: model.regions };
  }

  private draw(
    ctx: CanvasRenderingContext2D,
    model: ContinentMapModel,
    S: number,
    colors: ContinentColors,
  ): void {
    // Open ocean under everything, then the continent art (if decoded) fitted to
    // the model's dest rect. Regions, labels and the player marker draw on top.
    ctx.fillStyle = colors.ocean;
    ctx.fillRect(0, 0, S, S);
    if (this.artState === 'ready' && this.art) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.art, model.image.mx, model.image.my, model.image.w, model.image.h);
    }

    // Zone highlights, and deliberately no borders: the zone the player stands in
    // carries a permanent quiet wash and the hovered one a brighter wash on top,
    // both masked to the painted land. Hovering your own zone draws the hover
    // alone rather than stacking the two.
    const hovered = model.regions.find((r) => r.isHovered);
    const current = model.regions.find((r) => r.isCurrent && !r.isHovered);
    if (current) this.wash(ctx, model.image, current.rect, S, colors.regionCurrentFill);
    if (hovered) this.wash(ctx, model.image, hovered.rect, S, colors.regionHoverFill);

    // Zone name labels: outlined for legibility over the art, hovered one lifted
    // to the top with the larger font. Loop-invariant text state is set per label
    // only where it changes (font differs for the hovered entry).
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = LABEL_LINE_WIDTH;
    for (const region of model.regions) {
      if (region.isHovered) continue; // drawn last, on top
      ctx.font = LABEL_FONT;
      this.label(ctx, region, colors);
    }
    if (hovered) {
      ctx.font = LABEL_HOVER_FONT;
      this.label(ctx, hovered, colors);
    }

    // Party members (issue 2652): one class-colored dot per member (the dead
    // token for a fallen one), drawn BEFORE the player marker so self always
    // reads on top when the group is stacked together. No name labels here: the
    // zone cells are already full of their own labels at this scale, so naming
    // members stays the per-zone map's job (see ContinentPartyMarker).
    if (model.party.length > 0) {
      ctx.strokeStyle = colors.outline;
      ctx.lineWidth = PARTY_DOT_LINE_WIDTH;
      for (const member of model.party) {
        ctx.fillStyle = member.dead ? colors.partyDead : this.classColor(member.cls);
        ctx.beginPath();
        ctx.arc(member.mx, member.my, PARTY_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // "You are here": a filled dot in a ring at the player's projected position.
    if (model.player) {
      ctx.fillStyle = colors.player;
      ctx.strokeStyle = colors.outline;
      ctx.lineWidth = HERE_RING_LINE_WIDTH;
      ctx.beginPath();
      ctx.arc(model.player.mx, model.player.my, HERE_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(model.player.mx, model.player.my, HERE_RING_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Overview title (drawn on-canvas; the map window has no DOM title).
    ctx.font = TITLE_FONT;
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = LABEL_LINE_WIDTH;
    ctx.strokeStyle = colors.outline;
    ctx.fillStyle = colors.label;
    const title = t('hudChrome.continentMap.title');
    ctx.strokeText(title, S / 2, TITLE_BASELINE_Y);
    ctx.fillText(title, S / 2, TITLE_BASELINE_Y);
  }

  private label(
    ctx: CanvasRenderingContext2D,
    region: ContinentZoneRegion,
    colors: ContinentColors,
  ): void {
    const text = zoneDisplayName(region.zoneId);
    ctx.strokeStyle = colors.outline;
    // The zone the player stands in is the one the borders used to call out; its
    // label carries that job now, so the "where am I" read survives their removal.
    ctx.fillStyle = region.isCurrent ? colors.regionCurrentLabel : colors.label;
    ctx.strokeText(text, region.labelX, region.labelY);
    ctx.fillText(text, region.labelX, region.labelY);
  }

  /**
   * Wash one zone in `fill`, masked to the painted land and faded out toward the
   * zone's own bounds. Composited on the scratch surface (the mask and the fade
   * have to intersect before anything lands on the map), then blitted over the
   * art in one draw.
   *
   * Falls back to a flat rectangle fill when there is no mask (no plate, no 2D
   * context, or a cross-origin plate that tainted the mask canvas), so the
   * highlight is never simply absent.
   */
  private wash(
    ctx: CanvasRenderingContext2D,
    image: ContinentRect,
    rect: ContinentRect,
    S: number,
    fill: string,
  ): void {
    const mask = this.ensureMask();
    const scratch = mask ? this.ensureScratch(S) : null;
    if (!mask || !scratch) {
      ctx.fillStyle = fill;
      ctx.fillRect(rect.mx, rect.my, rect.w, rect.h);
      return;
    }
    const sctx = scratch.ctx;
    sctx.clearRect(0, 0, S, S);
    // The land mask, positioned exactly like the plate it was built from.
    sctx.globalCompositeOperation = 'source-over';
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(mask, image.mx, image.my, image.w, image.h);
    // Tint it: source-in keeps the mask's alpha and takes the token's color and
    // its own alpha, so the token alone decides how strong the wash reads.
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = fill;
    sctx.fillRect(0, 0, S, S);
    // Confine it to this zone, fading over the feather band on all four sides.
    // Two destination-in ramps multiply into a soft-edged rectangle; outside the
    // ramps the end stop is transparent, which clears the rest of the surface.
    sctx.globalCompositeOperation = 'destination-in';
    const feather = Math.max(WASH_FEATHER_MIN_PX, Math.min(rect.w, rect.h) * WASH_FEATHER_FRACTION);
    sctx.fillStyle = this.featherRamp(sctx, rect.mx, rect.w, feather, false);
    sctx.fillRect(0, 0, S, S);
    sctx.fillStyle = this.featherRamp(sctx, rect.my, rect.h, feather, true);
    sctx.fillRect(0, 0, S, S);
    sctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch.canvas, 0, 0);
  }

  /** One axis of the feathered-rectangle mask: clear at the zone's edge, opaque a
   *  feather inside it. A band narrower than two feathers collapses to a single
   *  opaque midpoint rather than inverting. */
  private featherRamp(
    ctx: CanvasRenderingContext2D,
    start: number,
    size: number,
    feather: number,
    vertical: boolean,
  ): CanvasGradient {
    const end = start + size;
    const grad = vertical
      ? ctx.createLinearGradient(0, start, 0, end)
      : ctx.createLinearGradient(start, 0, end, 0);
    const ramp = size > 0 ? Math.min(0.5, feather / size) : 0.5;
    grad.addColorStop(0, MASK_STOP_CLEAR);
    grad.addColorStop(ramp, MASK_STOP_OPAQUE);
    grad.addColorStop(1 - ramp, MASK_STOP_OPAQUE);
    grad.addColorStop(1, MASK_STOP_CLEAR);
    return grad;
  }
}
