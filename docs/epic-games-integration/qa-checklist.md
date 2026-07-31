# Whole-feature QA matrix (packet close)

Run after Phase 8, before calling the Epic integration ready to merge.

## Merge safety (must pass with zero Epic env)

- [ ] `EPIC_ENABLED` unset: server boots; `/api/epic/*` returns `epic.disabled`
- [ ] `/api/status` reports `epic: { enabled: false }`
- [ ] No Epic link UI in web or desktop website builds
- [ ] `npm run electron:build` (website) succeeds without Epic env
- [ ] `npm run electron:build:steam` behavior unchanged when Epic env unset
      (still requires its own Steam env as today)
- [ ] `npm test` / `npm run gate` green without Epic secrets
- [ ] Website and steam packages do not contain EOS native libraries

## Architecture and identity

- [ ] `src/sim/` has zero Epic imports
- [ ] Source scan under `server/epic/`: no `newToken`, no `auth_tokens` session mint
- [ ] Client never trusted to supply its own Epic account id (server verify path)
- [ ] Login remains email + Discord only on all channels

## Channel behavior

- [ ] Packaged `distribution: 'epic'`: updater disabled, wallet handoff disabled
- [ ] Packaged epic ignores `WOC_DISTRIBUTION` / updater env escape hatches
- [ ] Unpackaged `WOC_DISTRIBUTION=epic` works for dev without flipping packaged installs
- [ ] No Linux epic depot or epic linux target in builder config
- [ ] `release-epic/` emits dir layouts suitable for BPT (not store installers)

## Link + mirror (with fakes and, when available, sandbox)

- [ ] Link happy path, invalid proof, upstream fault, already linked, reclaim-by-proof
- [ ] Unlink idempotent
- [ ] Mirror dark when disabled; pushes when enabled + linked + mapped deed
- [ ] Steam mirror still works independently when both enabled
- [ ] Deed unlock path never awaits Epic IO on the hot path

## UI / i18n / copy

- [ ] Advert off hides Epic group entirely
- [ ] Shell capability false hides Link (status/unlink rules match Steam twin)
- [ ] All new player strings are catalog keys; S3 guard green
- [ ] No em dashes, en dashes, or emojis in the packet diff

## Security and secrets

- [ ] Client secret only on server; not in renderer, not in git
- [ ] No secret in logs or error bodies
- [ ] Parameterized SQL for `epic_links`
- [ ] Rate limit on link POST

## Docs and ops

- [ ] `docs/desktop-release.md` documents epic channel
- [ ] DEPLOY.md lists `EPIC_*` keys and dark default
- [ ] BPT upload steps are copy-pasteable for the maintainer
- [ ] Portal checklist lists Win+Mac, IARC, achievements parity

## Final gate

- [ ] `npx tsc --noEmit`
- [ ] Targeted vitest suites for electron epic, server epic, UI epic
- [ ] `npm run ci:changed` on touched files
- [ ] `npm run gate` green in the worktree
- [ ] Reviewers from the implementation-plan matrix run on the full diff
