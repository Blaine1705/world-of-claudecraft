// The shared bareClient fixture (tests/helpers/bare_client.ts) claims to
// mirror every field ClientWorld declares a static default for
// (Object.create skips the constructor, so class-field initializers never
// run). That claim was unenforced, and the release's playtimeSeconds class
// field landed without the fixture noticing (caught in the Phase 16 QA
// sync audit). This sweep scrapes the class-field declarations out of
// src/net/online.ts and asserts the fixture defines each one, so the next
// class field cannot drift the shared fixture silently.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bareClient } from './helpers/bare_client';

describe('bareClient mirrors ClientWorld class-field defaults', () => {
  it('defines every field the class declares with an initializer', () => {
    const src = readFileSync(join(__dirname, '../src/net/online.ts'), 'utf8');
    // Comments stripped so a commented-out field cannot join the scrape (the
    // `(^|[^:])` guard keeps protocol `://` strings intact).
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const classStart = stripped.indexOf('export class ClientWorld');
    expect(classStart, 'premise: the class is where this file expects it').toBeGreaterThanOrEqual(
      0,
    );
    // Bound the scan to this class: stop at the next top-level export.
    const afterClass = stripped.indexOf('\nexport ', classStart + 1);
    const body = stripped.slice(classStart, afterClass === -1 ? undefined : afterClass);
    // Class-field declarations with initializers: two-space indent, optional
    // modifiers, a plain name, an optional type annotation, ` = `. Method
    // bodies indent deeper, so their assignments do not match. Arrow-function
    // fields (bound listeners like handleVisibilityChange) are EXCLUDED: they
    // close over the constructor's wiring and no bare-client suite drives
    // them; the negative lookahead skips initializers that open with `(`.
    const re =
      /^ {2}(?:private |protected |public |readonly |override )*([A-Za-z_]\w*)(?:\??: [^=\n]+)? = (?!\(|async \()/gm;
    const fields = new Set<string>();
    for (let m = re.exec(body); m !== null; m = re.exec(body)) fields.add(m[1]);
    expect(fields.size, 'anti-vacuity: the scrape really found the field block').toBeGreaterThan(
      30,
    );
    expect(fields.has('playtimeSeconds'), 'the field that motivated this sweep').toBe(true);
    const c = bareClient(1) as unknown as Record<string, unknown>;
    const missing = [...fields].filter((f) => !(f in c));
    expect(
      missing,
      `bareClient is missing ClientWorld class-field defaults:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});
