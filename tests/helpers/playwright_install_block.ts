/** The exact Install Chromium run block both browser jobs must carry
 *  (ci.yml browser-gate and nightly.yml browser), pinned as one block scalar
 *  so a step comment cannot satisfy the pin, the hard-failing browser install
 *  cannot grow a fallback, and the bounded install-deps retry shape (120s
 *  then 60s, -k so a TERM-ignoring hang cannot defeat the bound) cannot
 *  drift silently. Ruling and sizing: the step comment in ci.yml and the
 *  2026-08-19 merge-queue rejections it cites. */
export const PLAYWRIGHT_INSTALL_BLOCK = [
  'run: |',
  '          npx playwright install chromium',
  '          timeout -k 15 120 npx playwright install-deps chromium \\',
  '            || timeout -k 15 60 npx playwright install-deps chromium \\',
  `            || echo "install-deps unavailable (last exit $?); relying on the runner image's browser libraries"`,
].join('\n');
