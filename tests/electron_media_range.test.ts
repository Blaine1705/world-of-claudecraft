import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  isUnsatisfiableRange,
  parseByteRange,
  rangeContentType,
  rangedFileResponse,
  rangeResponseHeaders,
} from '../electron/media_range.cjs';

// Byte-range support for the app:// protocol handler. Chromium's media stack
// requests <audio>/<video> sources with "Range: bytes=0-" and rejects a plain
// 200 re-wrap as MEDIA_ELEMENT_ERROR: Format error, which left every streamed
// music cue silent in the desktop shell while fetch+decodeAudioData SFX kept
// working. These tests pin the parser, the header wire shapes, the real 206
// Response, and the main.cjs handler wiring.

describe('parseByteRange', () => {
  it('parses the open-ended form Chromium media always sends first', () => {
    expect(parseByteRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
  });

  it('parses explicit ranges and clamps the end to the file size', () => {
    expect(parseByteRange('bytes=200-399', 1000)).toEqual({ start: 200, end: 399 });
    expect(parseByteRange('bytes=200-99999', 1000)).toEqual({ start: 200, end: 999 });
    expect(parseByteRange('bytes=0-0', 1000)).toEqual({ start: 0, end: 0 });
  });

  it('parses the suffix form as the final N bytes, clamped to the whole file', () => {
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseByteRange('  bytes=0-  ', 10)).toEqual({ start: 0, end: 9 });
  });

  it('rejects absent, malformed, foreign-unit, and multi-range values', () => {
    expect(parseByteRange(null, 1000)).toBeNull();
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange('', 1000)).toBeNull();
    expect(parseByteRange('bytes=', 1000)).toBeNull();
    expect(parseByteRange('bytes=-0', 1000)).toBeNull();
    expect(parseByteRange('bytes=abc-', 1000)).toBeNull();
    expect(parseByteRange('items=0-1', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-1,5-9', 1000)).toBeNull();
  });

  it('rejects unsatisfiable ranges and empty or invalid sizes', () => {
    expect(parseByteRange('bytes=1000-', 1000)).toBeNull();
    expect(parseByteRange('bytes=9-2', 1000)).toBeNull();
    expect(parseByteRange('bytes=0-', 0)).toBeNull();
    expect(parseByteRange('bytes=0-', -5)).toBeNull();
    expect(parseByteRange('bytes=0-', Number.NaN)).toBeNull();
    expect(parseByteRange('bytes=0-', 10.5)).toBeNull();
  });
});

describe('rangeContentType', () => {
  it('maps the shipped media containers to their literal MIME types', () => {
    expect(rangeContentType('audio/music/vale.mp3')).toBe('audio/mpeg');
    expect(rangeContentType('AUDIO/LOUD.MP3')).toBe('audio/mpeg');
    expect(rangeContentType('a.m4a')).toBe('audio/mp4');
    expect(rangeContentType('a.mp4')).toBe('video/mp4');
    expect(rangeContentType('a.ogg')).toBe('audio/ogg');
    expect(rangeContentType('a.opus')).toBe('audio/ogg');
    expect(rangeContentType('a.wav')).toBe('audio/wav');
    expect(rangeContentType('a.webm')).toBe('video/webm');
  });

  it('returns null for non-media types so they keep the full-response MIME', () => {
    expect(rangeContentType('models/foliage/pine_2.glb')).toBeNull();
    expect(rangeContentType('index.html')).toBeNull();
    expect(rangeContentType('no_extension')).toBeNull();
  });
});

describe('isUnsatisfiableRange', () => {
  it('detects a well-formed range starting at or past EOF', () => {
    expect(isUnsatisfiableRange('bytes=1000-', 1000)).toBe(true);
    expect(isUnsatisfiableRange('bytes=1500-2000', 1000)).toBe(true);
  });

  it('stays false for satisfiable, malformed, or inverted ranges', () => {
    expect(isUnsatisfiableRange('bytes=999-', 1000)).toBe(false);
    expect(isUnsatisfiableRange('bytes=', 1000)).toBe(false);
    expect(isUnsatisfiableRange('bytes=2000-1500', 1000)).toBe(false);
    expect(isUnsatisfiableRange('bytes=-100', 1000)).toBe(false);
    expect(isUnsatisfiableRange(null, 1000)).toBe(false);
    expect(isUnsatisfiableRange('bytes=1000-', 0)).toBe(false);
  });
});

describe('rangeResponseHeaders', () => {
  it('builds the exact 206 wire headers', () => {
    expect(rangeResponseHeaders({ start: 2, end: 5 }, 10, 'audio/mpeg')).toEqual({
      'Content-Type': 'audio/mpeg',
      'Content-Length': '4',
      'Content-Range': 'bytes 2-5/10',
      'Accept-Ranges': 'bytes',
    });
  });
});

describe('rangedFileResponse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wocc-media-range-'));
  const filePath = join(dir, 'ten.mp3');
  writeFileSync(filePath, '0123456789');
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves a 206 with the exact body slice and range headers', async () => {
    const res = await rangedFileResponse(filePath, 'bytes=2-5');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(206);
    expect(await res?.text()).toBe('2345');
    expect(res?.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(res?.headers.get('Content-Length')).toBe('4');
    expect(res?.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res?.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('serves the whole file for the open-ended first media request', async () => {
    const res = await rangedFileResponse(filePath, 'bytes=0-');
    expect(res?.status).toBe(206);
    expect(await res?.text()).toBe('0123456789');
    expect(res?.headers.get('Content-Range')).toBe('bytes 0-9/10');
  });

  it('carries extra headers so the handler keeps its every-response CSP rule', async () => {
    const res = await rangedFileResponse(filePath, 'bytes=0-', {
      'Content-Security-Policy': "default-src 'self'",
    });
    expect(res?.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
  });

  it('returns null on a malformed range so the caller serves the full 200', async () => {
    expect(await rangedFileResponse(filePath, 'bytes=')).toBeNull();
    expect(await rangedFileResponse(filePath, 'bytes=9-2')).toBeNull();
  });

  it('answers a past-EOF range with 416 and the real bounds, never a bare 200', async () => {
    const res = await rangedFileResponse(filePath, 'bytes=10-', {
      'Content-Security-Policy': "default-src 'self'",
    });
    expect(res?.status).toBe(416);
    expect(res?.headers.get('Content-Range')).toBe('bytes */10');
    expect(res?.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
  });

  it('returns null for a non-media extension so the full path keeps its MIME type', async () => {
    const htmlPath = join(dir, 'index.html');
    writeFileSync(htmlPath, '<!doctype html>');
    expect(await rangedFileResponse(htmlPath, 'bytes=0-')).toBeNull();
  });

  it('returns null for a missing file or a directory', async () => {
    expect(await rangedFileResponse(join(dir, 'absent.mp3'), 'bytes=0-')).toBeNull();
    const sub = join(dir, 'sub.mp3');
    mkdirSync(sub);
    expect(await rangedFileResponse(sub, 'bytes=0-')).toBeNull();
  });
});

describe('app:// handler wiring (electron/main.cjs)', () => {
  const main = readFileSync(join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');

  it('imports the range helper', () => {
    expect(main).toContain("require('./media_range.cjs')");
  });

  it('answers ranged requests before the full-response fallback inside the app handler', () => {
    const handlerStart = main.indexOf("protocol.handle('app'");
    const handlerEnd = main.indexOf('function lockDownPermissions');
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    // one registration only, so the slice below is THE handler body
    expect(main.split("protocol.handle('app'").length - 1).toBe(1);
    const handler = main.slice(handlerStart, handlerEnd);
    const rangeRead = handler.indexOf("request.headers.get('range')");
    const rangedCall = handler.indexOf('rangedFileResponse(');
    const fullFallback = handler.indexOf('net.fetch(pathToFileURL(filePath)');
    expect(rangeRead).toBeGreaterThan(-1);
    expect(rangedCall).toBeGreaterThan(rangeRead);
    expect(fullFallback).toBeGreaterThan(rangedCall);
  });
});
