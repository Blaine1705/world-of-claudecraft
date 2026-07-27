import ts from 'typescript';

// The statement-level call walk a coordinator gate needs: given one TypeScript source
// and the name of a method on a class inside it, return every call that method makes AT
// STATEMENT POSITION, each tagged with the chain of `if` conditions that must hold for
// it to run.
//
// It exists because #2498 asked a question no per-file source scan can answer: which
// windows does `Hud.update()` actually drive, and how often? The cadence is not a
// property of the window module, it is a property of the CALL SITE, and the call site
// lives inside a 677-line method on a 742-member coordinator. A grep answers it wrong
// in both directions: searching for `this.arenaWindow.render(` finds the call but not
// the `if (mediumHud)` wrapping it, and it also finds the identical call inside
// `openArena()`, which is an event handler and not a poll at all.
//
// THE UNIT IS A STATEMENT, NOT A LINE. Three distinctions carry the whole gate:
//   - STATEMENT POSITION. `this.actionBarPainter.paint(this.actionBarView.tick(...))`
//     is ONE drive, not two: the inner `tick` is an argument the painter consumes. A
//     call inside a callback (`setTimeout(() => this.foo(), 8000)`) is not a drive of
//     `update()` at all, it is a one-shot the callback owns, so the walk descends into
//     statement containers and never into a function body.
//   - THE CONDITION CHAIN, outermost first. `mediumHud` alone is the band; the
//     `$('#arena-window').style.display === 'block'` nested inside it is the gate. The
//     gate is the interesting half, and dropping either one loses the meaning.
//   - THE `else` ARM, recorded as `!(cond)`. `update()` paints the target frame in the
//     consequent and hides it in the alternate; a walk that merged the two would claim
//     the frame is painted unconditionally.
//
// WHY THE COMPILER API AND NOT A HAND-ROLLED SCAN. The first cut of this module lexed
// the file itself and got a working answer, and it was still the wrong instrument: it
// had to guess regex-versus-division from the preceding token, because `src/ui/hud.ts`
// holds about a hundred regex literals in its server-text matchers and several contain
// an apostrophe or an escaped slash that desynchronize a naive walk. It also read 752
// class members where the real count is 742, since a generic type argument's `;` reads
// as a member break. Neither error is visible from a green test. `tests/
// companion_read_api.test.ts` already parses a source file with `ts.createSourceFile`
// and already climbs parents looking for the enclosing `if`, so the AST is this repo's
// established answer for exactly this question and needs no new dependency.
//
// It takes a STRING rather than a path and knows nothing about `src/ui/hud.ts`, which
// is what lets the paired test drive it over synthetic sources with planted shapes.
// This repo's standing lesson about scan guards (#2499, #2502, #2497) is that a
// producer which resolves its own input can only ever be proven against the tree it
// already passes on.

/** One statement-position call found inside a method body. */
export interface CallSite {
  /**
   * The callee's member chain, written as the source writes it and rooted at whatever
   * the statement starts with: `this.updateMinimap`, `this.spellbookWindow.tickOpen`,
   * `document.getElementById().classList.toggle`. An intermediate call keeps its `()`
   * so an element lookup stays distinguishable from the write made on its result; an
   * index access becomes `[]`, and an optional `?.` link reads as a plain `.`, so the
   * key does not move when a null check is added.
   *
   * Deliberately NOT restricted to `this`: `document.getElementById('x')?.classList
   * .toggle(...)` is a raw write on the polled path just as much as a call on a field
   * is, and a registry that only knew about `this` would hand a new repaint a free way
   * out of the sweep.
   */
  readonly call: string;
  /** 1-based line of the statement in the source file. */
  readonly line: number;
  /**
   * The enclosing `if` conditions, OUTERMOST FIRST, each whitespace-normalized. An
   * `else` arm carries its `if`'s condition wrapped as `!(cond)`. Empty means the call
   * runs every time the method does.
   */
  readonly conditions: readonly string[];
}

/** What {@link readMethodCallSites} resolved out of one class method. */
export interface MethodScan {
  /** Every statement-position call in the method body, in source order. */
  readonly sites: readonly CallSite[];
  /** How many members the enclosing class declares (methods, fields, accessors). */
  readonly classMembers: number;
  /** Lines spanned by the method body, braces included. */
  readonly bodyLines: number;
  /** 1-based line the method's own declaration starts on. */
  readonly declarationLine: number;
}

/**
 * Reduce a condition to the ONE spelling every formatting of it shares.
 *
 * A registry pins these strings, so the normalization is load-bearing rather than
 * cosmetic: biome at lineWidth 100 breaks a long condition across lines the moment it
 * grows a character, and when it does it ALSO adds a trailing comma to the argument
 * list it broke. A key that kept either would flip on a reformat, and a gate that flips
 * on a reformat gets its expected value pasted over rather than read. So: comments go,
 * whitespace runs collapse to one space, padding inside brackets goes, and a comma
 * directly before a closing bracket goes with it.
 */
export function normalizeCondition(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/([([])\s+/g, '$1')
    .replace(/\s+([)\]])/g, '$1')
    .replace(/\s+,/g, ',')
    .replace(/,([)\]])/g, '$1')
    .trim();
}

/**
 * The callee's member chain, or `null` when the expression is not a plain member chain
 * (a call on a parenthesized ternary, an `await`ed promise, a computed callee).
 * Returning null rather than a best guess is deliberate: a registry keyed on a guessed
 * name would silently pair the wrong row with the wrong call.
 */
function calleeChain(expr: ts.Expression, sf: ts.SourceFile): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (ts.isPropertyAccessExpression(expr)) {
    const head = calleeChain(expr.expression, sf);
    return head === null ? null : `${head}.${expr.name.text}`;
  }
  if (ts.isElementAccessExpression(expr)) {
    const head = calleeChain(expr.expression, sf);
    return head === null ? null : `${head}[]`;
  }
  if (ts.isCallExpression(expr)) {
    const head = calleeChain(expr.expression, sf);
    return head === null ? null : `${head}()`;
  }
  if (ts.isNonNullExpression(expr) || ts.isParenthesizedExpression(expr)) {
    return calleeChain(expr.expression, sf);
  }
  return null;
}

/** Unwrap the wrappers that can sit between a statement and the call it makes. */
function callOf(expr: ts.Expression): ts.CallExpression | null {
  if (ts.isCallExpression(expr)) return expr;
  if (ts.isAwaitExpression(expr) || ts.isVoidExpression(expr)) return callOf(expr.expression);
  return null;
}

interface Walk {
  readonly sf: ts.SourceFile;
  readonly out: CallSite[];
}

function lineOf(w: Walk, node: ts.Node): number {
  return w.sf.getLineAndCharacterOfPosition(node.getStart(w.sf)).line + 1;
}

/**
 * Visit ONE statement, carrying the conditions that guard it.
 *
 * Descends only through STATEMENT containers. A function or arrow body reached from an
 * expression is a different cadence with a different owner, so it is deliberately out
 * of reach here; a module that arms its own repeating driver is the painter gate's
 * business (`FRAME_DRIVERS` in `tests/hud_perf_budget.test.ts`), not this walk's.
 */
function visitStatement(w: Walk, stmt: ts.Statement, conditions: readonly string[]): void {
  if (ts.isBlock(stmt)) {
    for (const inner of stmt.statements) visitStatement(w, inner, conditions);
    return;
  }
  if (ts.isIfStatement(stmt)) {
    const cond = normalizeCondition(stmt.expression.getText(w.sf));
    visitStatement(w, stmt.thenStatement, [...conditions, cond]);
    if (stmt.elseStatement) visitStatement(w, stmt.elseStatement, [...conditions, `!(${cond})`]);
    return;
  }
  if (
    ts.isForStatement(stmt) ||
    ts.isForOfStatement(stmt) ||
    ts.isForInStatement(stmt) ||
    ts.isWhileStatement(stmt) ||
    ts.isDoStatement(stmt) ||
    ts.isLabeledStatement(stmt)
  ) {
    visitStatement(w, stmt.statement, conditions);
    return;
  }
  if (ts.isTryStatement(stmt)) {
    visitStatement(w, stmt.tryBlock, conditions);
    if (stmt.catchClause) visitStatement(w, stmt.catchClause.block, conditions);
    if (stmt.finallyBlock) visitStatement(w, stmt.finallyBlock, conditions);
    return;
  }
  if (ts.isSwitchStatement(stmt)) {
    for (const clause of stmt.caseBlock.clauses) {
      for (const inner of clause.statements) visitStatement(w, inner, conditions);
    }
    return;
  }
  if (ts.isExpressionStatement(stmt)) {
    const call = callOf(stmt.expression);
    if (!call) return;
    const chain = calleeChain(call.expression, w.sf);
    if (chain === null) return;
    w.out.push({ call: chain, line: lineOf(w, stmt), conditions: [...conditions] });
  }
}

/**
 * Scan `class <className>`'s `<methodName>` for its statement-position calls.
 *
 * Throws when the class or the method is absent. That is the point: the coordinator
 * gate calling this exists because a future extraction could move `update()` behind a
 * controller, and a resolver that returned an empty list for a missing method would
 * hand that gate a clean, empty, passing scan. A rename must be a red test, never a
 * quiet zero.
 */
export function readMethodCallSites(
  fileName: string,
  source: string,
  className: string,
  methodName: string,
): MethodScan {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const cls = sf.statements.find(
    (s): s is ts.ClassDeclaration => ts.isClassDeclaration(s) && s.name?.text === className,
  );
  if (!cls) {
    throw new Error(
      `class ${className} not found in ${fileName}: it was renamed or moved. Re-point the guard at its new home rather than deleting the read.`,
    );
  }
  const method = cls.members.find(
    (m): m is ts.MethodDeclaration =>
      ts.isMethodDeclaration(m) && m.name.getText(sf) === methodName,
  );
  if (!method) {
    throw new Error(
      `${className}.${methodName}() not found in ${fileName}: it was renamed or extracted. Re-point the guard at its new home rather than deleting the read.`,
    );
  }
  if (!method.body) {
    throw new Error(`${className}.${methodName}() has no body in ${fileName}`);
  }
  const w: Walk = { sf, out: [] };
  for (const stmt of method.body.statements) visitStatement(w, stmt, []);
  const bodyStart = sf.getLineAndCharacterOfPosition(method.body.getStart(sf)).line;
  const bodyEnd = sf.getLineAndCharacterOfPosition(method.body.getEnd()).line;
  return {
    sites: w.out,
    classMembers: cls.members.length,
    bodyLines: bodyEnd - bodyStart + 1,
    declarationLine: lineOf(w, method),
  };
}
