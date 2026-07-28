// The one shipped world seed. World of ClaudeCraft is a persistent place:
// every host that builds THE world (the offline client in src/main.ts, the
// authoritative server in server/game.ts) and every test that asserts world
// geometry against it must use the same number, so it lives here once.
// Three private copies of this literal used to exist (main.ts, game.ts, the
// gather-node placement suite), which is exactly how one host's world could
// have silently diverged from another's.
export const WORLD_SEED = 20061;
