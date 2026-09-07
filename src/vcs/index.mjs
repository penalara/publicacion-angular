import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { GitVcs } from './git.mjs';
import { MercurialVcs } from './mercurial.mjs';

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function createVcs(config, cwd = process.cwd()) {
  let type = config.vcs.type;
  if (type === 'auto') {
    if (await exists(resolve(cwd, '.git'))) type = 'git';
    else if (await exists(resolve(cwd, '.hg'))) type = 'mercurial';
    else throw new Error('No se ha detectado un repositorio Git o Mercurial.');
  }
  if (type === 'git') return new GitVcs(cwd);
  if (type === 'mercurial') return new MercurialVcs(cwd);
  throw new Error(`Sistema de control de versiones no soportado: ${type}`);
}
