import { loadPublicationConfig } from './config.mjs';
import { runForcedRelease, runRelease, inferVersionMode } from './release.mjs';
import { createVcs } from './vcs/index.mjs';

export function parseArguments(args) {
  let explicitMode;
  let resume = false;
  let allowNonstandardSource = false;
  let noVcsForce = false;
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
    } else if (argument === '--no-vsc-force') {
      noVcsForce = true;
    } else if (argument.startsWith('--')) {
      throw new Error(`Opcion desconocida: ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  if (positional.length < 1 || positional.length > 2) {
    throw new Error(
      'Uso: penalara-publicacion <entorno> [version] [--new-version|--no-version] [--resume] [--no-vsc-force]',
    );
  }
  if (noVcsForce && explicitMode === 'new-version') {
    throw new Error('--no-vsc-force no es compatible con --new-version.');
  }
  if (noVcsForce && positional[1] !== undefined) {
    throw new Error('--no-vsc-force no admite una version posicional.');
  }
  if (noVcsForce && resume) {
    throw new Error('--no-vsc-force no es compatible con --resume.');
  }
  if (noVcsForce && allowNonstandardSource) {
    throw new Error('--no-vsc-force no necesita --allow-nonstandard-source.');
  }
  return {
    environment: positional[0],
    requestedVersion: positional[1],
    explicitMode,
    resume,
    allowNonstandardSource,
    noVcsForce,
  };
}

export async function runCli(
  args,
  {
    cwd = process.cwd(),
    log = console.log,
    loadConfig = loadPublicationConfig,
    vcsFactory = createVcs,
    release = runRelease,
    forcedRelease = runForcedRelease,
  } = {},
) {
  const options = parseArguments(args);
  const config = await loadConfig(options.environment, { cwd });
  if (options.noVcsForce) {
    await forcedRelease({ ...options, config, cwd, log });
    return;
  }
  const vcs = await vcsFactory(config, cwd);
  const currentBranch = await vcs.currentBranch();
  const mode = inferVersionMode({
    explicitMode: options.explicitMode,
    currentBranch,
    versionBranch: config.versionBranch,
  });
  await release({ ...options, config, vcs, mode, cwd, log });
}
