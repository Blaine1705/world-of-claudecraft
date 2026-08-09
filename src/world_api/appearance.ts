// The authored modular-character look as a WIRE + STORAGE payload, and its
// bounds validation.
//
// No IWorld facet, unlike most of this directory: an appearance is not
// something the world is ASKED for, it is a document that crosses the trust
// boundary, so there is nothing for Sim and ClientWorld to implement in
// parallel and no parity pin to hold. What this module exports is the
// validator both sides call.
//
// This module is the ONE home the server and the client share for the
// appearance payload's shape, mirroring src/world_api/action_bar.ts: it is
// DOM-free, sim-free and three.js-free (plain types only), so `server/` (which
// must not import `src/render/` or `src/ui/`) and the browser both validate
// untrusted looks through the same function.
//
// DIVISION OF LABOUR, and it matters:
//  - HERE lives the BOUNDS check (is this a plausible, small, well-shaped
//    document?). It runs server-side on every write, because the server stores
//    the value and broadcasts it to other players.
//  - The MEANING of each field (which hair styles exist, what range a slider
//    takes) lives with the renderer, in normalizeAppearance
//    (src/render/characters/modular.ts). Every consumer already runs it before
//    composing a body, so an out-of-range value that survives this bounds check
//    can only ever clamp to a valid look at render time, never break one.
// Keeping the enum tables out of here is deliberate: duplicating ~40 style
// lists server-side would drift the day a new haircut lands. What this module
// pins instead is the key SET, which is guarded against drift by a test
// (tests/appearance_wire_bounds.test.ts) that checks it against the renderer's
// DEFAULT_APPEARANCE.

/** Every field a stored/wire appearance may carry. Unknown keys are dropped:
 *  a character row is broadcast to other players, so it must never become a
 *  channel for arbitrary attacker-chosen text. */
export const APPEARANCE_WIRE_KEYS: readonly string[] = [
  'gender',
  'hair',
  'beard',
  'brows',
  'earrings',
  'earringMaterial',
  'skinHue',
  'skinSat',
  'skinLight',
  'hairHue',
  'hairSat',
  'hairLight',
  'face',
  'body',
  'mouth',
  'eyeShape',
  'ears',
  'lashes',
  'lashHue',
  'lashSat',
  'lashLight',
  'eyeHue',
  'eyeSat',
  'eyeLight',
  'lipstick',
  'blush',
  'eyeshadow',
  'outfit',
];

/** The two nested maps (face + body morph sliders). Their KEYS are slider
 *  names and their values are numbers; both are bounded below. */
const NESTED_KEYS: readonly string[] = ['face', 'body'];

/** A style id is a short identifier ('fantasybraid'). Anything longer is not a
 *  style the renderer could match, so it is junk by definition. */
const MAX_STRING_LENGTH = 48;
/** Generous next to the ~10 real sliders per map, tight enough to bound a row. */
const MAX_NESTED_KEYS = 32;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One morph-slider map: string keys, finite numeric values, bounded count.
 *  Values are NOT range-clamped here (normalizeAppearance owns the -1..1
 *  rule); this only keeps the document small and numeric. */
function sanitizeSliderMap(value: unknown): Record<string, number> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, number> = {};
  let kept = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (kept >= MAX_NESTED_KEYS) break;
    if (key.length > MAX_STRING_LENGTH) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    out[key] = raw;
    kept++;
  }
  return out;
}

/**
 * Validate + bound an untrusted appearance payload. Returns a clean document
 * carrying only known keys with plausibly-typed values, or null when the input
 * is not a usable appearance at all. Never throws: a bad payload yields null so
 * the caller can answer 400 without crashing the request.
 *
 * Null covers TWO cases, and the second is load-bearing:
 *  - not an object, so there is nothing to read;
 *  - an object that contributed NO known key ({}, or nothing but junk keys).
 *    An empty document is not a look. Accepting it let `{"appearance":{}}`
 *    spend a character's one-shot redesign token and store a body nobody
 *    authored: the reroll's whole precondition is that the player is choosing
 *    a design, so "chose nothing" has to be a 400, not a spent token.
 *
 * The result is NOT guaranteed to name real styles: see the note above: the
 * renderer's normalizeAppearance is what turns it into a valid body.
 */
export function sanitizeAppearance(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const key of APPEARANCE_WIRE_KEYS) {
    if (!(key in value)) continue;
    const raw = value[key];
    if (NESTED_KEYS.includes(key)) {
      const map = sanitizeSliderMap(raw);
      if (map !== null) {
        out[key] = map;
        kept++;
      }
      continue;
    }
    if (typeof raw === 'boolean') out[key] = raw;
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'string' && raw.length <= MAX_STRING_LENGTH) out[key] = raw;
    // anything else (nested junk, oversized string, null) is simply dropped
    else continue;
    kept++;
  }
  return kept > 0 ? out : null;
}
