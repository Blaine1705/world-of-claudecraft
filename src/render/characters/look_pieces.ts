// A composed look's decal textures and geometries as PIECES of the GPU work
// queue, so a body whose styles the session has never seen does not build its
// maps inside the frame the entity enters range.
//
// The measurement behind it (tmp/h-bench-results-1.md, batch 2): 94 percent
// of a composed view build is the two procedural decal maps (the 1024^2 stubble
// map at 60 to 100 ms, the 512^2 makeup map at 20 ms) plus their head cuts,
// every one of them a pure function of the STYLE selection and cached per
// style key for the session; everything else in the build is about 1 ms. So
// the split is by piece, not by entity: each map is painted a band of rows at
// a time as its own queue unit (the same admission every other piece rides,
// gpu_prep_budget_core, learning the cost per label kind), a cut is one unit,
// pieces are deduped by key across the crowd, and the renderer HOLDS an entity
// whose pieces are not all resident (no view yet, exactly its state while a
// candidate waits its turn; never a partial body). Once resident, the next
// candidate pass builds the view off warm caches. Under a cover and for the
// local target the renderer never consults this seam: those builds stay
// synchronous.
import { modularHeadFor } from './assets';
import {
  ensureMakeupGeometry,
  hasMakeupGeometry,
  hasMakeupTexture,
  MAKEUP_TEX_SIZE,
  makeupKeyOf,
  makeupTextureFromData,
  makeupTextureRows,
} from './makeup';
import type { VisualDef } from './manifest';
import {
  type MakeupSelection,
  type ModularLook,
  makeupSelection,
  type StubbleSelection,
  stubbleDecals,
  wearsFaceDecal,
} from './modular';
import {
  DECAL_TEX_SIZE,
  decalKey,
  decalTextureFromData,
  decalTextureRows,
  ensureDecalGeometry,
  hasDecalGeometry,
  hasDecalTexture,
} from './stubble';

/** How many row bands a decal map is painted in: one queue unit computes
 *  1/16 of the map's rows. STRUCTURAL, not a timing: it fixes the size of a
 *  unit (a few ms for the stubble map), and the per-frame budget decides how
 *  many such units a frame admits, so no number here is tuned to a machine. */
export const LOOK_TEXTURE_BANDS = 16;

/** The slice of the background GPU queue a piece rides (synchronous CPU work
 *  is a valid unit there). */
export interface LookPieceQueue {
  run<T>(work: () => T | Promise<T>, priority?: number, label?: string): Promise<T>;
}

/** Label kinds (the prefix up to the first colon, gpuPrepKindOfLabel): one
 *  per texture family so the budget learns each map's band cost apart, and
 *  one for the cuts. */
export const STUBBLE_BAND_LABEL = 'decal-stubble';
export const MAKEUP_BAND_LABEL = 'decal-makeup';
export const DECAL_GEOMETRY_LABEL = 'decal-geometry';

interface LookPiece {
  key: string;
  start(queue: LookPieceQueue, priority: number): Promise<void>;
}

const inFlight = new Set<string>();
const warned = new Set<string>();
let completedPieces = 0;
let bandsRun = 0;
let holds = 0;

async function runTextureBands(
  queue: LookPieceQueue,
  priority: number,
  labelKind: string,
  key: string,
  size: number,
  paintRows: (out: Uint8Array<ArrayBuffer>, rowStart: number, rowEnd: number) => void,
  publish: (data: Uint8Array<ArrayBuffer>) => void,
): Promise<void> {
  const data = new Uint8Array(new ArrayBuffer(size * size * 4));
  const rowsPerBand = size / LOOK_TEXTURE_BANDS;
  for (let band = 0; band < LOOK_TEXTURE_BANDS; band++) {
    const last = band === LOOK_TEXTURE_BANDS - 1;
    // The next band is enqueued from this unit's completion, never all at
    // once, so a map in progress holds one slot in the queue, not sixteen.
    await queue.run(
      () => {
        paintRows(data, band * rowsPerBand, (band + 1) * rowsPerBand);
        bandsRun++;
        if (last) publish(data);
      },
      priority,
      `${labelKind}:${key}:${band}`,
    );
  }
}

function stubbleTexturePiece(sel: StubbleSelection): LookPiece {
  const key = decalKey(sel);
  return {
    key: `stubble:${key}`,
    start: (queue, priority) =>
      runTextureBands(
        queue,
        priority,
        STUBBLE_BAND_LABEL,
        key,
        DECAL_TEX_SIZE,
        (out, rowStart, rowEnd) => decalTextureRows(sel, out, rowStart, rowEnd, DECAL_TEX_SIZE),
        (data) => decalTextureFromData(sel, data),
      ),
  };
}

function makeupTexturePiece(sel: Pick<MakeupSelection, 'blush' | 'eyeshadow'>): LookPiece {
  const key = makeupKeyOf(sel);
  return {
    key: `makeup:${key}`,
    start: (queue, priority) =>
      runTextureBands(
        queue,
        priority,
        MAKEUP_BAND_LABEL,
        key,
        MAKEUP_TEX_SIZE,
        (out, rowStart, rowEnd) => makeupTextureRows(sel, out, rowStart, rowEnd, MAKEUP_TEX_SIZE),
        (data) => makeupTextureFromData(sel, data),
      ),
  };
}

function geometryPiece(key: string, ensure: () => void): LookPiece {
  return {
    key,
    start: (queue, priority) => queue.run(ensure, priority, `${DECAL_GEOMETRY_LABEL}:${key}`),
  };
}

/** Every piece the look needs that is not resident yet. The head comes from
 *  the cached part-set variant; when the part library has not landed there is
 *  no head to cut and the cuts are not this seam's to wait on (the fail-soft
 *  build reports the miss). */
function missingPieces(def: VisualDef, look: ModularLook): LookPiece[] {
  if (!def.modular) return [];
  const stubble = stubbleDecals(look.app, look.worn);
  const wantsStubble = stubble.scalp !== null || stubble.beard !== null;
  const makeup = makeupSelection(look.app, look.worn);
  const wantsMakeup = wearsFaceDecal(makeup);
  if (!wantsStubble && !wantsMakeup) return [];
  const missing: LookPiece[] = [];
  if (wantsStubble && !hasDecalTexture(stubble)) missing.push(stubbleTexturePiece(stubble));
  if (wantsMakeup && !hasMakeupTexture(makeup)) missing.push(makeupTexturePiece(makeup));
  const head = modularHeadFor(def, look);
  if (!head) return missing;
  const headGeometry = head.geometry;
  if (wantsStubble && !hasDecalGeometry(headGeometry, stubble)) {
    missing.push(
      geometryPiece(`stubble-geometry:${headGeometry.uuid}|${decalKey(stubble)}`, () =>
        ensureDecalGeometry(head, stubble),
      ),
    );
  }
  if (wantsMakeup && !hasMakeupGeometry(headGeometry)) {
    missing.push(
      geometryPiece(`makeup-geometry:${headGeometry.uuid}`, () => ensureMakeupGeometry(head)),
    );
  }
  return missing;
}

function startPieces(pieces: LookPiece[], queue: LookPieceQueue, priority: number): void {
  for (const piece of pieces) {
    if (inFlight.has(piece.key)) continue;
    inFlight.add(piece.key);
    piece.start(queue, priority).then(
      () => {
        inFlight.delete(piece.key);
        completedPieces++;
      },
      (err: unknown) => {
        // Dropped so a later enqueue retries it; the report is once per key
        // (a queue shut down by a graphics rebuild rejects every unit at once).
        inFlight.delete(piece.key);
        if (warned.has(piece.key)) return;
        warned.add(piece.key);
        console.warn(`[look-pieces] ${piece.key} failed, will retry on demand:`, err);
      },
    );
  }
}

/** True when every piece the look needs is resident, so a view build off it
 *  is the ~1 ms cache-hit build. */
export function composedLookReady(def: VisualDef, look: ModularLook): boolean {
  return missingPieces(def, look).length === 0;
}

/** Enqueue every missing piece of the look not already in flight. */
export function enqueueComposedLookPieces(
  def: VisualDef,
  look: ModularLook,
  queue: LookPieceQueue,
  priority: number,
): void {
  startPieces(missingPieces(def, look), queue, priority);
}

/** The renderer's one call on the live candidate path: false when the look is
 *  ready (build now), true when the entity is to be HELD this pass, with its
 *  missing pieces enqueued (deduped) and the hold counted. */
export function holdComposedLookView(
  def: VisualDef,
  look: ModularLook,
  queue: LookPieceQueue,
  priority: number,
): boolean {
  const missing = missingPieces(def, look);
  if (missing.length === 0) return false;
  startPieces(missing, queue, priority);
  noteLookHold();
  return true;
}

/** Count a view hold decided by the renderer. */
export function noteLookHold(): void {
  holds++;
}

export interface LookPiecesStats {
  /** Pieces enqueued and not yet resident. */
  pending: number;
  completedPieces: number;
  /** Texture band units that ran. */
  bandsRun: number;
  /** View builds the renderer held for missing pieces. */
  holds: number;
}

export function lookPiecesStats(): LookPiecesStats {
  return { pending: inFlight.size, completedPieces, bandsRun, holds };
}

export function resetLookPiecesForTest(): void {
  inFlight.clear();
  warned.clear();
  completedPieces = 0;
  bandsRun = 0;
  holds = 0;
}
