// The meadow-continuum tuning surface: every knob for the "one continuous
// full-density meadow from the player's feet to the world rim" pass lives
// here, in one file, so a playtest note ("band ends too close", "ground too
// bright at dusk") maps to exactly one named constant.
//
// The governing rule the constants serve: the TERRAIN ALBEDO carries the
// grass look at every distance (a baked top-down render of the real blade
// clusters, tinted per vertex by the same palette the blades use), and
// geometry only ADDS 3D blades near the camera. No grass element is ever
// scaled up, and nothing on the ground layer varies with distance.
//
// PLAIN DATA on purpose (no Three import): far_terrain_core.ts is a pure
// Node-tested core and reads the paint constants from here.

// ---------------------------------------------------------------------------
// Mid-band blade clusters (blade_grass_band.ts)
// ---------------------------------------------------------------------------

/** Outer radius of the solid-blade band, in yards. Charlie's acceptance
 *  window is roughly 90 to 150; the band fades by scale collapse from
 *  MEADOW_BAND_FADE_START of this radius outward. */
export const MEADOW_BAND_RADIUS = 120;

/** Yards between band cluster cells. ONE constant density across the whole
 *  band (density falloff with distance is explicitly rejected); this is the
 *  primary cost knob. The near carpet's 0.46 cell stays untouched. */
export const MEADOW_BAND_CELL = 1.25;

/** Fraction of the band radius where the outer scale-collapse fade begins.
 *  Started at 0.8 (outer 20 percent only); lowered to 0.5 after the first
 *  playtest: a short fade window puts the whole grow-to-full-size ramp in
 *  one narrow ring, which reads as grass LOADING IN around the player as
 *  the ring travels. A long ramp spreads the growth over half the band so
 *  the field just gets gradually denser toward you. */
export const MEADOW_BAND_FADE_START = 0.5;

/** Same idea for the near carpet (blade_grass.ts reads this): fraction of
 *  GFX.bladeCarpetRadius where the carpet's scale-collapse fade begins.
 *  The carpet's own 0.8 was the strongest "loading in" read since its ring
 *  sits right at the player's feet; 0.5 makes the fine blades emerge over
 *  the outer half of the carpet instead of materializing at its rim. */
export const MEADOW_CARPET_FADE_START = 0.5;

/** Cluster re-placements per frame while the player moves (the toroidal
 *  scan's budget). A teleport backfills the full pool within about a
 *  second at this rate. */
export const MEADOW_BAND_PLACE_BUDGET = 1200;

// ---------------------------------------------------------------------------
// Baked ground texture (grass_ground_bake.ts)
// ---------------------------------------------------------------------------

/** World yards one repeat of the baked ground texture covers. The texture is
 *  sampled at TRUE world scale everywhere (no octave rescaling: rescaled
 *  blade strokes are scaled-up grass elements, which are banned), so this is
 *  also the tiling period. */
export const GRASS_BAKE_PATCH_YARDS = 8;

/** Baked texture resolution. 1024 over an 8-yard patch is 128 px/yard, about
 *  6 px across a blade stroke: resolved near, mip-averaged far. */
export const GRASS_BAKE_TEXTURE_SIZE = 1024;

/** Shade of the soil showing between blade strokes in the bake (linear grey).
 *  This is the ground texture's CONTRAST floor: lower reads as deeper
 *  shadowed turf, higher flattens the strokes toward one tone. */
export const GRASS_BAKE_SOIL_SHADE = 0.3;

/** Per-cluster grey jitter span in the bake (plus or minus around 1.0), so
 *  the tiling period is broken by value variety, never by rescaling. */
export const GRASS_BAKE_CLUSTER_JITTER = 0.12;

// ---------------------------------------------------------------------------
// Ground paint (terrain.ts splat grass layer + far_terrain.ts tiles)
// ---------------------------------------------------------------------------

/** The carpet lifts blade tint over the raw ground colour by this factor
 *  (blade_grass.ts multiplies groundGrassColorAt by 1.18: blades catch more
 *  sky than the soil they stand on). The paint carries the same lift so the
 *  ground equals the blades' own distant appearance BY CONSTRUCTION. */
export const GRASS_PAINT_BLADE_LIFT = 1.18;

/** The by-eye level trim over the constructed gain. Tune THIS from the
 *  rendered result under ACES tone mapping: the final meadow green channel
 *  should sit around linear 0.10 to 0.20 on the vale palette. Never derive
 *  it from tint constants (tint times a dark stroke texture washes white;
 *  the abandoned horizon-grass attempt proved it). */
export const GRASS_PAINT_TRIM = 0.8;

/** Full-strength gain the paint applies over the per-vertex grass tint
 *  (vColor). Derived, not hand-set: lift times trim. */
export const GRASS_PAINT_GAIN = GRASS_PAINT_BLADE_LIFT * GRASS_PAINT_TRIM;

/** How far the band blades' BASE colour sinks toward the painted ground
 *  under them (1 = exactly the ground's mip-average, 0 = no sink). Tips
 *  always keep the grass tint; this is what makes contact points vanish. */
export const MEADOW_BAND_BASE_SINK = 1.0;

/** Height (in cluster-local yards, before instance scale) over which a band
 *  blade recovers from the ground-sunk base colour to its own tint. */
export const MEADOW_BAND_BASE_RECOVER_Y = 0.55;

// ---------------------------------------------------------------------------
// Near-camera paint fade (terrain.ts ONLY, never the far tiles)
// ---------------------------------------------------------------------------
//
// The bake is a top-down render of a whole cluster field: its strokes ARE
// grass, but they are grass seen from a distance. Painted onto the ground a
// couple of yards from the eye they are blade drawings at arm's length, which
// reads as wallpaper under the player's feet, and that is exactly the ground
// the real blade carpet already stands on. So the near terrain fades the
// PATTERN out and lets the plain splat grass layer carry the albedo there,
// which is what the ground looked like before the meadow pass.
//
// The fade is a CAMERA-distance term, so it never moves the world: the same
// patch of meadow paints itself in as you back away. It belongs to the near
// splat shader alone. The far tiles start past the detail horizon and are
// never seen at these distances; their paint gate (the per-vertex grass
// weight in far_terrain.ts) stays distance-free, which is what keeps the
// vista's mip-averaged meadow identical to the near ground's.
//
// Continuity is by construction, not by eye: the plain layer is divided by
// its OWN top mip (so its average is exactly 1) and lifted to the bake's
// measured mean before the same vertex tint and paint gain the bake takes.
// Average colour is therefore unchanged across the whole ramp, so the band
// blades' ground-sunk bases and the far tiles still match, and no ring of
// brightness travels with the player.

/** Camera distance (yards) inside which the near ground shows NO baked blade
 *  pattern at all. Under a chase camera the ground at the player's feet sits
 *  roughly the zoom distance away, so this is "closer than a tight zoom". */
export const GRASS_PAINT_NEAR_START = 6;

/** Camera distance (yards) from which the paint is at full strength. The gap
 *  to GRASS_PAINT_NEAR_START is deliberately wide: a short ramp puts the
 *  whole handoff in one narrow ring, the same "loading in" read that forced
 *  MEADOW_BAND_FADE_START down to half the band radius. */
export const GRASS_PAINT_NEAR_END = 20;
