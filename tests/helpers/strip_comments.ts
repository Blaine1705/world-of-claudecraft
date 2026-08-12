// Blank out TS/JS comments while preserving line count and column positions,
// so a source-scan pin cannot be satisfied (or falsely tripped) by prose: a
// commented-out `case 'review':` must not satisfy a presence pin, and a
// comment that names Math.random must not trip an absence scan.
//
// Same shape as the tests/architecture.test.ts helper, which keeps its own
// copy by design (a load-bearing guard stays self-contained); the two are not
// lockstep-pinned and may drift independently.
// One alternation, so leftmost-first matching decides precedence: a line
// comment whose text contains /* is consumed AS a line comment instead of
// opening a bogus block that swallows everything to the next */ elsewhere in
// the file. The (^|[^:]) guard keeps protocol strings (http://) intact.
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/gm, (m, pre) =>
    m.startsWith('/*') ? m.replace(/[^\n]/g, ' ') : (pre ?? ''),
  );
}
