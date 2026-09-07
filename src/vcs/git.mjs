import { relative } from 'node:path';
import { runProcess } from '../process.mjs';

export class GitVcs {
  type = 'git';
  defaultRemote = 'origin';
  #cwd;
  #run;

  constructor(cwd, run = runProcess) {
    this.#cwd = cwd;
    this.#run = run;
  }

  async #git(args, options = {}) {
    return this.#run('git', args, { cwd: this.#cwd, ...options });
  }

  async currentBranch() {
    const branch = (await this.#git(['branch', '--show-current'])).stdout.trim();
    if (!branch) throw new Error('No se puede publicar desde un HEAD separado de una rama Git.');
    return branch;
  }

  async revision() { return (await this.#git(['rev-parse', 'HEAD'])).stdout.trim(); }
  async shortRevision() { return (await this.#git(['rev-parse', '--short=12', 'HEAD'])).stdout.trim(); }
  async status() { return (await this.#git(['status', '--porcelain'])).stdout.trimEnd(); }

  async assertClean() {
    const status = await this.status();
    if (status) throw new Error(`El workspace Git debe estar limpio antes de publicar:\n${status}`);
  }

  async assertOnlyPackageChanged(packagePath) {
    const expected = relative(this.#cwd, packagePath).replaceAll('\\', '/');
    const lines = (await this.status()).split('\n').filter(Boolean);
    if (lines.length !== 1 || lines[0].slice(3) !== expected) {
      throw new Error(
        `El build ha modificado archivos distintos de ${expected}: ${lines.join(', ') || '(ninguno)'}.`,
      );
    }
  }

  async fetch(remote = this.defaultRemote) { await this.#git(['fetch', '--tags', remote]); }

  async branchExists(branch, remote = this.defaultRemote) {
    const local = await this.#git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      allowedExitCodes: [0, 1],
    });
    if (local.exitCode === 0) return true;
    const remoteBranch = await this.#git(
      ['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`],
      { allowedExitCodes: [0, 1] },
    );
    return remoteBranch.exitCode === 0;
  }

  async checkout(branch, remote = this.defaultRemote) {
    const local = await this.#git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      allowedExitCodes: [0, 1],
    });
    if (local.exitCode === 0) {
      await this.#git(['checkout', branch], { stdio: 'inherit' });
      const remoteBranch = await this.#git(
        ['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`],
        { allowedExitCodes: [0, 1] },
      );
      if (remoteBranch.exitCode === 0) {
        await this.#git(['merge', '--ff-only', `${remote}/${branch}`], { stdio: 'inherit' });
      }
      return;
    }
    await this.#git(['checkout', '--track', '-b', branch, `${remote}/${branch}`], { stdio: 'inherit' });
  }

  async commitVersion(packagePath, message) {
    const path = relative(this.#cwd, packagePath).replaceAll('\\', '/');
    await this.#git(['add', '--', path]);
    await this.#git(['commit', '--only', '-m', message, '--', path], { stdio: 'inherit' });
  }

  async createTag(tag) {
    await this.#git(['tag', '-a', tag, '-m', tag]);
  }

  async tagExists(tag) {
    return (await this.#git(['show-ref', '--verify', '--quiet', `refs/tags/${tag}`], {
      allowedExitCodes: [0, 1],
    })).exitCode === 0;
  }

  async tagExistsRemote(tag, remote = this.defaultRemote) {
    return (await this.#git(['ls-remote', '--exit-code', '--tags', remote, `refs/tags/${tag}`], {
      allowedExitCodes: [0, 2],
    })).exitCode === 0;
  }

  async merge(revision) {
    await this.#git(['merge', '--no-ff', '--no-commit', revision], { stdio: 'inherit' });
  }

  async abortMerge() {
    await this.#git(['merge', '--abort'], { allowedExitCodes: [0, 1], stdio: 'inherit' });
  }

  async treeMatches(revision) {
    return (await this.#git(['diff', '--quiet', revision, '--'], { allowedExitCodes: [0, 1] })).exitCode === 0;
  }

  async commitPublication(message, { empty = false } = {}) {
    const args = ['commit', '-m', message];
    if (empty) args.splice(1, 0, '--allow-empty');
    await this.#git(args, { stdio: 'inherit' });
  }

  async includesRevision(revision) {
    return (await this.#git(['merge-base', '--is-ancestor', revision, 'HEAD'], {
      allowedExitCodes: [0, 1],
    })).exitCode === 0;
  }

  async currentMessage() {
    return (await this.#git(['log', '-1', '--format=%s'])).stdout.trim();
  }

  async push({ remote = this.defaultRemote, sourceBranch, publicationBranch, tag }) {
    const refs = new Set([
      `refs/heads/${sourceBranch}:refs/heads/${sourceBranch}`,
      `refs/heads/${publicationBranch}:refs/heads/${publicationBranch}`,
    ]);
    if (tag) refs.add(`refs/tags/${tag}:refs/tags/${tag}`);
    await this.#git(['push', '--atomic', remote, ...refs], { stdio: 'inherit' });
  }
}
