# Phase 13: Step-up authorization for custody-moving operations

Follow the shared workflow in `implementation-plan.md` first; `state.md` has the
validation matrix and ruling R1. This file is the phase spec. RULING GATE: confirm R1
with Fernando at session start before writing code; the deliverables below assume the
recommended posture (wallet-signature step-up, TOTP scaffolding deleted). If he rules
otherwise, adapt and record the delta in state.md.

- Repo: game. Worktree `/Users/fernando/Documents/wocc-marketplace`, branch `feature/woc-marketplace`.
- Closes: B6; also resolves the browser-only-gate server posture medium.
- review.md: B6, Medium "Browser-only gate is client-only".

## Goal

A stolen session bearer alone can no longer move item custody: listing and directed
acceptance require proof of wallet control, and no phantom security scaffolding ships.

## Findings context (verified 2026-08-11)

- B6: TOTP exists as error codes (`error_codes.ts:250`), an env knob
  (`WOC_MARKET_TOTP_THRESHOLD_CENTS`), i18n strings, and `.wm-totp` CSS, with ZERO
  server enforcement. `createListing` and `acceptDirectedOffer` move custody on a
  session bearer alone: a token thief lists a victim's valuables at the $0.25 floor for
  a confederate to buy; the victim's wallet never signs anything.
- The browser-only gate is client-only (`!NATIVE_APP && !DESKTOP_APP` in `main.ts`); the
  server accepts market REST from any authenticated session.

## Deliverables

1. Server enforcement: `createListing` and `acceptDirectedOffer` require a fresh
   server-issued challenge signed by the account's LINKED wallet, verified server-side
   (nonce, expiry, single-use, bound to the operation and its item + price so a
   signature cannot be replayed onto a different action). Decide the threshold posture
   with Fernando in the R1 conversation: recommended default is step-up on EVERY
   custody-moving call (no threshold), with the env threshold retained only if he wants
   a floor; unset env must mean MORE protection, never none.
2. Client UX: the step-up prompt in the listing and acceptance flows (browser wallet
   signMessage), honest pending/failure states, English catalog keys, mobile-safe
   layout.
3. Delete the phantom TOTP scaffolding end to end: error codes, env knob, i18n rows,
   `.wm-totp` CSS, and every reference (or, if R1 rules TOTP, implement it for real;
   either way nothing half-exists afterward).
4. Server-side posture note: with signature required, custody-moving ops are inherently
   wallet-capable-client gated; assert in a test that a bearer-only request (no
   signature) is refused regardless of client type, closing the browser-only-gate gap
   for the paths that matter.

## Out of scope

Bids and buy-now payment flows (they already require wallet payment signatures); the
wallet-link flow itself.

## Validation

`npx tsc --noEmit`; new auth tests + marketplace suites; the S3 guard
(`tests/localization_fixes.test.ts`) for the new player text; `npm run ci:changed`;
commit, then `node scripts/gate_select.mjs`.

## Reviewers

`privacy-security-review` (challenge protocol: replay, binding, expiry),
`frontend-seam-reviewer` (the prompt UX), `cross-platform-sync` (new wire/commands),
`test-coverage-auditor`. `qa-checklist` last.

## Acceptance criteria

- [ ] Bearer-only createListing and acceptDirectedOffer refuse (tested); signed
      requests succeed; replayed/expired/cross-bound signatures refuse (each tested)
- [ ] The prompt UX ships on desktop and mobile with honest states, English keys
- [ ] Zero TOTP remnants (grep proves it) or a fully real TOTP, per ruling
- [ ] R1 outcome and threshold posture recorded in state.md

## Wrap-up

Update progress.md and state.md (challenge protocol shape for review.md's acceptance
bar). Next file: `docs/woc-marketplace-hardening/phase-13-qa.md`.
