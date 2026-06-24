import { spawnSync } from 'node:child_process';

const mode = process.argv[2] ?? 'build';
if (!['pack', 'build'].includes(mode)) {
  console.error(`unknown electron build mode: ${mode}`);
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronBuilderCommand =
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
const defaultOrigin = 'https://worldofclaudecraft.com';
const env = {
  ...process.env,
  VITE_DESKTOP_APP: '1',
  VITE_DESKTOP_API_ORIGIN: process.env.VITE_DESKTOP_API_ORIGIN ?? defaultOrigin,
};

function run(command, args) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(npmCommand, ['run', 'build']);
run(electronBuilderCommand, mode === 'pack' ? ['--dir'] : []);
