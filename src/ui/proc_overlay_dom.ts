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

// The Chronomancy (arcane) bird is a SEPARATE, hand-drawn phoenix used only under
// the arcane spec (the fire bird above is untouched). Same mirrored-half seam so
// the charges reveal it left wing -> right wing -> centre. One half = a wing
// (.ph-wing) + its two flowing tail feathers (.ph-side); the mirror makes the
// other side. The centre body + head + flame crest live in .ph-core-g.
const CHRONO_HALF = `
  <g class="ph-wing">
    <path fill="url(#cb-grad)" d="M101,76 C86,82 70,90 54,92 C40,94 30,90 24,82 L34,80 L22,72 L33,69 L20,60 L32,57 L21,48 L34,46 L26,36 L40,36 L34,24 L48,28 L46,16 C65,42 82,60 101,70 Z"/>
  </g>
  <g class="ph-side">
    <path fill="url(#cb-grad)" d="M109,106 C106,120 102,134 96,146 C100,136 100,126 98,116 C103,124 107,116 110,110 Z"/>
    <path fill="url(#cb-grad)" d="M108,108 C100,120 88,132 72,140 C58,147 50,156 53,164 C55,156 61,154 65,158 C62,150 69,144 78,140 C92,133 102,122 109,113 Z"/>
  </g>`;

/** Build the #proc-overlay element (not yet attached to the document). */
export function buildProcOverlay(doc: Document = document): HTMLElement {
  const el = doc.createElement('div');
  el.id = 'proc-overlay';
  el.setAttribute('aria-hidden', 'true'); // decorative fire, never announced
  el.innerHTML = `
<svg class="fire-bird" viewBox="0 0 220 170" xmlns="http://www.w3.org/2000/svg" focusable="false">
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
</svg>
<svg class="chrono-bird" viewBox="0 0 220 170" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
  <defs>
    <linearGradient id="cb-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9d5ff"/>
      <stop offset="0.55" stop-color="#a855f7"/>
      <stop offset="1" stop-color="#6b21a8"/>
    </linearGradient>
    <radialGradient id="cb-core" cx="0.5" cy="0.32" r="0.85">
      <stop offset="0" stop-color="#f3e8ff"/>
      <stop offset="1" stop-color="#9333ea"/>
    </radialGradient>
  </defs>
  <g class="ph-half ph-left">${CHRONO_HALF}</g>
  <g class="ph-half ph-right" transform="translate(220,0) scale(-1,1)">${CHRONO_HALF}</g>
  <g class="ph-core-g">
    <path fill="url(#cb-core)" d="M110,40 C106,44 105,49 107,54 C100,58 96,68 100,79 C102,90 105,100 110,108 C115,100 118,90 120,79 C124,68 120,58 113,54 C115,49 114,44 110,40 Z"/>
    <circle fill="url(#cb-core)" cx="110" cy="48" r="3"/>
    <path fill="url(#cb-core)" d="M110,8 C106,17 106,27 110,34 C114,27 114,17 110,8 Z"/>
    <path fill="url(#cb-core)" d="M100,20 C97,27 97,35 100,41 C103,35 103,27 100,20 Z"/>
    <path fill="url(#cb-core)" d="M120,20 C123,27 123,35 120,41 C117,35 117,27 120,20 Z"/>
    <path fill="url(#cb-core)" d="M91,28 C88,34 88,42 91,48 C94,42 94,34 91,28 Z"/>
    <path fill="url(#cb-core)" d="M129,28 C132,34 132,42 129,48 C126,42 126,34 129,28 Z"/>
  </g>
</svg>`;
  return el;
}
