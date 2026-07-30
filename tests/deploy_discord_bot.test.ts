import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dockerfile = readFileSync('Dockerfile', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');
const compose = readFileSync('docker-compose.yml', 'utf8');
const composeEnv = (name: string) => `$${`{${name}:-}`}`;
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };
const buildBot = readFileSync(new URL('../scripts/build_bot.mjs', import.meta.url), 'utf8');
const tsconfig = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8')) as {
  include: string[];
};

describe('Discord bot deploy container contract', () => {
  it('builds and ships the bundled Discord bot artifact', () => {
    expect(dockerfile).toContain('COPY bot ./bot');
    expect(dockerfile).toContain('npm run build:bot');
    expect(dockerfile).toContain('COPY --from=build /app/dist-bot ./dist-bot');
  });

  it('keeps the Discord bot build script in the Docker build context', () => {
    expect(dockerignore).toContain('!scripts/build_bot.mjs');
  });

  it('runs the Discord bot as a separate compose service', () => {
    expect(compose).toContain('discord-bot:');
    expect(compose).toContain('container_name: eastbrook-discord-bot');
    expect(compose).toContain('command: ["node", "dist-bot/bot.cjs"]');
    expect(compose).toContain('GAME_SERVER_URL: http://game:8787');
    expect(compose).toContain(`DISCORD_BOT_TOKEN: ${composeEnv('DISCORD_BOT_TOKEN')}`);
  });

  it('passes the shared Discord bot secret to the game server', () => {
    expect(compose).toContain(`DISCORD_BOT_SECRET: ${composeEnv('DISCORD_BOT_SECRET')}`);
  });
});

describe('Discord bot build and typecheck surface', () => {
  it('bundles bot/main.ts to the exact artifact the compose command runs', () => {
    // The deploy contract has three legs and only two were pinned: the
    // Dockerfile runs build:bot and copies dist-bot, and compose runs
    // `node dist-bot/bot.cjs`. Nothing said what build:bot actually produces,
    // so repointing the entry or the outfile (or neutering the script) left the
    // image assembling cleanly and the container failing to start on the host.
    expect(packageJson.scripts['build:bot']).toBe('node scripts/build_bot.mjs');
    expect(buildBot).toContain("entryPoints: ['bot/main.ts']");
    expect(buildBot).toContain("outfile: 'dist-bot/bot.cjs'");
  });

  it('keeps bot/ inside the typecheck surface', () => {
    // This is the headline deliverable of the stability packet's first phase,
    // and it is one word in one array. Removing it is completely silent:
    // build:bot is esbuild, which does not typecheck, and `npm run check:types`
    // would simply check a smaller file set and stay green. The bot test suites
    // drag most of bot/ in through their own imports, but bot/main.ts (the
    // wiring) is imported by nothing and would drop out.
    expect(tsconfig.include).toContain('bot');
    // ...and that the gate's typecheck actually reads THAT tsconfig. A bare
    // `tsc --noEmit` defaults to the root tsconfig.json; pointing it at another
    // project file would leave the include above pinning a config nothing runs.
    expect(packageJson.scripts['check:ts']).toBe('tsc --noEmit');
    expect(packageJson.scripts['check:types']).toContain('check:ts');
  });
});
