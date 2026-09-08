import { relative } from 'node:path';
import { runProcess } from '../process.mjs';

export class MercurialVcs {
  type = 'mercurial';
  defaultRemote = 'default';
  #cwd;
  #run;

  constructor(cwd, run = runProcess) {
    this.#cwd = cwd;
    this.#run = run;
  }

  async #hg(args, options = {}) {
    return this.#run('hg', args, { cwd: this.#cwd, ...options });
  }

  async currentBranch() { return (await this.#hg(['branch'])).stdout.trim(); }
  async revision() { return (await this.#hg(['log', '-r', '.', '--template', '{node}'])).stdout.trim(); }
  async shortRevision() { return (await this.#hg(['log', '-r', '.', '--template', '{node|short}'])).stdout.trim(); }
  async status() { return (await this.#hg(['status'])).stdout.trim(); }

  async assertClean() {
    const status = await this.status();
    if (status) throw new Error(`El workspace Mercurial debe estar limpio antes de publicar:\n${status}`);
  }

  async assertOnlyPackageChanged(packagePath) {
    const expected = relative(this.#cwd, packagePath).replaceAll('\\', '/');
    const lines = (await this.status()).split('\n').filter(Boolean);
    if (lines.length !== 1 || lines[0].slice(2).replaceAll('\\', '/') !== expected) {
      throw new Error(`El build ha modificado archivos distintos de ${expected}.`);
    }
  }

  async fetch(remote = this.defaultRemote) { await this.#hg(['pull', remote], { stdio: 'inherit' }); }

  async branchExists(branch) {
    const branches = (await this.#hg(['branches', '--template', '{branch}\n'])).stdout
      .split(/\r?\n/u)
      .filter(Boolean);
    return branches.includes(branch);
  }

  async checkout(branch) {
    await this.#branchHead(branch);
    await this.#hg(['update', branch], { stdio: 'inherit' });
  }

  async assertMergePreservesSource(publicationBranch, sourceRevision) {
    const publicationRevision = await this.#branchHead(publicationBranch);
    let ancestor;
    try {
      ancestor = (await this.#hg([
        'log',
        '-r',
        `ancestor(${sourceRevision}, ${publicationRevision})`,
        '--template',
        '{node}',
      ])).stdout.trim();
      if (ancestor === '') {
        throw new Error('Mercurial no devolvio un ancestro comun.');
      }
    } catch (error) {
      throw new Error(
        `La rama de publicacion "${publicationBranch}" no comparte un ancestro valido con la rama origen.`,
        { cause: error },
      );
    }
    const differences = (await this.#hg([
      'status',
      '--rev',
      ancestor,
      '--rev',
      publicationRevision,
    ])).stdout.trim();
    if (differences !== '') {
      throw new Error(
        `La rama de publicacion "${publicationBranch}" contiene cambios de contenido posteriores al ancestro comun. Fusione o resuelva esos cambios antes de publicar.`,
      );
    }
  }

  async commitVersion(packagePath, message) {
    const path = relative(this.#cwd, packagePath).replaceAll('\\', '/');
    await this.#hg(['commit', '-m', message, path], { stdio: 'inherit' });
  }

  async createTag(tag) { await this.#hg(['tag', '-m', tag, tag], { stdio: 'inherit' }); }

  async tagExists(tag) {
    const tags = (await this.#hg(['tags', '--template', '{tag}\n'])).stdout.split(/\r?\n/u);
    return tags.includes(tag);
  }

  async tagExistsRemote(tag, remote = this.defaultRemote) {
    return (await this.#hg(['identify', '-r', tag, remote], {
      allowedExitCodes: [0, 1, 255],
    })).exitCode === 0;
  }

  async merge(revision) {
    await this.#hg(['merge', '--tool', ':merge', '-r', revision], { stdio: 'inherit' });
  }

  async abortMerge() {
    await this.#hg(['merge', '--abort'], { allowedExitCodes: [0, 1], stdio: 'inherit' });
  }

  async treeMatches(revision) {
    return (await this.#hg(['status', '--rev', revision])).stdout.trim() === '';
  }

  async commitPublication(message, { empty = false } = {}) {
    const args = ['commit', '-m', message];
    if (empty) args.unshift('--config', 'ui.allowemptycommit=True');
    await this.#hg(args, { stdio: 'inherit' });
  }

  async includesRevision(revision) {
    const ancestor = (await this.#hg([
      'log',
      '-r',
      `ancestor(${revision}, .)`,
      '--template',
      '{node}',
    ])).stdout.trim();
    return ancestor === revision;
  }

  async currentMessage() {
    return (await this.#hg(['log', '-r', '.', '--template', '{desc|firstline}'])).stdout.trim();
  }

  async push({ remote = this.defaultRemote }) {
    await this.#hg(['push', remote], { stdio: 'inherit' });
  }

  async #branchHead(branch) {
    const heads = (await this.#hg(['heads', branch, '--template', '{node}\n'])).stdout
      .split(/\r?\n/u)
      .filter(Boolean);
    if (heads.length !== 1) {
      throw new Error(`La rama Mercurial "${branch}" debe tener exactamente una cabeza abierta.`);
    }
    return heads[0];
  }
}
