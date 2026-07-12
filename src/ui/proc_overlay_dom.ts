// The Rising Phoenix proc overlay markup (owner design 2026-07-11, replacing
// the twin proc arcs): a fire-phoenix silhouette split down its vertical seam.
// Heating Up lights the LEFT half; Hot Streak completes the RIGHT, whitens the
// core and beats both wings ONCE; losing or spending the proc fades it out.
// Creation-time DOM only (built once by the Hud): the per-frame work stays the
// two toggled classes in proc_overlay_painter, and the pure state rule stays
// in proc_overlay_view. The two halves are DUPLICATED (the right one mirrored
// by a group transform) instead of <use>-instanced, because CSS cannot reach
// inside a <use> shadow tree and the wing-beat animation must select the wing.

const HALF = `
  <g class="ph-wing">
    <path class="ph-fire" d="M106,86 C82,84 60,74 44,52 C52,62 62,68 72,70 C60,58 52,44 50,28 C60,44 72,55 84,60 C78,48 76,36 80,22 C86,40 94,56 102,68 Z"/>
    <path class="ph-fire" d="M100,92 C78,96 62,106 52,122 C64,114 76,110 88,110 Z"/>
  </g>
  <g class="ph-side">
    <path class="ph-fire" d="M110,54 C103,58 99,66 98,76 L110,80 Z"/>
    <path class="ph-fire" d="M110,78 C102,86 98,98 100,112 C102,124 106,132 110,136 Z"/>
    <path class="ph-fire" d="M108,134 C98,142 90,154 88,166 C96,158 103,152 110,148 Z"/>
  </g>`;

/** Build the #proc-overlay element (not yet attached to the document). */
export function buildProcOverlay(doc: Document = document): HTMLElement {
  const el = doc.createElement('div');
  el.id = 'proc-overlay';
  el.setAttribute('aria-hidden', 'true'); // decorative fire, never announced
  el.innerHTML = `
<svg viewBox="0 0 220 170" xmlns="http://www.w3.org/2000/svg" focusable="false">
  <defs>
    <linearGradient id="ph-fire-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe27a"/>
      <stop offset="0.55" stop-color="#ff8c2e"/>
      <stop offset="1" stop-color="#e6421f"/>
    </linearGradient>
    <radialGradient id="ph-core-grad" cx="0.5" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#ffd98a"/>
      <stop offset="1" stop-color="#ff7a1f"/>
    </radialGradient>
    <radialGradient id="ph-core-white" cx="0.5" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#fff3c4"/>
      <stop offset="1" stop-color="#ffc45e"/>
    </radialGradient>
    <!-- Chronomancy (arcane) variant: the same bird in arcane violet, used under
         the .chrono theme class. Inert until referenced, so the fire path is
         byte-identical. -->
    <linearGradient id="ph-chrono-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9d5ff"/>
      <stop offset="0.55" stop-color="#a855f7"/>
      <stop offset="1" stop-color="#6b21a8"/>
    </linearGradient>
    <radialGradient id="ph-chrono-core" cx="0.5" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#f3e8ff"/>
      <stop offset="1" stop-color="#9333ea"/>
    </radialGradient>
    <radialGradient id="ph-chrono-white" cx="0.5" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#f3e8ff"/>
      <stop offset="1" stop-color="#c084fc"/>
    </radialGradient>
  </defs>
  <g class="ph-half ph-left">${HALF}</g>
  <g class="ph-half ph-right" transform="translate(220,0) scale(-1,1)">${HALF}</g>
  <g class="ph-core-g">
    <path class="ph-core" d="M110,58 C104,72 100,86 100,100 C100,118 104,130 110,138 C116,130 120,118 120,100 C120,86 116,72 110,58 Z"/>
    <path class="ph-crest" d="M110,56 C106,48 106,38 110,28 C114,38 114,48 110,56 Z"/>
  </g>
</svg>`;
  return el;
}
