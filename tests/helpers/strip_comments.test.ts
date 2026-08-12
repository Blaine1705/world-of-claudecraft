import { describe, expect, it } from 'vitest';
import { stripComments } from './strip_comments';

describe('stripComments', () => {
  it('blanks a line comment but keeps the code before it', () => {
    expect(stripComments("const a = 1; // case 'review':")).toBe('const a = 1; ');
  });

  it('blanks a block comment to spaces, preserving line count and columns', () => {
    const out = stripComments('a /* one\ntwo */ b');
    expect(out).toBe('a       \n       b');
    expect(out.split('\n').length).toBe(2);
  });

  it('treats a line comment containing /* as a line comment, not a block opener', () => {
    // The ordering bug this pins: greedy block matching from inside a line
    // comment would swallow everything to the NEXT */ in the file.
    const src = 'keep1(); // has /* inside\nkeep2(); /* real */ keep3();';
    const out = stripComments(src);
    expect(out).toContain('keep1();');
    expect(out).toContain('keep2();');
    expect(out).toContain('keep3();');
    expect(out).not.toContain('inside');
  });

  it('leaves protocol strings intact', () => {
    expect(stripComments("const u = 'https://example.com';")).toBe(
      "const u = 'https://example.com';",
    );
  });
});
