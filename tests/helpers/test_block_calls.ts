import ts from 'typescript';

// Every vitest block call (`describe`, `it`, `test`, `suite`) in one source, each
// tagged with the block that encloses it.
//
// It exists for #2506: `tests/gathering.test.ts` carried a second, byte-identical
// copy of two describe blocks, and `tests/fixes.test.ts` carried a second copy of
// two more. Vitest registers duplicate titles without complaint, so both copies
// ran and the only cost visible from a green suite was wall-clock. The real cost
// is that a reader cannot tell which copy is authoritative, and someone adding a
// case to "the" block has even odds of adding it to the copy nobody reads.
//
// The gathering pair is a RECURRENCE. Commit a1a8cfd56 already deleted the same
// 80 lines once, and its own message records the release/v0.23.0 merge putting
// them back. That is the shape of this defect: a merge re-inserting a block
// VERBATIM, which is why byte-identical is the right thing to detect and a
// looser similarity measure would only add false positives.
//
// WHY THE COMPILER API AND NOT A LEXER. Same reason as helpers/method_call_sites.ts
// (#2516), and the corpus here is far worse: this walk reads all 1600-odd test
// sources, which between them hold regex literals, apostrophes in titles, template
// strings and nested braces in every combination. A hand-rolled scan has to guess
// regex-versus-division and gets a working-looking answer that is wrong in ways no
// green test can show. `typescript` is already a devDependency and
// `tests/companion_read_api.test.ts` set the precedent.
//
// It takes a STRING rather than a path and knows nothing about `tests/`, which is
// what lets the paired test drive it over synthetic sources with planted shapes.
// This repo's standing lesson about scan guards (#2499, #2502, #2516) is that a
// producer which resolves its own input can only ever be proven against the tree
// it already passes on.

/**
 * The vitest identifiers a block call is rooted at.
 *
 * `suite` is vitest's alias for `describe` and `test` for `it`; all four are live
 * in this repo, so leaving any of them out would take a whole family of blocks
 * out of the scan with nothing to show for it.
 */
export const BLOCK_HEADS: readonly string[] = ['describe', 'it', 'test', 'suite'];

/**
 * The property links allowed between the head and the call, and the WHOLE
 * discriminator between a block and an ordinary method call.
 *
 * It has to be an allowlist rather than "walk the property chain to its root",
 * because this repo's controller suites bind a local rig to the name `test`
 * (`tests/quest_tracker_controller.test.ts`, `tests/loot_roll_controller.test.ts`
 * and eight more). `test.controller.update()` roots at the identifier `test`
 * exactly like `test.each([...])(...)` does, and a root-only rule reads 45 of
 * those rig calls as blocks. Worse, it reads them as byte-identical DUPLICATE
 * blocks whenever a suite calls `test.controller.update()` twice, which is
 * ordinary and correct. Requiring every link to be a modifier drops all 45 with
 * no exception list.
 *
 * Only `each`, `runIf`, `skipIf` and `sequential` are used in the tree today. The
 * rest are vitest's remaining modifiers, listed because a MISSING one fails
 * silently: the head stops resolving, those blocks leave the scan, and the guard
 * stays green over a smaller surface. `duplicate_test_blocks.test.ts` pins the
 * chains this list does NOT resolve, so a modifier arriving in a vitest upgrade
 * fails loudly instead.
 */
export const BLOCK_MODIFIERS: readonly string[] = [
  'concurrent',
  'each',
  'extend',
  'fails',
  'for',
  'only',
  'runIf',
  'scoped',
  'sequential',
  'skip',
  'skipIf',
  'todo',
];

/** One `describe`/`it`/`test`/`suite` call found by {@link testBlockCalls}. */
export interface TestBlockCall {
  /** The vitest identifier the call is rooted at: `describe`, `it`, `test` or `suite`. */
  readonly head: string;
  /**
   * The property links between the head and the call, in SOURCE order: `[]` for
   * `describe(...)`, `['each']` for `it.each(table)(...)`. Source order rather
   * than resolution order, so a chain reads back the way it is written.
   */
  readonly chain: readonly string[];
  /**
   * Which block encloses this one. `'root'` for a top-level block, otherwise the
   * enclosing block's start offset. Two blocks are siblings when this matches,
   * which is the only comparison a duplicate check may make: the same `it` body
   * under two DIFFERENT describes is ordinary (each parent brings its own
   * `beforeEach`), while the same body twice under one parent is the defect.
   */
  readonly parent: string;
  /** The call's source text, verbatim, from the head through the closing paren. */
  readonly text: string;
  /** 1-based line of the call's first character. */
  readonly line: number;
  /** 1-based line of the call's last character. */
  readonly endLine: number;
}

/**
 * A call rooted at a block head that {@link testBlockCalls} did NOT resolve,
 * because one of its property links is not in {@link BLOCK_MODIFIERS}.
 *
 * Almost all of these are the local `test` rig described above, so this is a
 * diagnostic rather than an error. It is narrowed to calls that take a CALLBACK,
 * which is what every real block takes and what no rig accessor does, so a
 * modifier this module has not heard of shows up here as a short, readable list
 * instead of being buried under 45 rig calls.
 */
export interface UnresolvedBlockCall {
  readonly head: string;
  /** The unresolved property chain as written, e.g. `some.scheduled`. */
  readonly chain: string;
  readonly line: number;
}

const isModifier = (name: string): boolean => BLOCK_MODIFIERS.includes(name);

/**
 * Resolve a callee to the identifier it is rooted at, collecting the property
 * links on the way. Returns the root even when a link is not a modifier; the
 * caller decides what to do with a chain it does not recognize.
 */
function resolveHead(expr: ts.Expression, chain: string[]): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    chain.unshift(expr.name.text);
    return resolveHead(expr.expression, chain);
  }
  // `it.each(table)('name %s', fn)`: the callee is itself a call.
  if (ts.isCallExpression(expr)) return resolveHead(expr.expression, chain);
  if (ts.isTaggedTemplateExpression(expr)) return resolveHead(expr.tag, chain);
  return null;
}

/**
 * True when `node` is a link in a longer callee chain rather than the call that
 * actually registers a block.
 *
 * `it.each([0, 2])('...', fn)` holds two CallExpressions, and only the outer one
 * is a block. Recording the inner one instead is not a harmless extra row: the
 * inner call is just `it.each([0, 2])`, so two cases sharing a table are
 * byte-identical there while their real bodies differ completely. That single
 * mistake produced 45 of the 47 findings the first cut of this scan reported.
 */
function isCalleeLink(node: ts.CallExpression): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isCallExpression(parent) && parent.expression === node) return true;
  if (ts.isTaggedTemplateExpression(parent) && parent.tag === node) return true;
  return ts.isPropertyAccessExpression(parent);
}

const takesCallback = (node: ts.CallExpression): boolean =>
  node.arguments.some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));

/**
 * Every block call in `source`, each tagged with the block enclosing it, plus the
 * calls rooted at a block head whose property chain this module does not resolve.
 *
 * `fileName` is only a label for the parser; nothing is read from disk.
 */
export function testBlockCalls(
  source: string,
  fileName = 'source.test.ts',
): { blocks: TestBlockCall[]; unresolved: UnresolvedBlockCall[] } {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const blocks: TestBlockCall[] = [];
  const unresolved: UnresolvedBlockCall[] = [];
  const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const visit = (node: ts.Node, parent: string): void => {
    let childParent = parent;
    if (ts.isCallExpression(node) && !isCalleeLink(node)) {
      const chain: string[] = [];
      const head = resolveHead(node.expression, chain);
      if (head !== null && BLOCK_HEADS.includes(head)) {
        const start = node.getStart(sf);
        if (chain.every(isModifier)) {
          blocks.push({
            head,
            chain,
            parent,
            text: source.slice(start, node.getEnd()),
            line: lineOf(start),
            endLine: lineOf(node.getEnd() - 1),
          });
          // Blocks nested inside this one are siblings of each other, not of
          // this block's own siblings.
          childParent = String(start);
        } else if (takesCallback(node)) {
          unresolved.push({ head, chain: chain.join('.'), line: lineOf(start) });
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, childParent));
  };
  visit(sf, 'root');
  return { blocks, unresolved };
}

/** One block that repeats an earlier sibling verbatim. */
export interface DuplicateBlock {
  /** The duplicated block's head, e.g. `describe`. */
  readonly head: string;
  /** The block's first source line, trimmed, as a label a reader can grep for. */
  readonly title: string;
  /** 1-based `start-end` line range of the copy that comes first. */
  readonly first: string;
  /** 1-based `start-end` line range of the repeat. */
  readonly repeat: string;
}

/**
 * Every block in `source` whose text repeats an earlier SIBLING's, byte for byte.
 *
 * Byte-identical, and deliberately not a similarity measure: the defect this
 * detects is a merge re-inserting a block verbatim (#2506, and a1a8cfd56 before
 * it), so exact text is both what the defect produces and the only rule with no
 * false positives. A same-title check would be a different guard and a red one:
 * `tests/professions_crafting.test.ts` names two DIFFERENT blocks
 * `self-gathered crafting bonus (#1145)`, which is a naming question, not a
 * duplicated block.
 */
export function duplicateSiblingBlocks(source: string, fileName?: string): DuplicateBlock[] {
  const { blocks } = testBlockCalls(source, fileName);
  const seen = new Map<string, TestBlockCall>();
  const out: DuplicateBlock[] = [];
  for (const block of blocks) {
    const key = `${block.parent} ${block.text}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, block);
      continue;
    }
    out.push({
      head: block.head,
      title: block.text.split('\n')[0].trim(),
      first: `${first.line}-${first.endLine}`,
      repeat: `${block.line}-${block.endLine}`,
    });
  }
  return out;
}
