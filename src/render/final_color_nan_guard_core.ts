const OPAQUE_GUARD_MARKER = 'WOC_OPAQUE_NAN_GUARD';
const FOG_GUARD_MARKER = 'WOC_FOG_NAN_GUARD';

const OPAQUE_WRITE = 'gl_FragColor = vec4( outgoingLight, diffuseColor.a );';
const FOG_WRITE = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';

// Every NaN comparison is false, so (x < 0.0 || x >= 0.0) keeps finite and
// infinite values and rewrites only NaN to zero: the same per-component test
// OutputGradePass's sanitizeFinite already applies one stage later, for the
// composer/gradePass tiers only (post_output_grade.ts).
function scrubStatements(target: string): string {
  return (
    `${target}.x = ( ${target}.x < 0.0 || ${target}.x >= 0.0 ) ? ${target}.x : 0.0;\n` +
    `${target}.y = ( ${target}.y < 0.0 || ${target}.y >= 0.0 ) ? ${target}.y : 0.0;\n` +
    `${target}.z = ( ${target}.z < 0.0 || ${target}.z >= 0.0 ) ? ${target}.z : 0.0;\n`
  );
}

/**
 * Scrub NaN out of outgoingLight immediately before opaque_fragment writes it
 * to gl_FragColor. Every material that includes this chunk (lit and basic
 * alike) gets the guard, applied once, right before the write it protects.
 */
export function patchOpaqueFragmentNanGuard(source: string): string {
  if (source.includes(OPAQUE_GUARD_MARKER)) return source;
  const index = source.indexOf(OPAQUE_WRITE);
  if (index < 0) throw new Error('Three opaque_fragment anchor changed');
  return (
    source.slice(0, index) +
    `// ${OPAQUE_GUARD_MARKER}\n` +
    scrubStatements('outgoingLight') +
    source.slice(index)
  );
}

/**
 * opaque_fragment's guard is not the last word: fog_fragment mixes fogColor
 * into gl_FragColor.rgb afterward, so a NaN arriving through vFogDepth or a
 * fog uniform would still reach the backbuffer unscrubbed. Copy to a local
 * before scrubbing: chained-swizzle assignment (gl_FragColor.rgb.x = ...) is
 * not reliable GLSL ES across drivers.
 */
export function patchFogFragmentNanGuard(source: string): string {
  if (source.includes(FOG_GUARD_MARKER)) return source;
  const index = source.indexOf(FOG_WRITE);
  if (index < 0) throw new Error('Three fog_fragment anchor changed');
  const insertAt = index + FOG_WRITE.length;
  return (
    source.slice(0, insertAt) +
    `\n// ${FOG_GUARD_MARKER}\n` +
    'vec3 wocFogNanGuard = gl_FragColor.rgb;\n' +
    scrubStatements('wocFogNanGuard') +
    'gl_FragColor.rgb = wocFogNanGuard;' +
    source.slice(insertAt)
  );
}
