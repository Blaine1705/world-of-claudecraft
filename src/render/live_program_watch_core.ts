// Which shader programs the driver minted INSIDE a live draw, after the
// loading curtain is gone.
//
// Everything else in the prep machinery reports what it PREPARED. Nothing
// reported what escaped: a variant no prewarm entry covered links on its first
// draw, synchronously, and the only way to see it was the external capture kit
// (scripts/profiler). three keeps the answer in plain sight, because
// `renderer.info.programs` is the live WebGLProgram list, so a diff of that list
// around the frame's render call names every program a session minted there.
//
// AROUND the render call, not per frame: compileAsync's synchronous prologue
// also pushes WebGLPrograms onto that list, so every gate, prewarm piece and
// background compile mints programs between two frames legitimately. The host
// therefore ABSORBS the list right before it draws (those are prep) and
// collects right after (those are escapes).
//
// Pure bookkeeping: no Three, no DOM, no clock. The renderer hands in the list
// and records the labels this returns; the diff itself is host-agnostic, which
// is what makes it testable without a GL context.
//
// Allocation discipline (this runs every frame): the list LENGTH is compared
// first and the walk happens only when it grew, the labels land in a
// caller-owned array, and the identity set holds strings, not program objects.

/** The fields this core reads off three's WebGLProgram. */
export interface LiveProgramEntry {
  /** three's monotonically increasing program id (WebGLProgram `id`). */
  id?: number;
  cacheKey?: string;
  /** three's shader name, which for a built-in material IS its type. */
  name?: string;
}

export interface LiveProgramWatch {
  /** Identities already seen, so a program is reported exactly once. */
  known: Set<string>;
  lastLength: number;
  armed: boolean;
}

export function createLiveProgramWatch(): LiveProgramWatch {
  return { known: new Set<string>(), lastLength: 0, armed: false };
}

/**
 * How a program is remembered. The id first: three mints it once per LINK
 * (programIdCount++), so a cache hit keeps its id and a genuinely new link
 * always brings a fresh one, which a cacheKey alone cannot say after a
 * program was released and relinked.
 */
export function liveProgramIdentity(program: LiveProgramEntry): string {
  if (typeof program.id === 'number') return `#${program.id}`;
  return program.cacheKey ?? program.name ?? '';
}

/** What the recorded event is named after. */
export function liveProgramLabel(program: LiveProgramEntry): string {
  return program.name || program.cacheKey || 'program';
}

/**
 * Adopt the current list as the baseline and start watching. Called at the
 * reveal receipt: every program linked behind the curtain is prep, not an
 * escape, so only what appears AFTER this point is reported.
 */
export function armLiveProgramWatch(
  watch: LiveProgramWatch,
  programs: readonly LiveProgramEntry[] | undefined,
): void {
  watch.known.clear();
  watch.armed = true;
  watch.lastLength = 0;
  if (!programs) return;
  for (const program of programs) watch.known.add(liveProgramIdentity(program));
  watch.lastLength = programs.length;
}

export function disarmLiveProgramWatch(watch: LiveProgramWatch): void {
  watch.armed = false;
  watch.known.clear();
  watch.lastLength = 0;
}

/**
 * Adopt every program minted since the last call as prep, silently. Called
 * right before the frame's render: what the queue's compile prologues pushed
 * between two frames is preparation, and only what the draw itself mints
 * afterwards is an escape. Same cost profile as the collect below.
 */
export function absorbLivePrograms(
  watch: LiveProgramWatch,
  programs: readonly LiveProgramEntry[] | undefined,
): void {
  if (!watch.armed || !programs) return;
  if (programs.length <= watch.lastLength) {
    watch.lastLength = programs.length;
    return;
  }
  for (const program of programs) watch.known.add(liveProgramIdentity(program));
  watch.lastLength = programs.length;
}

/**
 * Labels of the programs that appeared since the last absorb or collect,
 * pushed into `out` (caller-owned, cleared here). Zero work before the arm,
 * and zero beyond a length compare on a draw that linked nothing.
 *
 * A SHORTER list is three releasing a program with its last material: the
 * length is re-seated so the next mint is still seen as new, and the released
 * identity stays in the set, which is harmless because a relink takes a fresh
 * id. The set is therefore bounded by the programs a session ever linked.
 */
export function collectNewLivePrograms(
  watch: LiveProgramWatch,
  programs: readonly LiveProgramEntry[] | undefined,
  out: string[],
): number {
  out.length = 0;
  if (!watch.armed || !programs) return 0;
  if (programs.length <= watch.lastLength) {
    watch.lastLength = programs.length;
    return 0;
  }
  for (const program of programs) {
    const identity = liveProgramIdentity(program);
    if (watch.known.has(identity)) continue;
    watch.known.add(identity);
    out.push(liveProgramLabel(program));
  }
  watch.lastLength = programs.length;
  return out.length;
}
