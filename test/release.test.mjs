import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runRelease } from '../src/release.mjs';

class FakeVcs {
  type = 'git';
  defaultRemote = 'origin';
  branch = 'main';
  events = [];
  tags = new Set();

  async assertClean() { this.events.push('clean'); }
  async currentBranch() { return this.branch; }
  async fetch() { this.events.push('fetch'); }
  async branchExists() { return true; }
  async tagExists(tag) { return this.tags.has(tag); }
  async tagExistsRemote() { return false; }
  async assertOnlyPackageChanged() { this.events.push('only-package'); }
  async commitVersion(_path, message) { this.events.push(message); }
  async createTag(tag) { this.tags.add(tag); this.events.push(`tag:${tag}`); }
  async revision() { return 'source-revision'; }
  async shortRevision() { return 'publication'; }
  async checkout(branch) { this.branch = branch; this.events.push(`checkout:${branch}`); }
  async merge() { this.events.push('merge'); }
  async treeMatches() { return true; }
  async commitPublication(message) { this.events.push(message); }
  async includesRevision() { return false; }
  async currentMessage() { return ''; }
  async abortMerge() { this.events.push('abort'); }
  async push() { this.events.push('push'); }
}

const config = {
  name: 'Testing',
  buildScript: 'build:testing',
  artifactPathPattern: 'dist/{language}',
  requiredFile: 'index.html',
  publicationBranch: 'publication-testing',
  versionBranch: 'versions-testing',
  vcs: { type: 'git', remote: 'origin' },
  transport: { type: 'SFTP', remoteDirectory: '/www' },
  remoteLogPath: '/deployment.log',
};

async function fixture(callback) {
  const cwd = await mkdtemp(join(tmpdir(), 'release-'));
  await writeFile(join(cwd, 'package.json'), '{\n  "name": "example-app",\n  "version": "1.0.0"\n}\n');
  try {
    await callback(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test('build precede commit, tag, merge, deploy y push', async () => {
  await fixture(async (cwd) => {
    const vcs = new FakeVcs();
    await runRelease({
      config,
      vcs,
      mode: 'new-version',
      requestedVersion: '1.1.0',
      cwd,
      build: async () => { vcs.events.push('build'); },
      findArtifacts: async () => [{ name: 'es', localDirectory: '/tmp/es' }],
      transportFactory: () => ({}),
      deployPublication: async () => { vcs.events.push('deploy'); },
      log() {},
    });
    assert.deepEqual(vcs.events, [
      'clean',
      'fetch',
      'build',
      'only-package',
      'Preparamos version 1.1.0',
      'tag:example-app-1.1.0',
      'checkout:publication-testing',
      'merge',
      'Publicamos version 1.1.0 en Testing',
      'deploy',
      'push',
      'checkout:main',
    ]);
  });
});

test('un build fallido restaura package.json y no crea historial', async () => {
  await fixture(async (cwd) => {
    const vcs = new FakeVcs();
    await assert.rejects(
      runRelease({
        config,
        vcs,
        mode: 'new-version',
        requestedVersion: '1.1.0',
        cwd,
        build: async () => { throw new Error('build failed'); },
        log() {},
      }),
      /build failed/u,
    );
    assert.equal(JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')).version, '1.0.0');
    assert.deepEqual(vcs.events, ['clean', 'fetch']);
  });
});

test('no-version omite commit de version y tag', async () => {
  await fixture(async (cwd) => {
    const vcs = new FakeVcs();
    await runRelease({
      config,
      vcs,
      mode: 'no-version',
      cwd,
      build: async () => { vcs.events.push('build'); },
      findArtifacts: async () => [{ name: 'es', localDirectory: '/tmp/es' }],
      transportFactory: () => ({}),
      deployPublication: async () => { vcs.events.push('deploy'); },
      log() {},
    });
    assert.equal(vcs.events.includes('Preparamos version 1.0.0'), false);
    assert.equal(vcs.events.some((event) => event.startsWith('tag:')), false);
    assert(vcs.events.indexOf('build') < vcs.events.indexOf('merge'));
  });
});
