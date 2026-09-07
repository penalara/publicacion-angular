import { loadPublicationConfig } from './config.mjs';
import { runRelease, inferVersionMode } from './release.mjs';
import { createVcs } from './vcs/index.mjs';

export function parseArguments(args) {
  let explicitMode;
  let resume = false;
  let allowNonstandardSource = false;
  const positional = [];
  for (const argument of args) {
    if (argument === '--new-version' || argument === '--no-version') {
      const mode = argument.slice(2);
      if (explicitMode && explicitMode !== mode) {
        throw new Error('--new-version y --no-version son mutuamente excluyentes.');
      }
      explicitMode = mode;
    } else if (argument === '--resume') {
      resume = true;
    } else if (argument === '--allow-nonstandard-source') {
      allowNonstandardSource = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`Opcion desconocida: ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  if (positional.length < 2 || positional.length > 3) {
    throw new Error(
      'Uso: penalara-publicacion <proyecto> <entorno> [version] [--new-version|--no-version] [--resume]',
    );
  }
  return {
    project: positional[0],
    environment: positional[1],
    requestedVersion: positional[2],
    explicitMode,
    resume,
    allowNonstandardSource,
  };
}

export async function runCli(args, { cwd = process.cwd(), log = console.log } = {}) {
  const options = parseArguments(args);
  const config = await loadPublicationConfig(options.project, options.environment, { cwd });
  const vcs = await createVcs(config, cwd);
  const currentBranch = await vcs.currentBranch();
  const mode = inferVersionMode({
    explicitMode: options.explicitMode,
    currentBranch,
    versionBranch: config.versionBranch,
  });
  await runRelease({ ...options, config, vcs, mode, cwd, log });
}
